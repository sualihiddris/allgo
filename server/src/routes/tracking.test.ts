import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tripFindUnique: vi.fn(),
  tripUpdate: vi.fn(),
  driverUpdate: vi.fn(),
  emit: vi.fn(),
  to: vi.fn(),
  unregisterActiveTrip: vi.fn(),
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
      update: mocks.tripUpdate,
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
}));

import { trackingRouter } from "./tracking";

const app = express();
app.use(express.json());
app.use("/api/v1/tracking", trackingRouter);

const trip = {
  id: "trip-1",
  driverId: "driver-1",
  driver: { userId: "driver-user-1" },
  customer: { id: "customer-1", userId: "customer-user-1" },
};

describe("PUT /api/v1/tracking/trip/:id/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.to.mockReturnValue({ emit: mocks.emit });
    mocks.driverUpdate.mockResolvedValue({});
    mocks.unregisterActiveTrip.mockResolvedValue(undefined);
    mocks.tripFindUnique.mockResolvedValue(trip);
  });

  it("stores and emits canonical ACTIVE status for a STARTED request", async () => {
    mocks.tripUpdate.mockResolvedValue({
      id: "trip-1",
      status: "ACTIVE",
      startedAt: new Date("2026-09-07T10:00:00.000Z"),
      completedAt: null,
    });

    const response = await request(app)
      .put("/api/v1/tracking/trip/trip-1/status")
      .send({ status: "STARTED" });

    expect(response.status).toBe(200);
    expect(mocks.tripUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "trip-1" },
        data: expect.objectContaining({ status: "ACTIVE" }),
      })
    );
    expect(mocks.to).toHaveBeenCalledWith("customer:customer-user-1");
    expect(mocks.emit).toHaveBeenCalledWith("trip:status", {
      tripId: "trip-1",
      status: "ACTIVE",
    });
  });

  it("emits COMPLETED status with the trip id to the customer user room", async () => {
    mocks.tripUpdate.mockResolvedValue({
      id: "trip-1",
      status: "COMPLETED",
      startedAt: new Date("2026-09-07T10:00:00.000Z"),
      completedAt: new Date("2026-09-07T10:30:00.000Z"),
    });

    const response = await request(app)
      .put("/api/v1/tracking/trip/trip-1/status")
      .send({ status: "COMPLETED" });

    expect(response.status).toBe(200);
    expect(mocks.emit).toHaveBeenCalledWith("trip:status", {
      tripId: "trip-1",
      status: "COMPLETED",
    });
    expect(mocks.to).toHaveBeenCalledWith("customer:customer-user-1");
    expect(mocks.to).not.toHaveBeenCalledWith("customer:customer-1");
  });
});
