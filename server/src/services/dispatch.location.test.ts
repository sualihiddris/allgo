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
    expect(Date.parse(databasePayload.timestamp)).toBe(redisPayload.timestamp);
  });

  it("rejects a Redis failure without attempting MySQL persistence", async () => {
    const redisError = new Error("Redis unavailable");
    mocks.redisSetex.mockRejectedValue(redisError);

    await expect(
      updateDriverLocation("driver-1", 5.30233, -1.99255)
    ).rejects.toBe(redisError);

    expect(mocks.driverUpdate).not.toHaveBeenCalled();
  });

  it("resolves after Redis success when MySQL persistence fails", async () => {
    const persistenceError = new Error("MySQL unavailable");
    mocks.driverUpdate.mockRejectedValue(persistenceError);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      updateDriverLocation("driver-1", 5.30233, -1.99255)
    ).resolves.toBeUndefined();

    expect(mocks.redisSetex).toHaveBeenCalledTimes(1);
    expect(mocks.driverUpdate).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "[Dispatch] Failed to persist location for driver driver-1:",
      persistenceError
    );
    expect(mocks.redisGet).not.toHaveBeenCalled();
    warnSpy.mockRestore();
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

  it("falls back to a valid fresh MySQL location when Redis location is out of range", async () => {
    mocks.redisGet.mockResolvedValue(
      JSON.stringify({
        lat: 91,
        lng: -1,
        timestamp: Date.now(),
      })
    );
    const timestamp = new Date().toISOString();
    mocks.driverFindUnique.mockResolvedValue({
      lastLocation: JSON.stringify({
        lat: 5.3,
        lng: -1.9,
        timestamp,
      }),
    });

    await expect(
      getDriverLocation("driver-1")
    ).resolves.toEqual({
      lat: 5.3,
      lng: -1.9,
      timestamp: Date.parse(timestamp),
    });

    expect(
      mocks.driverFindUnique
    ).toHaveBeenCalledTimes(1);
  });

  it("falls back to a valid fresh MySQL location when Redis JSON is malformed", async () => {
    mocks.redisGet.mockResolvedValue("{not-json");
    const timestamp = new Date().toISOString();
    mocks.driverFindUnique.mockResolvedValue({
      lastLocation: JSON.stringify({
        lat: 5.3,
        lng: -1.9,
        timestamp,
      }),
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      getDriverLocation("driver-1")
    ).resolves.toEqual({
      lat: 5.3,
      lng: -1.9,
      timestamp: Date.parse(timestamp),
    });

    expect(mocks.driverFindUnique).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it("falls back to a valid fresh MySQL location when Redis location is stale", async () => {
    mocks.redisGet.mockResolvedValue(
      JSON.stringify({
        lat: 5.3,
        lng: -1.9,
        timestamp: Date.now() - 5 * 60 * 1000 - 1,
      })
    );
    const timestamp = new Date().toISOString();
    mocks.driverFindUnique.mockResolvedValue({
      lastLocation: JSON.stringify({
        lat: 5.4,
        lng: -1.8,
        timestamp,
      }),
    });

    await expect(
      getDriverLocation("driver-1")
    ).resolves.toEqual({
      lat: 5.4,
      lng: -1.8,
      timestamp: Date.parse(timestamp),
    });

    expect(mocks.driverFindUnique).toHaveBeenCalledTimes(1);
  });

  it("falls back to a valid fresh MySQL location when Redis GET fails", async () => {
    const redisError = new Error("Redis unavailable");
    mocks.redisGet.mockRejectedValue(redisError);
    const timestamp = new Date().toISOString();
    mocks.driverFindUnique.mockResolvedValue({
      lastLocation: JSON.stringify({
        lat: 5.4,
        lng: -1.8,
        timestamp,
      }),
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      getDriverLocation("driver-1")
    ).resolves.toEqual({
      lat: 5.4,
      lng: -1.8,
      timestamp: Date.parse(timestamp),
    });

    expect(mocks.driverFindUnique).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "[Dispatch] Failed to read cached location for driver driver-1:",
      redisError
    );
    warnSpy.mockRestore();
  });

  it("returns null when Redis GET fails and MySQL location is missing", async () => {
    mocks.redisGet.mockRejectedValue(new Error("Redis unavailable"));

    await expect(getDriverLocation("driver-1")).resolves.toBeNull();

    expect(mocks.driverFindUnique).toHaveBeenCalledTimes(1);
  });

  it("logs Redis GET failures with the driver id and error", async () => {
    const redisError = new Error("Redis connection lost");
    mocks.redisGet.mockRejectedValue(redisError);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await getDriverLocation("driver-1");

    expect(warnSpy).toHaveBeenCalledWith(
      "[Dispatch] Failed to read cached location for driver driver-1:",
      redisError
    );
    warnSpy.mockRestore();
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

    expect(mocks.driverFindUnique).not.toHaveBeenCalled();
  });

  it("returns null when the MySQL fallback is stale", async () => {
    mocks.redisGet.mockResolvedValue(null);
    mocks.driverFindUnique.mockResolvedValue({
      lastLocation: JSON.stringify({
        lat: 5.3,
        lng: -1.9,
        timestamp: new Date(
          Date.now() - 5 * 60 * 1000 - 1
        ).toISOString(),
      }),
    });

    await expect(getDriverLocation("driver-1")).resolves.toBeNull();
  });
});