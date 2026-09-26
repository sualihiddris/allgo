import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  permissions: vi.fn(), position: vi.fn(), watch: vi.fn(), send: vi.fn(), invalidate: vi.fn(),
}));
vi.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: mocks.permissions,
  getCurrentPositionAsync: mocks.position, watchPositionAsync: mocks.watch,
  Accuracy: { High: 4 },
}));
vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
vi.mock("./socket", () => ({ default: { sendLocation: mocks.send, invalidatePresence: mocks.invalidate } }));
import locationService from "./location";

describe("Fresh Driver location presence", () => {
  const sample = () => ({ coords: { latitude: 8, longitude: 0 }, timestamp: Date.now() });
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("__DEV__", false);
    mocks.permissions.mockResolvedValue({ status: "granted" });
    mocks.watch.mockResolvedValue({ remove: vi.fn() });
    mocks.position.mockImplementation(async () => sample());
    mocks.send.mockReturnValue(true);
  });
  afterEach(() => { locationService.stopTracking(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("samples stationary GPS on each heartbeat and recovers after location loss", async () => {
    await locationService.startTracking();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    mocks.position.mockRejectedValueOnce(new Error("GPS unavailable"));
    await vi.advanceTimersByTimeAsync(30000);
    expect(mocks.invalidate).toHaveBeenCalled();
    expect(mocks.send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30000);
    expect(mocks.position).toHaveBeenCalledTimes(3);
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });

  it("does not renew presence using stale coordinates or a hanging GPS request", async () => {
    mocks.position.mockResolvedValue({ ...sample(), timestamp: Date.now() - 61000 });
    await locationService.startTracking();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.invalidate).toHaveBeenCalled();
    let finish!: (value: unknown) => void;
    mocks.position.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await vi.advanceTimersByTimeAsync(40000);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.invalidate).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30000);
    expect(mocks.position).toHaveBeenCalledTimes(2);
    finish(sample());
    await vi.advanceTimersByTimeAsync(0);
  });

  it("rejects denied permission and can retry after permission returns", async () => {
    mocks.permissions.mockResolvedValueOnce({ status: "denied" });
    await expect(locationService.startTracking()).resolves.toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
    await expect(locationService.startTracking()).resolves.toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("disposes a watcher that finishes starting after tracking was stopped", async () => {
    let resolveWatch!: (value: unknown) => void;
    const remove = vi.fn();
    mocks.watch.mockReturnValue(new Promise((resolve) => { resolveWatch = resolve; }));
    const pending = locationService.startTracking();
    await vi.advanceTimersByTimeAsync(0);
    locationService.stopTracking();
    resolveWatch({ remove });
    await expect(pending).resolves.toBe(false);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(locationService.isCurrentlyTracking()).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("coalesces startup and never publishes after tracking is stopped", async () => {
    await Promise.all([locationService.startTracking(), locationService.startTracking()]);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.watch).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30000);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    locationService.stopTracking();
    await vi.advanceTimersByTimeAsync(60000);
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });
});
