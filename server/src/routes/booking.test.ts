import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  customerFindUnique: vi.fn(),
  tripFindFirst: vi.fn(),
}));

vi.mock("../middleware/auth", () => ({
  requireAuth: (req: any, _res: any, next: () => void) => {
    req.user = { id: "customer-user-1", role: "CUSTOMER" };
    next();
  },
}));

vi.mock("../middleware/rateLimit", () => ({
  generalRateLimit: (_req: any, _res: any, next: () => void) => next(),
}));

vi.mock("../config/database", () => ({
  prisma: {
    customer: { findUnique: mocks.customerFindUnique },
    trip: { findFirst: mocks.tripFindFirst },
  },
}));

vi.mock("../services/trip", () => ({
  createTrip: vi.fn(),
  getTripById: vi.fn(),
  cancelTrip: vi.fn(),
}));

import { bookingRouter } from "./booking";

const app = express();
app.use("/api/v1/bookings", bookingRouter);

const activeTrip = {
  id: "trip-newest",
  status: "ACTIVE",
  dispatchStatus: null,
  serviceType: "PASSENGER",
  deliveryType: null,
  itemDescription: null,
  vehicleType: "MOTO",
  pickupLat: 5.301832,
  pickupLng: -1.9930466,
  pickupAddress: "Tarkwa Market",
  destLat: 5.31,
  destLng: -1.98,
  destAddress: "Tarkwa Station",
  customerNote: "Call on arrival",
  driver: {
    id: "driver-1",
    licensePlate: "GT-1234-24",
    user: { name: "Kwame Driver", phone: "0241234567" },
  },
};

describe("GET /api/v1/bookings/trips/active", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.customerFindUnique.mockResolvedValue({ id: "customer-1" });
  });

  it("returns null when the authenticated user has no Customer record", async () => {
    mocks.customerFindUnique.mockResolvedValue(null);

    const response = await request(app).get("/api/v1/bookings/trips/active");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ trip: null });
    expect(mocks.tripFindFirst).not.toHaveBeenCalled();
  });

  it("returns the newest active trip in the customer shape", async () => {
    mocks.tripFindFirst.mockResolvedValue(activeTrip);

    const response = await request(app).get("/api/v1/bookings/trips/active");

    expect(response.status).toBe(200);
    expect(response.body.data.trip).toEqual({
      id: "trip-newest",
      status: "ACTIVE",
      dispatchStatus: null,
      serviceType: "PASSENGER",
      deliveryType: null,
      itemDescription: null,
      vehicleType: "MOTO",
      pickup: { lat: 5.301832, lng: -1.9930466, address: "Tarkwa Market" },
      destination: { lat: 5.31, lng: -1.98, address: "Tarkwa Station" },
      customerNote: "Call on arrival",
      driver: {
        id: "driver-1",
        name: "Kwame Driver",
        phone: "0241234567",
        vehiclePlate: "GT-1234-24",
      },
    });
  });

  it("selects newest first and filters to active customer statuses", async () => {
    mocks.tripFindFirst.mockResolvedValue(null);

    const response = await request(app).get("/api/v1/bookings/trips/active");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ trip: null });
    expect(mocks.tripFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          customerId: "customer-1",
          status: { in: ["REQUESTED", "ACCEPTED", "ACTIVE"] },
        },
        select: expect.objectContaining({ dispatchStatus: true }),
        orderBy: { createdAt: "desc" },
      })
    );
  });

  it("omits the driver for requested trips", async () => {
    mocks.tripFindFirst.mockResolvedValue({
      ...activeTrip,
      status: "REQUESTED",
      driver: null,
    });

    const response = await request(app).get("/api/v1/bookings/trips/active");

    expect(response.status).toBe(200);
    expect(response.body.data.trip).not.toHaveProperty("driver");
    expect(response.body.data.trip.status).toBe("REQUESTED");
  });

  it.each(["SEARCHING", "NO_DRIVER_FOUND", "FAILED"] as const)(
    "returns REQUESTED dispatchStatus %s for recovery",
    async (dispatchStatus) => {
      mocks.tripFindFirst.mockResolvedValue({
        ...activeTrip,
        status: "REQUESTED",
        dispatchStatus,
        driver: null,
      });

      const response = await request(app).get("/api/v1/bookings/trips/active");

      expect(response.status).toBe(200);
      expect(response.body.data.trip).toMatchObject({
        status: "REQUESTED",
        dispatchStatus,
      });
    }
  );

  it("preserves dispatchStatus for accepted and active trips", async () => {
    for (const status of ["ACCEPTED", "ACTIVE"] as const) {
      mocks.tripFindFirst.mockResolvedValue({
        ...activeTrip,
        status,
        dispatchStatus: null,
      });

      const response = await request(app).get("/api/v1/bookings/trips/active");

      expect(response.body.data.trip).toMatchObject({ status, dispatchStatus: null });
    }
  });
});
