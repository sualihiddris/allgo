import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tripFindUnique: vi.fn(),
  tripUpdateMany: vi.fn(),
  tripFindUniqueOrThrow: vi.fn(),
  driverUpdate: vi.fn(),
  emit: vi.fn(),
  to: vi.fn(),
  unregisterActiveTrip: vi.fn(),
  unregisterActiveTripIfCurrent: vi.fn(),
}));

vi.mock("../middleware", () => ({
  requireAuth: (req: any, _res: any, next: () => void) => {
    req.user = { id: "driver-user-1", role: "DRIVER" };
    next();
  },
}));

vi.mock("../config", () => ({
  prisma: {
    trip: {
      findUnique: mocks.tripFindUnique,
      updateMany: mocks.tripUpdateMany,
      findUniqueOrThrow: mocks.tripFindUniqueOrThrow,
    },
    driver: {
      update: mocks.driverUpdate,
    },
  },
}));

vi.mock("../services/socket", () => ({
  getIO: () => ({
    to: mocks.to,
  }),
}));

vi.mock("../services/tracking", () => ({
  unregisterActiveTrip: mocks.unregisterActiveTrip,
  unregisterActiveTripIfCurrent: mocks.unregisterActiveTripIfCurrent,
}));

import { trackingRouter } from "./tracking";

const app = express();
app.use(express.json());
app.use("/api/v1/tracking", trackingRouter);

const trip = {
  id: "trip-1",
  driverId: "driver-1",
  driver: { userId: "driver-user-1" },
  customer: {
    id: "customer-1",
    userId: "customer-user-1",
  },
};

describe("PUT /api/v1/tracking/trip/:id/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.to.mockReturnValue({
      emit: mocks.emit,
    });

    mocks.driverUpdate.mockResolvedValue({});
    mocks.unregisterActiveTrip.mockResolvedValue(undefined);
    mocks.unregisterActiveTripIfCurrent.mockResolvedValue(true);
    mocks.tripFindUnique.mockResolvedValue(trip);
    mocks.tripUpdateMany.mockResolvedValue({ count: 1 });
  });

  it(
    "stores and emits canonical ACTIVE status for a STARTED request without terminal cleanup",
    async () => {
      mocks.tripFindUniqueOrThrow.mockResolvedValue({
        id: "trip-1",
        status: "ACTIVE",
        startedAt: new Date(
          "2026-09-07T10:00:00.000Z"
        ),
        completedAt: null,
      });

      const response = await request(app)
        .put(
          "/api/v1/tracking/trip/trip-1/status"
        )
        .send({
          status: "STARTED",
        });

      expect(response.status).toBe(200);

      expect(
        mocks.tripUpdateMany
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: "trip-1",
            driverId: "driver-1",
            status: "ACCEPTED",
          },
          data: expect.objectContaining({
            status: "ACTIVE",
            startedAt: expect.any(Date),
          }),
        })
      );

      expect(mocks.to).toHaveBeenCalledWith(
        "customer:customer-user-1"
      );

      expect(mocks.emit).toHaveBeenCalledWith(
        "trip:status",
        {
          tripId: "trip-1",
          status: "ACTIVE",
        }
      );

      // STARTED is not a terminal transition: it must not perform
      // active-trip cleanup of any kind.
      expect(
        mocks.unregisterActiveTripIfCurrent
      ).not.toHaveBeenCalled();
      expect(
        mocks.unregisterActiveTrip
      ).not.toHaveBeenCalled();
    }
  );

  it(
    "emits COMPLETED status, increments totalTrips and unregisters the active trip via compare-and-delete",
    async () => {
      mocks.tripFindUniqueOrThrow.mockResolvedValue({
        id: "trip-1",
        status: "COMPLETED",
        startedAt: new Date(
          "2026-09-07T10:00:00.000Z"
        ),
        completedAt: new Date(
          "2026-09-07T10:30:00.000Z"
        ),
      });

      const response = await request(app)
        .put(
          "/api/v1/tracking/trip/trip-1/status"
        )
        .send({
          status: "COMPLETED",
        });

      expect(response.status).toBe(200);

      expect(
        mocks.tripUpdateMany
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: "trip-1",
            driverId: "driver-1",
            status: "ACTIVE",
          },
          data: expect.objectContaining({
            status: "COMPLETED",
            completedAt: expect.any(Date),
          }),
        })
      );

      expect(mocks.driverUpdate).toHaveBeenCalledWith({
        where: { id: "driver-1" },
        data: {
          totalTrips: {
            increment: 1,
          },
        },
      });

      // Terminal cleanup must be trip-specific compare-and-delete with the
      // exact (driverId, tripId) pair.
      expect(
        mocks.unregisterActiveTripIfCurrent
      ).toHaveBeenCalledTimes(1);
      expect(
        mocks.unregisterActiveTripIfCurrent
      ).toHaveBeenCalledWith("driver-1", "trip-1");

      // The blind legacy unregister must never run on the terminal path.
      expect(
        mocks.unregisterActiveTrip
      ).not.toHaveBeenCalled();

      expect(mocks.emit).toHaveBeenCalledWith(
        "trip:status",
        {
          tripId: "trip-1",
          status: "COMPLETED",
        }
      );

      expect(mocks.to).toHaveBeenCalledWith(
        "customer:customer-user-1"
      );

      expect(mocks.to).not.toHaveBeenCalledWith(
        "customer:customer-1"
      );
    }
  );

  it(
    "unregisters the active trip via compare-and-delete on a driver CANCELLED transition",
    async () => {
      mocks.tripFindUniqueOrThrow.mockResolvedValue({
        id: "trip-1",
        status: "CANCELLED",
        startedAt: null,
        completedAt: null,
      });

      const response = await request(app)
        .put(
          "/api/v1/tracking/trip/trip-1/status"
        )
        .send({
          status: "CANCELLED",
        });

      expect(response.status).toBe(200);

      expect(
        mocks.tripUpdateMany
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: "trip-1",
            driverId: "driver-1",
            status: "ACCEPTED",
          },
          data: expect.objectContaining({
            status: "CANCELLED",
          }),
        })
      );

      expect(
        mocks.unregisterActiveTripIfCurrent
      ).toHaveBeenCalledTimes(1);
      expect(
        mocks.unregisterActiveTripIfCurrent
      ).toHaveBeenCalledWith("driver-1", "trip-1");

      expect(
        mocks.unregisterActiveTrip
      ).not.toHaveBeenCalled();

      expect(mocks.emit).toHaveBeenCalledWith(
        "trip:status",
        {
          tripId: "trip-1",
          status: "CANCELLED",
        }
      );
    }
  );

  it(
    "returns 409 when the authoritative trip state changed before STARTED",
    async () => {
      mocks.tripUpdateMany.mockResolvedValue({
        count: 0,
      });

      const response = await request(app)
        .put(
          "/api/v1/tracking/trip/trip-1/status"
        )
        .send({
          status: "STARTED",
        });

      expect(response.status).toBe(409);

      expect(
        mocks.tripFindUniqueOrThrow
      ).not.toHaveBeenCalled();

      expect(mocks.emit).not.toHaveBeenCalled();

      expect(
        mocks.unregisterActiveTripIfCurrent
      ).not.toHaveBeenCalled();
      expect(
        mocks.unregisterActiveTrip
      ).not.toHaveBeenCalled();
    }
  );
});
