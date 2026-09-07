import { beforeEach, describe, expect, it, vi } from "vitest";

const { prisma, trips } = vi.hoisted(() => {
  const trips = new Map<string, {
    id: string;
    status: string;
    driverId: string | null;
    acceptedAt: Date | null;
    dispatchStatus: string | null;
  }>();

  const prisma = {
    trip: {
      updateMany: vi.fn(async ({ where, data }: any) => {
        const trip = trips.get(where.id);
        if (
          !trip ||
          trip.status !== where.status ||
          trip.driverId !== where.driverId
        ) {
          return { count: 0 };
        }

        Object.assign(trip, data);
        return { count: 1 };
      }),
      findUniqueOrThrow: vi.fn(async ({ where }: any) => {
        const trip = trips.get(where.id);
        if (!trip) throw new Error("Trip not found");
        return trip;
      }),
    },
  };

  return { prisma, trips };
});

vi.mock("../config/database", () => ({ prisma }));
vi.mock("../config/redis", () => ({ redis: {} }));

import { assignTripToDriver } from "./dispatch";

describe("assignTripToDriver", () => {
  beforeEach(() => {
    trips.clear();
    vi.clearAllMocks();
    trips.set("trip-1", {
      id: "trip-1",
      status: "REQUESTED",
      driverId: null,
      acceptedAt: null,
      dispatchStatus: "SEARCHING",
    });
  });

  it("assigns a requested, unassigned trip", async () => {
    const assigned = await assignTripToDriver("trip-1", "driver-a");

    expect(assigned.driverId).toBe("driver-a");
    expect(assigned.status).toBe("ACCEPTED");
    expect(assigned.acceptedAt).toBeInstanceOf(Date);
    expect(prisma.trip.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "trip-1", status: "REQUESTED", driverId: null },
        data: expect.objectContaining({ dispatchStatus: null }),
      })
    );
  });

  it("allows only one of two concurrent claims to succeed", async () => {
    const results = await Promise.allSettled([
      assignTripToDriver("trip-1", "driver-a"),
      assignTripToDriver("trip-1", "driver-b"),
    ]);

    const fulfilledResults = results.filter((result) => result.status === "fulfilled");
    const rejectedResults = results.filter((result) => result.status === "rejected");
    expect(fulfilledResults).toHaveLength(1);
    expect(rejectedResults).toHaveLength(1);

    const successfulResult = fulfilledResults[0];
    if (successfulResult.status !== "fulfilled") {
      throw new Error("Expected one successful claim");
    }

    const winningDriverId = successfulResult.value.driverId;
    const finalTrip = trips.get("trip-1");
    const losingDriverId = winningDriverId === "driver-a" ? "driver-b" : "driver-a";

    expect(["driver-a", "driver-b"]).toContain(finalTrip?.driverId);
    expect(finalTrip?.driverId).toBe(winningDriverId);
    expect(finalTrip?.driverId).not.toBe(losingDriverId);
    expect(finalTrip?.status).toBe("ACCEPTED");
  });

  it("rejects a trip that is already accepted", async () => {
    trips.get("trip-1")!.status = "ACCEPTED";
    trips.get("trip-1")!.driverId = "driver-a";

    await expect(assignTripToDriver("trip-1", "driver-b")).rejects.toThrow(
      "Trip is no longer available for assignment"
    );
    expect(trips.get("trip-1")?.driverId).toBe("driver-a");
  });

  it("rejects a cancelled trip", async () => {
    trips.get("trip-1")!.status = "CANCELLED";

    await expect(assignTripToDriver("trip-1", "driver-a")).rejects.toThrow(
      "Trip is no longer available for assignment"
    );
    expect(trips.get("trip-1")?.driverId).toBeNull();
  });
});
