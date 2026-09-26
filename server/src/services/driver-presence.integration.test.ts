import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { io as createClient, Socket as ClientSocket } from "socket.io-client";
import { Server } from "socket.io";

// Real Socket.IO server/client boundary; persistence/auth are deterministic fixtures.
const mocks = vi.hoisted(() => ({
  user: vi.fn(), driver: vi.fn(), publish: vi.fn(), available: vi.fn(), night: vi.fn(),
  url: "",
}));
vi.mock("../../../apps/driver/src/constants/config", () => ({
  get SOCKET_URL() { return mocks.url; }, get API_BASE_URL() { return `${mocks.url}/api/v1`; },
}));
vi.mock("../../../apps/driver/src/services/auth", () => ({ driverAuthService: {
  getAccessToken: () => "fixture", refreshTokens: async () => true,
  authenticatedFetch: (url: string, options: RequestInit) => fetch(url, options),
} }));
vi.mock("../config", () => ({ env: { NODE_ENV: "test", REDIS_URL: "" } }));
vi.mock("../config/database", () => ({ prisma: {
  user: { findUnique: mocks.user }, driver: { findUnique: mocks.driver },
} }));
vi.mock("./jwt", () => ({ verifyToken: (token: string) => token === "fixture" ? { sub: "user" } : null }));
vi.mock("./dispatch", () => ({
  updateDriverLocation: mocks.publish, isDriverAvailable: mocks.available,
  isNightServiceHours: mocks.night, isVehicleAllowedAtNight: () => true,
}));
vi.mock("./trip", () => ({}));
vi.mock("./tracking", () => ({ getActiveTripForDriver: async () => null }));
vi.mock("./push", () => ({}));
import { setupSocketIO } from "./socket";
import driverSocketService from "../../../apps/driver/src/services/socket";
import { useConnectionStore } from "../../../apps/driver/src/store/connectionStore";

