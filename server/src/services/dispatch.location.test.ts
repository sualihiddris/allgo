import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redisGet: vi.fn(),
  redisSetex: vi.fn(),
  driverFindUnique: vi.fn(),
  driverUpdate: vi.fn(),
}));

vi.mock("../config/redis", () => ({
  redis: {
    get: mocks.redisGet,
    setex: mocks.redisSetex,
  },
}));

vi.mock("../config/database", () => ({
  prisma: {
    driver: {
      findUnique: mocks.driverFindUnique,
      update: mocks.driverUpdate,
    },
  },
}));

import {
  getDriverLocation,
  updateDriverLocation,
} from "./dispatch";

describe("driver location validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.redisSetex.mockResolvedValue("OK");
    mocks.driverUpdate.mockResolvedValue({});
    mocks.redisGet.mockResolvedValue(null);
    mocks.driverFindUnique.mockResolvedValue(null);
  });

  it("persists a valid driver location to Redis and MySQL", async () => {
    await updateDriverLocation(
      "driver-1",
      5.30233,
      -1.99255
    );

    expect(mocks.redisSetex).toHaveBeenCalledTimes(1);
    expect(mocks.driverUpdate).toHaveBeenCalledTimes(1);

    const redisPayload = JSON.parse(
      mocks.redisSetex.mock.calls[0][2]
    );

    expect(redisPayload).toMatchObject({
      lat: 5.30233,
      lng: -1.99255,
    });
    expect(redisPayload.timestamp).toEqual(
      expect.any(Number)
    );

    const databasePayload = JSON.parse(
      mocks.driverUpdate.mock.calls[0][0].data.lastLocation
    );

    expect(databasePayload).toMatchObject({
      lat: 5.30233,
      lng: -1.99255,
    });
    expect(
      Number.isNaN(Date.parse(databasePayload.timestamp))
    ).toBe(false);
  });

  it.each([
    [91, 0],
    [-91, 0],
    [0, 181],
    [0, -181],
    [Number.POSITIVE_INFINITY, 0],
    [0, Number.NEGATIVE_INFINITY],
    [Number.NaN, 0],
  ])(
    "rejects an invalid location before persistence: lat=%s lng=%s",
    async (lat, lng) => {
      await expect(
        updateDriverLocation(
          "driver-1",
          lat,
          lng
        )
      ).rejects.toThrow(
        "Invalid driver location"
      );

      expect(
        mocks.redisSetex
      ).not.toHaveBeenCalled();

      expect(
        mocks.driverUpdate
      ).not.toHaveBeenCalled();
    }
  );

  it("accepts the geographic boundary coordinates", async () => {
    await expect(
      updateDriverLocation(
        "driver-1",
        90,
        180
      )
    ).resolves.toBeUndefined();

    await expect(
      updateDriverLocation(
        "driver-1",
        -90,
        -180
      )
    ).resolves.toBeUndefined();

    expect(
      mocks.redisSetex
    ).toHaveBeenCalledTimes(2);

    expect(
      mocks.driverUpdate
    ).toHaveBeenCalledTimes(2);
  });

  it("rejects an out-of-range location from Redis", async () => {
    mocks.redisGet.mockResolvedValue(
      JSON.stringify({
        lat: 91,
        lng: -1,
        timestamp: Date.now(),
      })
    );

    await expect(
      getDriverLocation("driver-1")
    ).resolves.toBeNull();

    expect(
      mocks.driverFindUnique
    ).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range location from the MySQL fallback", async () => {
    mocks.redisGet.mockResolvedValue(null);

    mocks.driverFindUnique.mockResolvedValue({
      lastLocation: JSON.stringify({
        lat: 5.3,
        lng: 181,
        timestamp: new Date().toISOString(),
      }),
    });

    await expect(
      getDriverLocation("driver-1")
    ).resolves.toBeNull();
  });

  it("returns a valid fresh location from Redis", async () => {
    const timestamp = Date.now();

    mocks.redisGet.mockResolvedValue(
      JSON.stringify({
        lat: 5.30233,
        lng: -1.99255,
        timestamp,
      })
    );

    await expect(
      getDriverLocation("driver-1")
    ).resolves.toEqual({
      lat: 5.30233,
      lng: -1.99255,
      timestamp,
    });
  });
});