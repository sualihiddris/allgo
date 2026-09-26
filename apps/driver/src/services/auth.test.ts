import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
vi.mock("expo-secure-store", () => ({}));
import { driverAuthService } from "./auth";
import { useDriverStore } from "../store/driverStore";

describe("Driver status request recovery", () => {
  let storage: Map<string, string>;
  beforeEach(async () => {
    vi.useFakeTimers();
    storage = new Map([["driver_access_token", "access"], ["driver_refresh_token", "refresh"]]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    await driverAuthService.init();
    useDriverStore.setState({ isOnline: true, isUpdatingOnline: false });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("ends Updating after a blackholed request without clearing online intent", async () => {
    vi.stubGlobal("fetch", vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("Request timed out")));
    })));
    const result = useDriverStore.getState().toggleOnline();
    expect(useDriverStore.getState().isUpdatingOnline).toBe(true);
    await vi.advanceTimersByTimeAsync(15000);
    expect((await result).success).toBe(false);
    expect(useDriverStore.getState().isUpdatingOnline).toBe(false);
    expect(useDriverStore.getState().isOnline).toBe(true);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { message: "offline" } }))));
    expect((await useDriverStore.getState().toggleOnline()).success).toBe(true);
    expect(useDriverStore.getState().isOnline).toBe(false);
  });

  it("preserves tokens on service failure and coalesces concurrent refresh attempts", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 503 }));
    vi.stubGlobal("fetch", fetch);
    const results = await Promise.all([driverAuthService.refreshTokens(), driverAuthService.refreshTokens()]);
    expect(results).toEqual([false, false]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(storage.get("driver_refresh_token")).toBe("refresh");
    expect(driverAuthService.getAccessToken()).toBe("access");
    fetch.mockResolvedValueOnce(new Response("{}", { status: 401 }));
    await driverAuthService.refreshTokens();
    expect(storage.size).toBe(0);
  });

  it("bounds a stalled response body and allows a later refresh", async () => {
    let body!: ReadableStreamDefaultController;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({ start(controller) { body = controller; } }))));
    const first = driverAuthService.refreshTokens();
    await vi.advanceTimersByTimeAsync(15000);
    expect(await first).toBe(false);
    expect(driverAuthService.getAccessToken()).toBe("access");
    body.error(new Error("closed"));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: {
      accessToken: "new-access", refreshToken: "new-refresh",
    } }))));
    expect(await driverAuthService.refreshTokens()).toBe(true);
    expect(driverAuthService.getAccessToken()).toBe("new-access");
  });

  it("honours cancellation before sending a request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    controller.abort();
    await expect(driverAuthService.authenticatedFetch("http://test", { signal: controller.signal })).rejects.toThrow("cancelled");
    expect(fetch).not.toHaveBeenCalled();
  });
});