describe("Driver presence acknowledgement over Socket.IO", () => {
  let http: ReturnType<typeof createServer>;
  let server: Awaited<ReturnType<typeof setupSocketIO>>;
  let client: ClientSocket;
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id: "user", role: "DRIVER", isActive: true });
    mocks.driver.mockResolvedValue({ id: "driver", nightMode: false, vehicleType: "MOTO" });
    mocks.publish.mockResolvedValue(undefined);
    mocks.available.mockResolvedValue(true);
    mocks.night.mockReturnValue(false);
    http = createServer();
    server = await setupSocketIO(http);
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
    mocks.url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
    client = createClient(mocks.url, {
      auth: { token: "fixture" }, transports: ["websocket"], autoConnect: false,
    });
    await connect();
  });
  afterEach(async () => {
    driverSocketService.disconnect();
    client?.disconnect();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  function connect() {
    return new Promise<void>((resolve, reject) => {
      client.once("connect", resolve);
      client.once("connect_error", reject);
      client.connect();
    });
  }
  const publish = () => client.timeout(1000).emitWithAck("driver:location", { lat: 8, lng: 0 });

  // Old protocol fixture: location is persisted/broadcast with no acknowledgement;
  // existing GET /auth/me exposes lastLocation and GET /driver/trips/active lists jobs.
  async function useLegacyServer() {
    client.disconnect();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    let snapshot: { lat: number; lng: number; timestamp: number } | null = null;
    http = createServer((req, res) => {
      const data = req.url === "/api/v1/auth/me" ? { driver: {
        isOnline: true, isApproved: true, subscriptionStatus: "ACTIVE", nightMode: true,
        vehicleType: "MOTO", subscriptionPeriodEnd: new Date(Date.now() + 86400000).toISOString(),
        lastLocation: snapshot ? JSON.stringify(snapshot) : null,
      } } : { trips: [] };
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ data }));
    });
    server = new Server(http);
    server.use((socket, next) => socket.handshake.auth.token === "fixture" ? next() : next(new Error("Invalid token")));
    server.on("connection", (socket) => {
      socket.on("driver:location", async (data) => {
        await mocks.publish("driver", data.lat, data.lng);
        snapshot = { lat: data.lat, lng: data.lng, timestamp: Date.now() };
      });
    });
    await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
    mocks.url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
    client = createClient(mocks.url, { auth: { token: "fixture" }, transports: ["websocket"], autoConnect: false });
    await connect();
  }

  it("A: old Driver protocol + old server still publishes without an acknowledgement", async () => {
    await useLegacyServer();
    client.emit("driver:location", { lat: 8, lng: 0 });
    await vi.waitFor(() => expect(mocks.publish).toHaveBeenCalledWith("driver", 8, 0));
  });

  it("B: old Driver protocol + new server preserves publication without readiness queries", async () => {
    client.emit("driver:location", { lat: 8, lng: 0 });
    await vi.waitFor(() => expect(mocks.publish).toHaveBeenCalledWith("driver", 8, 0));
    expect(mocks.available).not.toHaveBeenCalled();
  });

  it("C: new Driver + old server confirms readiness through the existing HTTP API", async () => {
    await useLegacyServer();
    await driverSocketService.connect();
    driverSocketService.sendLocation({ lat: 8, lng: 0 });
    await vi.waitFor(() => expect(useConnectionStore.getState().presence).toBe("ready"), { timeout: 12000 });
    expect(useConnectionStore.getState().connected).toBe(true);
  }, 15000);

  it("D: new Driver + new server recovers after transport loss and reconfirms presence", async () => {
    const driverSocket = await driverSocketService.connect();
    const offer = vi.fn();
    const unsubscribe = driverSocketService.onTripOffer(offer);
    driverSocketService.sendLocation({ lat: 8, lng: 0 });
    await vi.waitFor(() => expect(useConnectionStore.getState().presence).toBe("ready"));
    const disconnected = new Promise<void>((resolve) => driverSocket.once("disconnect", () => resolve()));
    server.sockets.sockets.get(driverSocket.id!)!.conn.close();
    await disconnected;
    expect(useConnectionStore.getState().connected).toBe(false);
    expect(useConnectionStore.getState().presence).toBe("unavailable");
    await vi.waitFor(() => expect(useConnectionStore.getState().connected).toBe(true), { timeout: 5000 });
    expect(useConnectionStore.getState().presence).toBe("checking");
    driverSocketService.sendLocation({ lat: 8, lng: 0 });
    await vi.waitFor(() => expect(useConnectionStore.getState().presence).toBe("ready"));
    server.to(driverSocket.id!).emit("trip:offer", { tripId: "fixture-trip" });
    await vi.waitFor(() => expect(offer).toHaveBeenCalledTimes(1));
    unsubscribe();
  });

  it("recovers the same Driver socket after the API listener is unavailable across retries", async () => {
    const driverSocket = await driverSocketService.connect();
    const manager = driverSocket.io;
    const offer = vi.fn();
    const unsubscribe = driverSocketService.onTripOffer(offer);
    driverSocketService.sendLocation({ lat: 8, lng: 0 });
    await vi.waitFor(() => expect(useConnectionStore.getState().presence).toBe("ready"));

    const port = (http.address() as AddressInfo).port;
    const errors = vi.fn();
    driverSocket.on("connect_error", errors);
    client.disconnect();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await vi.waitFor(() => expect(errors.mock.calls.length).toBeGreaterThanOrEqual(2), { timeout: 10000 });
    expect(driverSocket.active).toBe(true);
    expect(useConnectionStore.getState()).toMatchObject({
      connected: false, authentication: "checking", presence: "unavailable",
    });
    expect(driverSocketService.sendLocation({ lat: 8, lng: 0 })).toBe(false);

    http = createServer();
    server = await setupSocketIO(http);
    await new Promise<void>((resolve) => http.listen(port, "127.0.0.1", resolve));
    await vi.waitFor(() => expect(useConnectionStore.getState().connected).toBe(true), { timeout: 10000 });
    expect(await driverSocketService.connect()).toBe(driverSocket);
    expect(driverSocket.io).toBe(manager);
    expect(useConnectionStore.getState()).toMatchObject({ authentication: "authenticated", presence: "checking" });
    expect(mocks.publish).toHaveBeenCalledTimes(1);

    // Reconnection cannot restore readiness using the pre-outage sample.
    expect(driverSocketService.sendLocation({ lat: 8.001, lng: 0 }, Date.now())).toBe(true);
    await vi.waitFor(() => expect(useConnectionStore.getState().presence).toBe("ready"));
    expect(mocks.publish).toHaveBeenCalledTimes(2);
    server.to(driverSocket.id!).emit("trip:offer", { tripId: "after-restart" });
    await vi.waitFor(() => expect(offer).toHaveBeenCalledTimes(1));
    driverSocket.off("connect_error", errors);
    unsubscribe();
  }, 25000);

  it("acknowledges persistence and current eligibility, including after reconnect", async () => {
    expect(await publish()).toEqual({ success: true, readyForDispatch: true });
    expect(mocks.publish).toHaveBeenCalledWith("driver", 8, 0);
    client.disconnect();
    await connect();
    mocks.available.mockResolvedValue(false);
    expect(await publish()).toEqual({ success: true, readyForDispatch: false });
  });

  it("does not acknowledge readiness until presence storage succeeds", async () => {
    let finish!: () => void;
    mocks.publish.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
    let acknowledged = false;
    const result = publish().then((value) => { acknowledged = true; return value; });
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    expect(acknowledged).toBe(false);
    finish();
    expect(await result).toEqual({ success: true, readyForDispatch: true });
    mocks.publish.mockRejectedValueOnce(new Error("presence unavailable"));
    expect(await publish()).toEqual({ success: false });
  });

  it("reports night opt-out as ineligible and rejects non-driver presence", async () => {
    mocks.night.mockReturnValue(true);
    expect(await publish()).toEqual({ success: true, readyForDispatch: false });
    mocks.driver.mockResolvedValue({ id: "driver", nightMode: true, vehicleType: "MOTO" });
    expect(await publish()).toEqual({ success: true, readyForDispatch: true });
    client.disconnect();
    mocks.user.mockResolvedValue({ id: "user", role: "CUSTOMER", isActive: true });
    await connect();
    expect(await publish()).toEqual({ success: false });
  });
});
