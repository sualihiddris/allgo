import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
}));

vi.mock("../config/database", () => ({
  prisma: {
    driver: {
      updateMany: mocks.updateMany,
    },
  },
}));

import { persistDriverLocationSnapshot } from "./driverLocation";

describe("persistDriverLocationSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts the first snapshot when no ordering timestamp exists", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });
    const timestamp = new Date("2026-09-15T09:00:00.000Z");

    await expect(
      persistDriverLocationSnapshot("driver-1", 5.3, -1.9, timestamp)
    ).resolves.toEqual({ persisted: true });

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        id: "driver-1",
        OR: [
          { lastLocationAt: null },
          { lastLocationAt: { lt: timestamp } },
        ],
      },
      data: {
        lastLocation: JSON.stringify({
          lat: 5.3,
          lng: -1.9,
          timestamp: timestamp.toISOString(),
        }),
        lastLocationAt: timestamp,
      },
    });
  });

  it("accepts a newer snapshot", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      persistDriverLocationSnapshot(
        "driver-1",
        5.31,
        -1.91,
        new Date("2026-09-15T09:01:00.000Z")
      )
    ).resolves.toEqual({ persisted: true });
  });

  it.each([
    ["an older", new Date("2026-09-15T08:59:00.000Z")],
    ["an equal", new Date("2026-09-15T09:00:00.000Z")],
  ])("%s snapshot as stale or ignored", async (_description, timestamp) => {
    mocks.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      persistDriverLocationSnapshot("driver-1", 5.3, -1.9, timestamp)
    ).resolves.toEqual({ persisted: false });
  });

  it("propagates genuine Prisma exceptions", async () => {
    const databaseError = new Error("MySQL unavailable");
    mocks.updateMany.mockRejectedValue(databaseError);

    await expect(
      persistDriverLocationSnapshot(
        "driver-1",
        5.3,
        -1.9,
        new Date("2026-09-15T09:00:00.000Z")
      )
    ).rejects.toBe(databaseError);
  });
});
