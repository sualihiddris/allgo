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
}));

vi.mock("../config", () => ({ env: { NODE_ENV: "test" } }));
vi.mock("../config/database", () => ({
  prisma: { driver: { findUnique: mocks.driverFindUnique } },
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
    await setupSocketIO(createServer());
  });

  it("returns NO_DRIVERS after exhausting candidates", async () => {
    mocks.findNearbyDrivers.mockResolvedValue([]);

    await expect(dispatchTrip("trip-1")).resolves.toEqual({
      status: "NO_DRIVERS",
      message: "No drivers available nearby. Please try again in a few minutes.",
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
    expect(mocks.registerActiveTrip).toHaveBeenCalledWith("driver-1", "trip-1");
    expect(ioMock.emissions).toContainEqual({
      room: "driver:driver-1",
      event: "trip:confirmed",
      payload: { tripId: "trip-1" },
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
