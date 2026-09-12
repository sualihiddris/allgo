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
  unregisterActiveTrip: vi.fn(),
  unregisterActiveTripIfCurrent: vi.fn(),
  sendPushNotification: vi.fn(),
  driverFindUnique: vi.fn(),
  tripUpdateMany: vi.fn(),
  tripFindUnique: vi.fn(),
  tripFindFirst: vi.fn(),
}));

const config = vi.hoisted(() => ({
  env: {
    NODE_ENV: "test",
    REDIS_URL: undefined as string | undefined,
  },
}));

vi.mock("../config", () => config);
vi.mock("../config/database", () => ({
  prisma: {
    driver: { findUnique: mocks.driverFindUnique },
    trip: {
      updateMany: mocks.tripUpdateMany,
      findUnique: mocks.tripFindUnique,
      findFirst: mocks.tripFindFirst,
    },
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
  unregisterActiveTrip: mocks.unregisterActiveTrip,
  unregisterActiveTripIfCurrent:
    mocks.unregisterActiveTripIfCurrent,
  getActiveTripForDriver: vi.fn(),
}));
vi.mock("../services/push", () => ({ sendPushNotification: mocks.sendPushNotification }));
vi.mock("../services/jwt", () => ({ verifyToken: vi.fn() }));
vi.mock("ioredis", () => ({ default: class {} }));
vi.mock("@socket.io/redis-adapter", () => ({ createAdapter: vi.fn() }));

const ioMock = vi.hoisted(() => {
  const emissions: Array<{ room: string; event: string; payload: unknown }> = [];
  const serverSideEmissions: Array<{ event: string; payload: unknown }> = [];
  const serverSideHandlers: Record<string, (payload: any) => void> = {};
  let connectionHandler: ((socket: any) => void) | undefined;

  class FakeServer {
    use() {}

    on(event: string, handler: (payload: any) => void) {
      if (event === "connection") {
        connectionHandler = handler;
      } else {
        serverSideHandlers[event] = handler;
      }
    }

    adapter() {}

    serverSideEmit(event: string, payload: unknown) {
      serverSideEmissions.push({ event, payload });
    }

    to(room: string) {
      return {
        emit: (event: string, payload: unknown) =>
          emissions.push({ room, event, payload }),
      };
    }
  }

  return {
    FakeServer,
    emissions,
    serverSideEmissions,
    getConnectionHandler: () => connectionHandler,
    getServerSideHandler: (event: string) => serverSideHandlers[event],
  };
});

vi.mock("socket.io", () => ({ Server: ioMock.FakeServer }));

import { dispatchTrip, setupSocketIO } from "./socket";

describe("dispatchTrip", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    config.env.REDIS_URL = undefined;
    ioMock.emissions.length = 0;
    ioMock.serverSideEmissions.length = 0;
    mocks.registerActiveTrip.mockResolvedValue(undefined);
    mocks.unregisterActiveTrip.mockResolvedValue(undefined);
    mocks.unregisterActiveTripIfCurrent.mockResolvedValue(true);
    mocks.tripFindFirst.mockResolvedValue({
      id: "trip-1",
    });
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
    mocks.tripFindUnique.mockResolvedValue({
      status: "ACCEPTED",
      driverId: "driver-1",
    });
    await setupSocketIO(createServer());
  });

  it("returns NO_DRIVERS after exhausting candidates", async () => {
    mocks.findNearbyDrivers.mockResolvedValue([]);

    await expect(dispatchTrip("trip-1")).resolves.toEqual({
      status: "NO_DRIVERS",
      message: "No drivers available nearby. Please try again in a few minutes.",
    });

    expect(mocks.tripUpdateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: "trip-1",
        status: "REQUESTED",
        driverId: null,
        OR: [
          { dispatchStatus: null },
          { dispatchStatus: "NO_DRIVER_FOUND" },
          { dispatchStatus: "FAILED" },
          {
            dispatchStatus: "SEARCHING",
            OR: [
              { dispatchClaimToken: null },
              { dispatchClaimedAt: null },
              { dispatchClaimedAt: { lt: expect.any(Date) } },
            ],
          },
        ],
      },
      data: {
        dispatchStatus: "SEARCHING",
        dispatchClaimToken: expect.any(String),
        dispatchClaimedAt: expect.any(Date),
      },
    });
    expect(mocks.tripUpdateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: "trip-1",
        status: "REQUESTED",
        driverId: null,
        dispatchStatus: "SEARCHING",
        dispatchClaimToken: expect.any(String),
      },
      data: {
        dispatchStatus: "NO_DRIVER_FOUND",
        dispatchClaimToken: null,
        dispatchClaimedAt: null,
      },
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
      where: {
        id: "trip-1",
        status: "REQUESTED",
        driverId: null,
        OR: [
          { dispatchStatus: null },
          { dispatchStatus: "NO_DRIVER_FOUND" },
          { dispatchStatus: "FAILED" },
          {
            dispatchStatus: "SEARCHING",
            OR: [
              { dispatchClaimToken: null },
              { dispatchClaimedAt: null },
              { dispatchClaimedAt: { lt: expect.any(Date) } },
            ],
          },
        ],
      },
      data: {
        dispatchStatus: "SEARCHING",
        dispatchClaimToken: expect.any(String),
        dispatchClaimedAt: expect.any(Date),
      },
    });
  });

  it("builds the atomic claim filter to reclaim expired SEARCHING leases", async () => {
    mocks.findNearbyDrivers.mockResolvedValue([]);

    await dispatchTrip("trip-1");

    const claimCall = mocks.tripUpdateMany.mock.calls[0][0];
    const searchingBranch = claimCall.where.OR.find(
      (branch: any) => branch.dispatchStatus === "SEARCHING"
    );
    const staleCondition = searchingBranch?.OR.find(
      (condition: any) =>
        condition.dispatchClaimedAt?.lt instanceof Date
    );

    expect(searchingBranch).toEqual(
      expect.objectContaining({
        dispatchStatus: "SEARCHING",
      })
    );
    expect(staleCondition?.dispatchClaimedAt.lt).toBeInstanceOf(Date);
    expect(claimCall.data.dispatchClaimToken).toEqual(expect.any(String));
    expect(claimCall.data.dispatchClaimedAt).toBeInstanceOf(Date);

    expect(
      claimCall.data.dispatchClaimedAt.getTime() -
        staleCondition.dispatchClaimedAt.lt.getTime()
    ).toBe(5 * 60 * 1000);
  });

  it("returns FAILED when a lost claim reflects lifecycle progress", async () => {
    const requestedTrip = await mocks.getTripById("trip-1");
    mocks.getTripById.mockClear();

    mocks.getTripById
      .mockResolvedValueOnce(requestedTrip)
      .mockResolvedValueOnce({
        ...requestedTrip,
        status: "ACCEPTED",
        driverId: "driver-1",
        dispatchStatus: null,
      });

    mocks.tripUpdateMany.mockResolvedValueOnce({ count: 0 });

    await expect(dispatchTrip("trip-1")).resolves.toEqual({
      status: "FAILED",
      reason: "Trip is no longer available for dispatch",
    });

    expect(mocks.findNearbyDrivers).not.toHaveBeenCalled();
  });

  it("does not report NO_DRIVERS when terminal persistence loses to lifecycle progress", async () => {
    const requestedTrip = await mocks.getTripById("trip-1");
    mocks.getTripById.mockClear();

    mocks.getTripById
      .mockResolvedValueOnce(requestedTrip)
      .mockResolvedValueOnce({
        ...requestedTrip,
        status: "CANCELLED",
        driverId: null,
        dispatchStatus: null,
      });

    mocks.findNearbyDrivers.mockResolvedValue([]);
    mocks.tripUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(dispatchTrip("trip-1")).resolves.toEqual({
      status: "FAILED",
      reason: "Trip is no longer available for dispatch",
    });
  });

  it("returns IN_PROGRESS without offering when another instance already owns SEARCHING", async () => {
    mocks.getTripById
      .mockResolvedValueOnce({
        id: "trip-1",
        status: "REQUESTED",
      })
      .mockResolvedValueOnce({
        id: "trip-1",
        status: "REQUESTED",
        driverId: null,
        dispatchStatus: "SEARCHING",
      });
    mocks.tripUpdateMany.mockResolvedValueOnce({ count: 0 });

    await expect(dispatchTrip("trip-1")).resolves.toEqual({
      status: "IN_PROGRESS",
      reason: "Trip dispatch is already in progress",
    });

    expect(mocks.findNearbyDrivers).not.toHaveBeenCalled();
    expect(mocks.tripUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocks.tripUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "trip-1",
        status: "REQUESTED",
        driverId: null,
        OR: [
          { dispatchStatus: null },
          { dispatchStatus: "NO_DRIVER_FOUND" },
          { dispatchStatus: "FAILED" },
          {
            dispatchStatus: "SEARCHING",
            OR: [
              { dispatchClaimToken: null },
              { dispatchClaimedAt: null },
              { dispatchClaimedAt: { lt: expect.any(Date) } },
            ],
          },
        ],
      },
      data: {
        dispatchStatus: "SEARCHING",
        dispatchClaimToken: expect.any(String),
        dispatchClaimedAt: expect.any(Date),
      },
    });
  });

  it("persists FAILED when dispatch encounters an internal error", async () => {
    mocks.findNearbyDrivers.mockRejectedValue(new Error("redis unavailable"));

    await expect(dispatchTrip("trip-1")).resolves.toEqual({
      status: "FAILED",
      reason: "Server error",
    });
    expect(mocks.tripUpdateMany).toHaveBeenLastCalledWith({
      where: {
        id: "trip-1",
        status: "REQUESTED",
        driverId: null,
        dispatchStatus: "SEARCHING",
        dispatchClaimToken: expect.any(String),
      },
      data: {
        dispatchStatus: "FAILED",
        dispatchClaimToken: null,
        dispatchClaimedAt: null,
      },
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

    const handlers: Record<string, (payload: any) => void> = {};
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
    const emittedOffer = ioMock.emissions.find(
      (emission) => emission.event === "trip:offer"
    )?.payload as { offerId: string };

    handlers["trip:accept"]({
      tripId: "trip-1",
      offerId: emittedOffer.offerId,
    });

    await expect(dispatchPromise).resolves.toMatchObject({ status: "ACCEPTED" });
    const claimToken =
      mocks.tripUpdateMany.mock.calls[0][0].data.dispatchClaimToken;

    expect(claimToken).toEqual(expect.any(String));
    expect(mocks.assignTripToDriver).toHaveBeenCalledWith(
      "trip-1",
      "driver-1",
      claimToken
    );
    expect(mocks.tripUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "trip-1",
        status: "REQUESTED",
        driverId: null,
        OR: [
          { dispatchStatus: null },
          { dispatchStatus: "NO_DRIVER_FOUND" },
          { dispatchStatus: "FAILED" },
          {
            dispatchStatus: "SEARCHING",
            OR: [
              { dispatchClaimToken: null },
              { dispatchClaimedAt: null },
              { dispatchClaimedAt: { lt: expect.any(Date) } },
            ],
          },
        ],
      },
      data: {
        dispatchStatus: "SEARCHING",
        dispatchClaimToken: expect.any(String),
        dispatchClaimedAt: expect.any(Date),
      },
    });
    expect(mocks.registerActiveTrip).toHaveBeenCalledWith("driver-1", "trip-1");
    expect(ioMock.emissions).toContainEqual({
      room: "driver:driver-1",
      event: "trip:confirmed",
      payload: {
        tripId: "trip-1",
        offerId: emittedOffer.offerId,
      },
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
    mocks.registerActiveTrip.mockRejectedValue(
      new Error("tracking unavailable")
    );

    // Claim succeeds, heartbeat succeeds, then FAILED persistence loses
    // because assignment has already moved the trip to ACCEPTED.
    mocks.tripUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const handlers: Record<string, (payload: any) => void> = {};

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

    for (
      let attempt = 0;
      attempt < 20 && ioMock.emissions.length === 0;
      attempt += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    // Assignment has now logically succeeded. Any re-read performed by
    // the exception handler must see the real lifecycle state.
    mocks.getTripById.mockResolvedValue({
      id: "trip-1",
      status: "ACCEPTED",
      driverId: "driver-1",
      dispatchStatus: null,
    });

    const emittedOffer = ioMock.emissions.find(
      (emission) => emission.event === "trip:offer"
    )?.payload as { offerId: string };

    handlers["trip:accept"]({
      tripId: "trip-1",
      offerId: emittedOffer.offerId,
    });

    await expect(dispatchPromise).resolves.toEqual({
      status: "FAILED",
      reason: "Server error",
    });

    const claimToken =
      mocks.tripUpdateMany.mock.calls[0][0].data.dispatchClaimToken;

    expect(mocks.tripUpdateMany).toHaveBeenLastCalledWith({
      where: {
        id: "trip-1",
        status: "REQUESTED",
        driverId: null,
        dispatchStatus: "SEARCHING",
        dispatchClaimToken: claimToken,
      },
      data: {
        dispatchStatus: "FAILED",
        dispatchClaimToken: null,
        dispatchClaimedAt: null,
      },
    });

    expect(mocks.getTripById).toHaveBeenCalledTimes(2);
  });

  it("persists NO_DRIVER_FOUND safely for a night-restricted vehicle", async () => {
    mocks.isNightServiceHours.mockReturnValue(true);
    mocks.isVehicleAllowedAtNight.mockReturnValue(false);

    await expect(dispatchTrip("trip-1")).resolves.toMatchObject({
      status: "NO_DRIVERS",
    });
    expect(mocks.findNearbyDrivers).not.toHaveBeenCalled();
    expect(mocks.tripUpdateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: "trip-1",
        status: "REQUESTED",
        driverId: null,
        dispatchStatus: "SEARCHING",
        dispatchClaimToken: expect.any(String),
      },
      data: {
        dispatchStatus: "NO_DRIVER_FOUND",
        dispatchClaimToken: null,
        dispatchClaimedAt: null,
      },
    });
  });

  it("does not emit a false terminal event when another instance already owns dispatch", async () => {
    mocks.getTripById
      .mockResolvedValueOnce({
        id: "trip-1",
        status: "REQUESTED",
      })
      .mockResolvedValueOnce({
        id: "trip-1",
        status: "REQUESTED",
        driverId: null,
        dispatchStatus: "SEARCHING",
      });
    mocks.tripUpdateMany.mockResolvedValueOnce({ count: 0 });

    const handlers: Record<string, (payload: any) => Promise<void>> = {};
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

    expect(customerSocket.emit).not.toHaveBeenCalledWith(
      "trip:dispatch:failed",
      expect.anything()
    );
    expect(customerSocket.emit).not.toHaveBeenCalledWith(
      "trip:dispatch:no_drivers",
      expect.anything()
    );
    expect(customerSocket.emit).not.toHaveBeenCalledWith(
      "trip:accepted",
      expect.anything()
    );
    expect(mocks.findNearbyDrivers).not.toHaveBeenCalled();
  });

  it("stops before offering when the dispatch heartbeat loses ownership", async () => {
    mocks.findNearbyDrivers.mockResolvedValue([{ driverId: "driver-1" }]);
    mocks.tripUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(dispatchTrip("trip-1")).resolves.toEqual({
      status: "IN_PROGRESS",
      reason: "Trip dispatch ownership changed",
    });

    expect(
      ioMock.emissions.some((emission) => emission.event === "trip:offer")
    ).toBe(false);
    expect(mocks.assignTripToDriver).not.toHaveBeenCalled();

    expect(mocks.tripUpdateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          id: "trip-1",
          status: "REQUESTED",
          driverId: null,
          dispatchStatus: "SEARCHING",
          dispatchClaimToken: expect.any(String),
        }),
        data: {
          dispatchClaimedAt: expect.any(Date),
        },
      })
    );
  });

  it("resolves an offer response received by another backend instance", async () => {
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

    const dispatchPromise = dispatchTrip("trip-1");

    for (let attempt = 0; attempt < 20 && ioMock.emissions.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const offer = ioMock.emissions.find(
      (emission) => emission.event === "trip:offer"
    )?.payload as { offerId: string };

    const remoteResponseHandler =
      ioMock.getServerSideHandler("dispatch:driver-response");

    expect(remoteResponseHandler).toBeTypeOf("function");
    expect(offer.offerId).toEqual(expect.any(String));

    remoteResponseHandler!({
      tripId: "trip-1",
      offerId: offer.offerId,
      driverId: "driver-1",
      response: "accept",
    });

    await expect(dispatchPromise).resolves.toMatchObject({ status: "ACCEPTED" });
  });

  it("relays a driver accept to other backend instances when Redis is configured", async () => {
    config.env.REDIS_URL = "redis://cluster";

    const handlers: Record<string, (payload: any) => Promise<void>> = {};
    const driverSocket = {
      role: "DRIVER",
      userId: "driver-user-1",
      driverId: "driver-1",
      driverRoomReady: Promise.resolve(),
      join: vi.fn(),
      emit: vi.fn(),
      on: (event: string, handler: (payload: any) => Promise<void>) => {
        handlers[event] = handler;
      },
    };

    ioMock.getConnectionHandler()!(driverSocket);

    await handlers["trip:accept"]({
      tripId: "trip-remote",
      offerId: "offer-remote",
    });

    expect(ioMock.serverSideEmissions).toContainEqual({
      event: "dispatch:driver-response",
      payload: {
        tripId: "trip-remote",
        offerId: "offer-remote",
        driverId: "driver-1",
        response: "accept",
      },
    });
  });

  it("ignores a stale offerId without resolving the active offer", async () => {
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

    const dispatchPromise = dispatchTrip("trip-1");

    for (let attempt = 0; attempt < 20 && ioMock.emissions.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const offer = ioMock.emissions.find(
      (emission) => emission.event === "trip:offer"
    )?.payload as { offerId: string };
    const remoteResponseHandler =
      ioMock.getServerSideHandler("dispatch:driver-response")!;

    remoteResponseHandler({
      tripId: "trip-1",
      offerId: "stale-offer-id",
      driverId: "driver-1",
      response: "accept",
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.assignTripToDriver).not.toHaveBeenCalled();

    remoteResponseHandler({
      tripId: "trip-1",
      offerId: offer.offerId,
      driverId: "driver-1",
      response: "accept",
    });

    await expect(dispatchPromise).resolves.toMatchObject({ status: "ACCEPTED" });
  });


  it("rejects dispatch for a trip not owned by the authenticated customer", async () => {
    mocks.tripFindFirst.mockResolvedValue(null);

    const handlers: Record<
      string,
      (payload: any) => Promise<void>
    > = {};

    const customerSocket = {
      role: "CUSTOMER",
      userId: "customer-2",
      join: vi.fn(),
      emit: vi.fn(),
      on: (
        event: string,
        handler: (tripId: string) => Promise<void>
      ) => {
        handlers[event] = handler;
      },
    };

    ioMock.getConnectionHandler()!(customerSocket);

    await handlers["trip:dispatch"]("trip-1");

    expect(
      customerSocket.emit
    ).toHaveBeenCalledWith(
      "trip:dispatch:failed",
      {
        tripId: "trip-1",
        reason: "Trip not found or unavailable",
      }
    );

    expect(
      mocks.tripFindFirst
    ).toHaveBeenCalledWith({
      where: {
        id: "trip-1",
        customer: {
          userId: "customer-2",
        },
      },
      select: {
        id: true,
      },
    });

    expect(
      mocks.findNearbyDrivers
    ).not.toHaveBeenCalled();

    expect(
      mocks.tripUpdateMany
    ).not.toHaveBeenCalled();
  });

  it("rejects trip dispatch from a non-customer socket before database authorization", async () => {
    const handlers: Record<
      string,
      (payload: any) => Promise<void>
    > = {};

    const adminSocket = {
      role: "ADMIN",
      userId: "admin-user-1",
      join: vi.fn(),
      emit: vi.fn(),
      on: (
        event: string,
        handler: (tripId: string) => Promise<void>
      ) => {
        handlers[event] = handler;
      },
    };

    ioMock.getConnectionHandler()!(adminSocket);

    await handlers["trip:dispatch"]("trip-1");

    expect(
      adminSocket.emit
    ).toHaveBeenCalledWith(
      "trip:dispatch:failed",
      {
        tripId: "trip-1",
        reason: "Trip not found or unavailable",
      }
    );

    expect(
      mocks.tripFindFirst
    ).not.toHaveBeenCalled();

    expect(
      mocks.findNearbyDrivers
    ).not.toHaveBeenCalled();
  });

  it("rejects malformed trip ids before the ownership lookup", async () => {
    const handlers: Record<
      string,
      (payload: any) => Promise<void>
    > = {};

    const customerSocket = {
      role: "CUSTOMER",
      userId: "customer-1",
      join: vi.fn(),
      emit: vi.fn(),
      on: (
        event: string,
        handler: (tripId: string) => Promise<void>
      ) => {
        handlers[event] = handler;
      },
    };

    ioMock.getConnectionHandler()!(customerSocket);

    await handlers["trip:dispatch"]("   ");

    expect(
      customerSocket.emit
    ).toHaveBeenCalledWith(
      "trip:dispatch:failed",
      {
        tripId: "   ",
        reason: "Trip not found or unavailable",
      }
    );

    expect(
      mocks.tripFindFirst
    ).not.toHaveBeenCalled();

    expect(
      mocks.findNearbyDrivers
    ).not.toHaveBeenCalled();
  });


  it("maps NO_DRIVERS to the customer dispatch event", async () => {
    mocks.findNearbyDrivers.mockResolvedValue([]);
    const handlers: Record<string, (payload: any) => Promise<void>> = {};
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

    expect(mocks.tripFindFirst).toHaveBeenCalledWith({
      where: {
        id: "trip-1",
        customer: {
          userId: "customer-1",
        },
      },
      select: {
        id: true,
      },
    });

    expect(customerSocket.emit).toHaveBeenCalledWith("trip:dispatch:no_drivers", {
      tripId: "trip-1",
      message: "No drivers available nearby. Please try again in a few minutes.",
    });
  });
  it(
    "suppresses confirmation when lifecycle changes after assignment",
    async () => {
      mocks.findNearbyDrivers.mockResolvedValue([
        { driverId: "driver-1" },
      ]);

      mocks.getJobTimeout.mockReturnValue(10);

      mocks.assignTripToDriver.mockResolvedValue({
        driver: {
          id: "driver-1",
          vehicleType: "MOTO",
          licensePlate: "GT-1",
          user: {
            name: "Driver",
            phone: "0200000000",
          },
        },
      });

      // Simulate cancellation winning after the atomic assignment but before
      // dispatch is allowed to tell the driver that the trip is confirmed.
      mocks.tripFindUnique.mockResolvedValueOnce({
        status: "CANCELLED",
        driverId: "driver-1",
      });

      const dispatchPromise =
        dispatchTrip("trip-1");

      for (
        let attempt = 0;
        attempt < 20 &&
        !ioMock.emissions.some(
          (emission) =>
            emission.event === "trip:offer"
        );
        attempt += 1
      ) {
        await new Promise((resolve) =>
          setTimeout(resolve, 0)
        );
      }

      const offer = ioMock.emissions.find(
        (emission) =>
          emission.event === "trip:offer"
      )?.payload as {
        offerId: string;
      };

      expect(offer?.offerId).toEqual(
        expect.any(String)
      );

      const remoteResponseHandler =
        ioMock.getServerSideHandler(
          "dispatch:driver-response"
        );

      expect(remoteResponseHandler).toBeTypeOf(
        "function"
      );

      remoteResponseHandler!({
        tripId: "trip-1",
        offerId: offer.offerId,
        driverId: "driver-1",
        response: "accept",
      });

      await expect(
        dispatchPromise
      ).resolves.toEqual({
        status: "IN_PROGRESS",
        reason:
          "Trip lifecycle changed before driver confirmation",
      });

      expect(
        mocks.assignTripToDriver
      ).toHaveBeenCalled();

      expect(
        mocks.registerActiveTrip
      ).toHaveBeenCalledWith(
        "driver-1",
        "trip-1"
      );

      expect(
        mocks.unregisterActiveTripIfCurrent
      ).toHaveBeenCalledTimes(1);

      expect(
        mocks.unregisterActiveTripIfCurrent
      ).toHaveBeenCalledWith(
        "driver-1",
        "trip-1"
      );

      expect(
        mocks.unregisterActiveTrip
      ).not.toHaveBeenCalled();

      expect(
        ioMock.emissions.some(
          (emission) =>
            emission.event ===
            "trip:confirmed"
        )
      ).toBe(false);
    }
  );
});
