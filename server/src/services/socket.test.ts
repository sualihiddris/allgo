import { beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "http";

const mocks = vi.hoisted(() => ({
  getTripById: vi.fn(),
  findNearbyDrivers: vi.fn(),
  isDriverAvailable: vi.fn(),
  assignTripToDriver: vi.fn(),
  getSearchRadii: vi.fn(),
  getJobTimeout: vi.fn(),
  isNightServiceHours: vi.fn(),
  isVehicleAllowedAtNight: vi.fn(),
  registerActiveTrip: vi.fn(),
  sendPushNotification: vi.fn(),
  driverFindUnique: vi.fn(),
  tripUpdateMany: vi.fn(),
}));

vi.mock("../config", () => ({ env: { NODE_ENV: "test" } }));
vi.mock("../config/database", () => ({
  prisma: {
    driver: { findUnique: mocks.driverFindUnique },
    trip: { updateMany: mocks.tripUpdateMany },
  },
}));
vi.mock("../services/trip", () => ({ getTripById: mocks.getTripById }));
vi.mock("../services/dispatch", () => ({
  findNearbyDrivers: mocks.findNearbyDrivers,
  isDriverAvailable: mocks.isDriverAvailable,
  assignTripToDriver: mocks.assignTripToDriver,
  getSearchRadii: mocks.getSearchRadii,
  getJobTimeout: mocks.getJobTimeout,
  isNightServiceHours: mocks.isNightServiceHours,
  isVehicleAllowedAtNight: mocks.isVehicleAllowedAtNight,
  updateDriverLocation: vi.fn(),
}));
vi.mock("../services/tracking", () => ({
  registerActiveTrip: mocks.registerActiveTrip,
  startTripTracking: vi.fn(),
  unregisterActiveTrip: vi.fn(),
  getActiveTripForDriver: vi.fn(),
}));
vi.mock("../services/push", () => ({ sendPushNotification: mocks.sendPushNotification }));
vi.mock("../services/jwt", () => ({ verifyToken: vi.fn() }));
vi.mock("ioredis", () => ({ default: class {} }));
vi.mock("@socket.io/redis-adapter", () => ({ createAdapter: vi.fn() }));

const ioMock = vi.hoisted(() => {
  const emissions: Array<{ room: string; event: string; payload: unknown }> = [];
  let connectionHandler: ((socket: any) => void) | undefined;
  class FakeServer {
    use() {}
    on(event: string, handler: (socket: any) => void) {
      if (event === "connection") connectionHandler = handler;
    }
    adapter() {}
    to(room: string) {
      return {
        emit: (event: string, payload: unknown) => emissions.push({ room, event, payload }),
      };
    }
  }
  return { FakeServer, emissions, getConnectionHandler: () => connectionHandler };
});
vi.mock("socket.io", () => ({ Server: ioMock.FakeServer }));

import { dispatchTrip, setupSocketIO } from "./socket";

describe("dispatchTrip", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    ioMock.emissions.length = 0;
    mocks.getTripById.mockResolvedValue({
      id: "trip-1",
      status: "REQUESTED",
      vehicleType: "MOTO",
      serviceType: "PASSENGER",
      deliveryType: null,
      itemDescription: null,
      pickupLat: 5,
      pickupLng: -1,
      pickupAddress: "Pickup",
      destLat: 5.1,
      destLng: -1.1,
      destAddress: "Destination",
      distanceMeters: 1000,
      customer: null,
      callerName: "Ama",
      callerPhone: "0241234567",
      customerNote: null,
    });
    mocks.getSearchRadii.mockReturnValue([2000]);
    mocks.getJobTimeout.mockReturnValue(0);
    mocks.isNightServiceHours.mockReturnValue(false);
    mocks.isVehicleAllowedAtNight.mockReturnValue(true);
    mocks.isDriverAvailable.mockResolvedValue(true);
    mocks.driverFindUnique.mockResolvedValue({ id: "driver-1", pushToken: null });
    mocks.tripUpdateMany.mockResolvedValue({ count: 1 });
    await setupSocketIO(createServer());
  });

  it("returns NO_DRIVERS after exhausting candidates", async () => {
    mocks.findNearbyDrivers.mockResolvedValue([]);

    await expect(dispatchTrip("trip-1")).resolves.toEqual({
      status: "NO_DRIVERS",
      message: "No drivers available nearby. Please try again in a few minutes.",
    });

    expect(mocks.tripUpdateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "trip-1", status: "REQUESTED", driverId: null },
      data: { dispatchStatus: "SEARCHING" },
    });
    expect(mocks.tripUpdateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "trip-1", status: "REQUESTED", driverId: null },
      data: { dispatchStatus: "NO_DRIVER_FOUND" },
    });
  });

  it("coalesces concurrent dispatches for the same trip", async () => {
    let resolveDiscovery!: (drivers: never[]) => void;
    mocks.findNearbyDrivers.mockReturnValue(
      new Promise((resolve) => {
        resolveDiscovery = resolve;
      })
    );

    const firstDispatch = dispatchTrip("trip-1");
    for (let attempt = 0; attempt < 20 && !mocks.findNearbyDrivers.mock.calls.length; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const secondDispatch = dispatchTrip("trip-1");
    resolveDiscovery([]);

    const results = await Promise.all([firstDispatch, secondDispatch]);

    expect(results[0]).toEqual({
      status: "NO_DRIVERS",
      message: "No drivers available nearby. Please try again in a few minutes.",
    });
    expect(results[1]).toEqual(results[0]);
    expect(mocks.getTripById).toHaveBeenCalledTimes(1);
    expect(mocks.tripUpdateMany).toHaveBeenCalledTimes(2);
    expect(mocks.findNearbyDrivers).toHaveBeenCalledTimes(1);
  });

  it("cleans up the guard after NO_DRIVERS so retry starts a new dispatch", async () => {
    mocks.findNearbyDrivers.mockResolvedValue([]);

    await dispatchTrip("trip-1");
    await dispatchTrip("trip-1");

    expect(mocks.getTripById).toHaveBeenCalledTimes(2);
    expect(mocks.findNearbyDrivers).toHaveBeenCalledTimes(2);
  });

  it("cleans up the guard after FAILED so retry starts a new dispatch", async () => {
    mocks.findNearbyDrivers.mockRejectedValueOnce(new Error("redis unavailable"));
    mocks.findNearbyDrivers.mockResolvedValueOnce([]);

    await expect(dispatchTrip("trip-1")).resolves.toEqual({
      status: "FAILED",
      reason: "Server error",
    });
    await expect(dispatchTrip("trip-1")).resolves.toMatchObject({ status: "NO_DRIVERS" });

    expect(mocks.getTripById).toHaveBeenCalledTimes(2);
    expect(mocks.findNearbyDrivers).toHaveBeenCalledTimes(2);
  });

  it("allows different trips to dispatch independently", async () => {
    mocks.findNearbyDrivers.mockResolvedValue([]);

    await Promise.all([dispatchTrip("trip-1"), dispatchTrip("trip-2")]);

    expect(mocks.getTripById).toHaveBeenCalledTimes(2);
    expect(mocks.findNearbyDrivers).toHaveBeenCalledTimes(2);
  });

  it("sets SEARCHING when dispatch begins", async () => {
    mocks.findNearbyDrivers.mockResolvedValue([]);

    await dispatchTrip("trip-1");

    expect(mocks.tripUpdateMany).toHaveBeenCalledWith({
      where: { id: "trip-1", status: "REQUESTED", driverId: null },
      data: { dispatchStatus: "SEARCHING" },
    });
  });

  it("stops before offering when the lifecycle-safe SEARCHING claim loses the race", async () => {
    mocks.tripUpdateMany.mockResolvedValueOnce({ count: 0 });

    await expect(dispatchTrip("trip-1")).resolves.toEqual({
      status: "FAILED",
      reason: "Invalid trip",
    });
    expect(mocks.findNearbyDrivers).not.toHaveBeenCalled();
    expect(mocks.tripUpdateMany).toHaveBeenCalledWith({
      where: { id: "trip-1", status: "REQUESTED", driverId: null },
      data: { dispatchStatus: "SEARCHING" },
    });
  });

  it("persists FAILED when dispatch encounters an internal error", async () => {
    mocks.findNearbyDrivers.mockRejectedValue(new Error("redis unavailable"));

    await expect(dispatchTrip("trip-1")).resolves.toEqual({
      status: "FAILED",
      reason: "Server error",
    });
    expect(mocks.tripUpdateMany).toHaveBeenLastCalledWith({
      where: { id: "trip-1", status: "REQUESTED", driverId: null },
      data: { dispatchStatus: "FAILED" },
    });
  });

  it("uses call-in identity in the driver offer", async () => {
    mocks.findNearbyDrivers.mockResolvedValue([{ driverId: "driver-1" }]);

    const result = await dispatchTrip("trip-1");

    expect(result.status).toBe("NO_DRIVERS");
    expect(ioMock.emissions).toContainEqual({
      room: "driver:driver-1",
      event: "trip:offer",
      payload: expect.objectContaining({
        customerName: "Ama",
        customerPhone: "0241234567",
      }),
    });
  });

  it("returns ACCEPTED only after assignment succeeds", async () => {
    mocks.findNearbyDrivers.mockResolvedValue([{ driverId: "driver-1" }]);
    mocks.getJobTimeout.mockReturnValue(10);
    mocks.assignTripToDriver.mockResolvedValue({
      driver: {
        id: "driver-1",
        vehicleType: "MOTO",
        licensePlate: "GT-1",
        user: { name: "Driver", phone: "0200000000" },
      },
    });

    const handlers: Record<string, (tripId: string) => void> = {};
    const driverSocket = {
      id: "socket-1",
      role: "DRIVER",
      driverId: "driver-1",
      driverRoomReady: Promise.resolve(),
      join: vi.fn(),
      emit: vi.fn(),
      on: (event: string, handler: (tripId: string) => void) => {
        handlers[event] = handler;
      },
    };
    ioMock.getConnectionHandler()!(driverSocket);

    const dispatchPromise = dispatchTrip("trip-1");
    for (let attempt = 0; attempt < 20 && ioMock.emissions.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    handlers["trip:accept"]("trip-1");

    await expect(dispatchPromise).resolves.toMatchObject({ status: "ACCEPTED" });
    expect(mocks.assignTripToDriver).toHaveBeenCalledWith("trip-1", "driver-1");
    expect(mocks.tripUpdateMany).toHaveBeenCalledWith({
      where: { id: "trip-1", status: "REQUESTED", driverId: null },
      data: { dispatchStatus: "SEARCHING" },
    });
    expect(mocks.registerActiveTrip).toHaveBeenCalledWith("driver-1", "trip-1");
    expect(ioMock.emissions).toContainEqual({
      room: "driver:driver-1",
      event: "trip:confirmed",
      payload: { tripId: "trip-1" },
    });
  });

  it("does not overwrite an accepted trip when post-assignment work fails", async () => {
    mocks.findNearbyDrivers.mockResolvedValue([{ driverId: "driver-1" }]);
    mocks.getJobTimeout.mockReturnValue(10);
    mocks.assignTripToDriver.mockResolvedValue({
      driver: {
        id: "driver-1",
        vehicleType: "MOTO",
        licensePlate: "GT-1",
        user: { name: "Driver", phone: "0200000000" },
      },
    });
    mocks.registerActiveTrip.mockRejectedValue(new Error("tracking unavailable"));

    const handlers: Record<string, (tripId: string) => void> = {};
    ioMock.getConnectionHandler()!({
      role: "DRIVER",
      driverId: "driver-1",
      driverRoomReady: Promise.resolve(),
      join: vi.fn(),
      emit: vi.fn(),
      on: (event: string, handler: (tripId: string) => void) => {
        handlers[event] = handler;
      },
    });

    const dispatchPromise = dispatchTrip("trip-1");
    for (let attempt = 0; attempt < 20 && ioMock.emissions.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    handlers["trip:accept"]("trip-1");

    await expect(dispatchPromise).resolves.toEqual({
      status: "FAILED",
      reason: "Server error",
    });
    expect(mocks.tripUpdateMany).toHaveBeenLastCalledWith({
      where: { id: "trip-1", status: "REQUESTED", driverId: null },
      data: { dispatchStatus: "FAILED" },
    });
  });

  it("persists NO_DRIVER_FOUND safely for a night-restricted vehicle", async () => {
    mocks.isNightServiceHours.mockReturnValue(true);
    mocks.isVehicleAllowedAtNight.mockReturnValue(false);

    await expect(dispatchTrip("trip-1")).resolves.toMatchObject({
      status: "NO_DRIVERS",
    });
    expect(mocks.findNearbyDrivers).not.toHaveBeenCalled();
    expect(mocks.tripUpdateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "trip-1", status: "REQUESTED", driverId: null },
      data: { dispatchStatus: "NO_DRIVER_FOUND" },
    });
  });

  it("maps NO_DRIVERS to the customer dispatch event", async () => {
    mocks.findNearbyDrivers.mockResolvedValue([]);
    const handlers: Record<string, (tripId: string) => Promise<void>> = {};
    const customerSocket = {
      role: "CUSTOMER",
      userId: "customer-1",
      join: vi.fn(),
      emit: vi.fn(),
      on: (event: string, handler: (tripId: string) => Promise<void>) => {
        handlers[event] = handler;
      },
    };
    ioMock.getConnectionHandler()!(customerSocket);

    await handlers["trip:dispatch"]("trip-1");

    expect(customerSocket.emit).toHaveBeenCalledWith("trip:dispatch:no_drivers", {
      tripId: "trip-1",
      message: "No drivers available nearby. Please try again in a few minutes.",
    });
  });
});
