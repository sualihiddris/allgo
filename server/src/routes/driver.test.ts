import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("../middleware", () => ({
  requireAuth: (req: any, _res: any, next: () => void) => {
    req.user = { id: "driver-user-1", role: "DRIVER" };
    next();
  },
}));
vi.mock("../config", () => ({
  prisma: {
    driver: { findUnique: mocks.findUnique },
    trip: { findMany: mocks.findMany },
  },
}));
vi.mock("../services/dispatch", () => ({
  updateDriverNightMode: vi.fn(),
  hasActiveSubscription: vi.fn(),
}));

import { driverRouter } from "./driver";

const app = express();
app.use("/api/v1/driver", driverRouter);

const trip = {
  id: "trip-1",
  serviceType: "PASSENGER",
  deliveryType: null,
  itemDescription: null,
  vehicleType: "MOTO",
  status: "ACCEPTED",
  pickupLat: 5.298625,
  pickupLng: -2.001296,
  pickupAddress: "Pickup",
  destLat: 5.3,
  destLng: -2,
  destAddress: "Destination",
  customerNote: null,
  createdAt: new Date("2026-09-05T00:00:00.000Z"),
};

describe("GET /api/v1/driver/trips/active", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue({ id: "driver-1", userId: "driver-user-1" });
  });

  it("recovers CALL customer identity without a customer relation", async () => {
    mocks.findMany.mockResolvedValue([
      { ...trip, callerName: "Ama", callerPhone: "0241234567", customer: null },
    ]);

    const response = await request(app).get("/api/v1/driver/trips/active");

    expect(response.status).toBe(200);
    expect(response.body.data.trips[0].customer).toEqual({
      name: "Ama",
      phone: "0241234567",
    });
  });

  it("prefers APP customer identity when the relation is present", async () => {
    mocks.findMany.mockResolvedValue([
      {
        ...trip,
        callerName: "Caller fallback",
        callerPhone: "0200000000",
        customer: { user: { name: "App Customer", phone: "0500000000" } },
      },
    ]);

    const response = await request(app).get("/api/v1/driver/trips/active");

    expect(response.status).toBe(200);
    expect(response.body.data.trips[0].customer).toEqual({
      name: "App Customer",
      phone: "0500000000",
    });
  });
});
