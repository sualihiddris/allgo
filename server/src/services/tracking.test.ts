import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redisGet: vi.fn(),
  compareAndDelete: vi.fn(),
  tripFindFirst: vi.fn(),
  getDriverLocation: vi.fn(),
}));

vi.mock("../config/database", () => ({
  prisma: {
    trip: {
      findFirst: mocks.tripFindFirst,
    },
  },
}));

vi.mock("../config/redis", () => ({
  redis: {
    get: mocks.redisGet,
    setex: vi.fn(),
    del: vi.fn(),
    exists: vi.fn(),
  },
  compareAndDelete: mocks.compareAndDelete,
}));

vi.mock("./dispatch", () => ({
  getDriverLocation: mocks.getDriverLocation,
}));

import {
  getActiveTripForDriver,
  startTripTracking,
} from "./tracking";

describe("active-trip cache reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.compareAndDelete.mockResolvedValue(true);
    mocks.getDriverLocation.mockResolvedValue(null);
  });

  it("returns undefined without querying MySQL when no Redis mapping exists", async () => {
    mocks.redisGet.mockResolvedValue(null);

    await expect(
      getActiveTripForDriver("driver-1")
    ).resolves.toBeUndefined();

    expect(mocks.tripFindFirst).not.toHaveBeenCalled();
    expect(mocks.compareAndDelete).not.toHaveBeenCalled();
  });

  it("returns the cached trip when MySQL confirms the driver and active lifecycle", async () => {
    mocks.redisGet.mockResolvedValue("trip-1");
    mocks.tripFindFirst.mockResolvedValue({
      id: "trip-1",
    });

    await expect(
      getActiveTripForDriver("driver-1")
    ).resolves.toBe("trip-1");

    expect(mocks.tripFindFirst).toHaveBeenCalledWith({
      where: {
        id: "trip-1",
        driverId: "driver-1",
        status: {
          in: ["ACCEPTED", "ACTIVE"],
        },
      },
      select: {
        id: true,
      },
    });

    expect(mocks.compareAndDelete).not.toHaveBeenCalled();
  });

  it("self-heals a stale Redis mapping and returns undefined", async () => {
    mocks.redisGet.mockResolvedValue("trip-stale");
    mocks.tripFindFirst.mockResolvedValue(null);

    await expect(
      getActiveTripForDriver("driver-1")
    ).resolves.toBeUndefined();

    expect(mocks.compareAndDelete).toHaveBeenCalledTimes(1);
    expect(mocks.compareAndDelete).toHaveBeenCalledWith(
      "active_trip:driver-1",
      "trip-stale"
    );
  });

  it("still rejects a stale mapping when Redis cleanup itself fails", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    mocks.redisGet.mockResolvedValue("trip-stale");
    mocks.tripFindFirst.mockResolvedValue(null);
    mocks.compareAndDelete.mockRejectedValue(
      new Error("redis unavailable")
    );

    try {
      await expect(
        getActiveTripForDriver("driver-1")
      ).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("returns not found when the trip is not owned by the customer", async () => {
    mocks.tripFindFirst.mockResolvedValue(null);

    await expect(
      startTripTracking(
        {} as any,
        "trip-1",
        "unrelated-customer"
      )
    ).rejects.toThrow("Trip not found");

    expect(
      mocks.tripFindFirst
    ).toHaveBeenCalledWith({
      where: {
        id: "trip-1",
        customer: {
          userId: "unrelated-customer",
        },
      },
      include: {
        driver: true,
      },
    });
    expect(mocks.getDriverLocation).not.toHaveBeenCalled();
  });
  it("still reports an unassigned driver to the owning customer", async () => {
    mocks.tripFindFirst.mockResolvedValue({
      id: "trip-1",
      status: "REQUESTED",
      driver: null,
    });

    await expect(
      startTripTracking(
        {} as any,
        "trip-1",
        "customer-user-1"
      )
    ).rejects.toThrow("No driver assigned to trip");
    expect(mocks.getDriverLocation).not.toHaveBeenCalled();
  });
  it("rejects starting live tracking for a terminal trip", async () => {
    mocks.tripFindFirst.mockResolvedValue({
      id: "trip-1",
      status: "COMPLETED",
      driver: {
        id: "driver-1",
        userId: "driver-user-1",
      },
      customer: {
        userId: "customer-user-1",
      },
    });

    await expect(
      startTripTracking(
        {} as any,
        "trip-1",
        "customer-user-1"
      )
    ).rejects.toThrow("Trip is not active");
    expect(mocks.getDriverLocation).not.toHaveBeenCalled();
  });

  it("allows tracking for an ACTIVE trip owned by the customer", async () => {
    mocks.tripFindFirst.mockResolvedValue({
      id: "trip-1",
      status: "ACTIVE",
      driver: {
        id: "driver-1",
        userId: "driver-user-1",
      },
      customer: {
        userId: "customer-user-1",
      },
    });

    mocks.getDriverLocation.mockResolvedValue({
      lat: 5.302,
      lng: -1.992,
      timestamp: Date.now(),
    });

    await expect(
      startTripTracking(
        {} as any,
        "trip-1",
        "customer-user-1"
      )
    ).resolves.toEqual({
      trackingRoom: "tracking:trip:trip-1",
      driverId: "driver-user-1",
      currentLocation: {
        lat: 5.302,
        lng: -1.992,
      },
    });
    expect(mocks.getDriverLocation).toHaveBeenCalledWith("driver-1");
  });

  it("returns null when no current driver location is available", async () => {
    mocks.tripFindFirst.mockResolvedValue({
      id: "trip-1",
      status: "ACTIVE",
      driver: {
        id: "driver-1",
        userId: "driver-user-1",
      },
      customer: {
        userId: "customer-user-1",
      },
    });

    await expect(
      startTripTracking(
        {} as any,
        "trip-1",
        "customer-user-1"
      )
    ).resolves.toEqual({
      trackingRoom: "tracking:trip:trip-1",
      driverId: "driver-user-1",
      currentLocation: null,
    });
    expect(mocks.getDriverLocation).toHaveBeenCalledWith("driver-1");
  });
});
