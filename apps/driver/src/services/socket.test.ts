import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

const mocks = vi.hoisted(() => ({ io: vi.fn(), token: "first", refresh: vi.fn(), fetch: vi.fn() }));
vi.mock("socket.io-client", () => ({ io: mocks.io }));
vi.mock("./auth", () => ({ driverAuthService: {
  getAccessToken: () => mocks.token, refreshTokens: mocks.refresh, authenticatedFetch: mocks.fetch,
} }));
vi.mock("../constants/config", () => ({ SOCKET_URL: "http://localhost:3000", API_BASE_URL: "http://localhost:3000/api/v1" }));
import socketService from "./socket";
import { useConnectionStore } from "../store/connectionStore";

class Transport extends EventEmitter {
  connected = false;
  active = true;
  connect = vi.fn(() => this);
  disconnect() { this.connected = false; super.emit("disconnect", "io client disconnect"); return this; }
  acknowledge: Array<(error: Error | null, result?: any) => Promise<void>> = [];
  timeout() { return { emit: (_event: string, _data: unknown, ack: any) => this.acknowledge.push(ack) }; }
  online() { this.connected = true; super.emit("connect"); }
  offline() { this.connected = false; super.emit("disconnect", "transport close"); }
}

describe("Driver connection evidence", () => {
  let transport: Transport;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 25, 12));
    transport = new Transport();
    mocks.io.mockReturnValue(transport);
    mocks.token = "first";
    mocks.refresh.mockResolvedValue(true);
    mocks.fetch.mockRejectedValue(new Error("REST unavailable"));
  });
  afterEach(() => { socketService.disconnect(); vi.useRealTimers(); });
  async function connect() {
    const pending = socketService.connect();
    transport.online();
    await pending;
  }
  function publish() { socketService.sendLocation({ lat: 8, lng: 0 }); }

  it("keeps retrying an initial failure and uses current credentials on every handshake", async () => {
    const pending = socketService.connect();
    for (let i = 0; i < 7; i++) transport.emit("connect_error", new Error("transport error"));
    expect(useConnectionStore.getState().connected).toBe(false);
    expect(mocks.io.mock.calls[0][1].reconnectionAttempts).toBe(Infinity);
    mocks.token = "refreshed";
    const callback = vi.fn();
    mocks.io.mock.calls[0][1].auth(callback);
    expect(callback).toHaveBeenCalledWith({ token: "refreshed" });
    transport.online();
    await expect(pending).resolves.toBe(transport);
    expect(useConnectionStore.getState().presence).toBe("checking");
  });

  it("requires a new acknowledgement after reconnect and retains offer listeners", async () => {
    await connect();
    const offer = vi.fn();
    const unsubscribe = socketService.onTripOffer(offer);
    publish();
    transport.acknowledge[0](null, { success: true, readyForDispatch: true });
    expect(useConnectionStore.getState().presence).toBe("ready");
    transport.offline();
    expect(useConnectionStore.getState().connected).toBe(false);
    expect(useConnectionStore.getState().presence).toBe("unavailable");
    transport.online();
    transport.acknowledge[0](null, { success: true, readyForDispatch: true });
    expect(useConnectionStore.getState().presence).toBe("checking");
    publish();
    transport.acknowledge[1](null, { success: true, readyForDispatch: true });
    transport.emit("trip:offer", { tripId: "trip" });
    expect(offer).toHaveBeenCalledTimes(1);
    expect(mocks.io).toHaveBeenCalledTimes(1);
    expect(useConnectionStore.getState().presence).toBe("ready");
    unsubscribe();
  });

  it("expires presence and rejects timeout, negative, and out-of-order acknowledgements", async () => {
    await connect();
    publish();
    transport.acknowledge[0](null, { success: true, readyForDispatch: true });
    await vi.advanceTimersByTimeAsync(45000);
    expect(useConnectionStore.getState().presence).toBe("unavailable");
    publish();
    await transport.acknowledge[1](new Error("timeout"));
    await transport.acknowledge[0](null, { success: true, readyForDispatch: true });
    expect(useConnectionStore.getState().presence).toBe("unavailable");
    publish();
    await transport.acknowledge[2](null, { success: true, readyForDispatch: false });
    expect(useConnectionStore.getState().presence).toBe("ineligible");
    publish();
    await transport.acknowledge[3](null, { success: false });
    expect(useConnectionStore.getState().presence).toBe("unavailable");
  });

  it("refreshes authentication once and stops if the refreshed token is also rejected", async () => {
    await connect();
    transport.offline();
    transport.active = false;
    transport.emit("connect_error", new Error("Invalid token"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(transport.connect).toHaveBeenCalledTimes(2);
    transport.emit("connect_error", new Error("Invalid token"));
    expect(useConnectionStore.getState().authentication).toBe("required");
    await vi.advanceTimersByTimeAsync(5000);
    expect(transport.connect).toHaveBeenCalledTimes(2);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending initial connection without leaving a stale listener", async () => {
    const pending = socketService.connect();
    const rejected = expect(pending).rejects.toThrow("Socket disconnected");
    socketService.disconnect();
    await rejected;
    transport.online();
    expect(useConnectionStore.getState().connected).toBe(false);
  });

  function legacyResponses(overrides: Record<string, unknown> = {}, trips: unknown[] = []) {
    const driver = {
      isOnline: true, isApproved: true, subscriptionStatus: "ACTIVE",
      subscriptionPeriodEnd: new Date(Date.now() + 86400000).toISOString(),
      nightMode: false, vehicleType: "MOTO",
      lastLocation: JSON.stringify({ lat: 8, lng: 0, timestamp: Date.now() }),
      ...overrides,
    };
    mocks.fetch.mockImplementation(async (url: string) => new Response(JSON.stringify({
      data: url.endsWith("/auth/me") ? { driver } : { trips },
    })));
  }

  it("verifies an old server through existing REST endpoints after an ack timeout", async () => {
    await connect();
    legacyResponses();
    publish();
    await vi.advanceTimersByTimeAsync(10000);
    await transport.acknowledge[0](new Error("timeout"));
    expect(useConnectionStore.getState().presence).toBe("ready");
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(35000);
    expect(useConnectionStore.getState().presence).toBe("unavailable");
  });

  it.each([
    { lastLocation: JSON.stringify({ lat: 8, lng: 0, timestamp: 0 }) },
    { lastLocation: JSON.stringify({ lat: 7, lng: 0, timestamp: new Date(2026, 8, 25, 12).getTime() }) },
    { lastLocation: null },
  ])("never interprets missing acknowledgement alone as readiness: %j", async (override) => {
    await connect();
    legacyResponses(override);
    publish();
    await transport.acknowledge[0](new Error("timeout"));
    expect(useConnectionStore.getState().presence).toBe("unavailable");
  });

  it.each([
    [{ isOnline: false }, []], [{ isApproved: false }, []],
    [{ nightMode: false }, [{ id: "active-trip" }]],
  ] as [Record<string, unknown>, unknown[]][])("honours old-server eligibility: %j", async (overrides, trips) => {
    await connect();
    legacyResponses(overrides, trips);
    publish();
    await transport.acknowledge[0](new Error("timeout"));
    expect(useConnectionStore.getState().presence).toBe("ineligible");
  });

  it("allows only one presence request, including its legacy verification", async () => {
    await connect();
    publish();
    publish();
    expect(transport.acknowledge).toHaveLength(1);
    let finish!: () => void;
    mocks.fetch.mockReturnValue(new Promise((_resolve, reject) => { finish = () => reject(new Error("unavailable")); }));
    const pending = transport.acknowledge[0](new Error("timeout"));
    publish();
    expect(transport.acknowledge).toHaveLength(1);
    finish();
    await pending;
    publish();
    expect(transport.acknowledge).toHaveLength(2);
  });

  it("does not discard fresh acknowledgement when the previous readiness expires", async () => {
    await connect();
    publish();
    await transport.acknowledge[0](null, { success: true, readyForDispatch: true });
    await vi.advanceTimersByTimeAsync(44000);
    publish();
    await vi.advanceTimersByTimeAsync(2000);
    expect(useConnectionStore.getState().presence).toBe("unavailable");
    await transport.acknowledge[1](null, { success: true, readyForDispatch: true });
    expect(useConnectionStore.getState().presence).toBe("ready");
  });

  it("stops authentication retries when refresh invalidates credentials", async () => {
    await connect();
    transport.offline();
    transport.active = false;
    mocks.refresh.mockImplementation(async () => { mocks.token = ""; return false; });
    transport.emit("connect_error", new Error("Invalid token"));
    await vi.advanceTimersByTimeAsync(60000);
    expect(useConnectionStore.getState().authentication).toBe("required");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(transport.connect).toHaveBeenCalledTimes(1);
    expect(mocks.io).toHaveBeenCalledTimes(1);
  });

  it("bounds hanging legacy verification and does not overlap refresh retries", async () => {
    await connect();
    mocks.fetch.mockReturnValue(new Promise(() => {}));
    publish();
    const pending = transport.acknowledge[0](new Error("timeout"));
    await vi.advanceTimersByTimeAsync(10000);
    await pending;
    expect(useConnectionStore.getState().presence).toBe("unavailable");
    transport.offline();
    transport.active = false;
    let finish!: (value: boolean) => void;
    mocks.refresh.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    transport.emit("connect_error", new Error("Invalid token"));
    await vi.advanceTimersByTimeAsync(5000);
    transport.emit("connect_error", new Error("Invalid token"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    socketService.disconnect();
    finish(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(transport.connect).toHaveBeenCalledTimes(1);
    expect(mocks.io).toHaveBeenCalledTimes(1);
  });

  it("cancels legacy verification on disconnect and ignores its late response", async () => {
    await connect();
    let finish!: (value: Response) => void;
    mocks.fetch.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    publish();
    const pending = transport.acknowledge[0](new Error("timeout"));
    transport.offline();
    await pending;
    transport.online();
    finish(new Response(JSON.stringify({ data: {} })));
    await vi.advanceTimersByTimeAsync(0);
    expect(useConnectionStore.getState().presence).toBe("checking");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("does not use the legacy fallback to override an explicit negative acknowledgement", async () => {
    await connect();
    legacyResponses();
    publish();
    await transport.acknowledge[0](null, { success: false });
    expect(useConnectionStore.getState().presence).toBe("unavailable");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each(["expired", "night opt-out"])("does not claim legacy readiness for %s", async (reason) => {
    await connect();
    if (reason === "night opt-out") vi.setSystemTime(new Date(2026, 8, 25, 22));
    legacyResponses(reason === "expired" ? { subscriptionPeriodEnd: new Date(Date.now() - 1000).toISOString() } : {});
    publish();
    await transport.acknowledge[0](new Error("timeout"));
    expect(useConnectionStore.getState().presence).toBe("ineligible");
  });

  it("cancels scheduled authentication recovery on intentional disconnect", async () => {
    await connect();
    transport.offline();
    transport.active = false;
    transport.emit("connect_error", new Error("Invalid token"));
    socketService.disconnect();
    await vi.advanceTimersByTimeAsync(60000);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(transport.connect).toHaveBeenCalledTimes(1);
  });
});
