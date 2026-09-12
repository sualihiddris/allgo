import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  customerFindUnique: vi.fn(),
  tripFindFirst: vi.fn(),
  getTripById: vi.fn(),
  cancelTrip: vi.fn(),
  unregisterActiveTripIfCurrent: vi.fn(),
  unregisterActiveTrip: vi.fn(),
  ioTo: vi.fn(),
  ioEmit: vi.fn(),
  authUser: {
    id: "customer-user-1",
    phone: "0241000001",
    role: "CUSTOMER",
  },
}));

vi.mock("../middleware/auth", () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { ...mocks.authUser };
    next();
  },
}));

vi.mock("../middleware/rateLimit", () => ({
  generalRateLimit: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock("../config/database", () => ({
  prisma: {
    customer: { findUnique: mocks.customerFindUnique },
    trip: { findFirst: mocks.tripFindFirst },
  },
}));

vi.mock("../services/trip", () => ({
  createTrip: vi.fn(),
  getTripById: mocks.getTripById,
  cancelTrip: mocks.cancelTrip,
}));

vi.mock("../services/socket", () => ({
  getIO: () => ({
    to: mocks.ioTo,
  }),
}));

vi.mock("../services/tracking", () => ({
  unregisterActiveTrip: mocks.unregisterActiveTrip,
  unregisterActiveTripIfCurrent: mocks.unregisterActiveTripIfCurrent,
}));

import { bookingRouter } from "./booking";

const app = express();
app.use(express.json());
app.use("/api/v1/bookings", bookingRouter);

beforeEach(() => {
  mocks.authUser.id = "customer-user-1";
  mocks.authUser.phone = "0241000001";
  mocks.authUser.role = "CUSTOMER";
});

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


const bookingDetailTrip = {
  id: "trip-detail-1",
  status: "ACCEPTED",
  customerId: "customer-1",
  driverId: "driver-1",
  vehicleType: "MOTO",
  serviceType: "PASSENGER",
  deliveryType: null,
  itemDescription: null,
  pickupLat: 5.301832,
  pickupLng: -1.9930466,
  pickupAddress: "Tarkwa Market",
  destLat: 5.31,
  destLng: -1.98,
  destAddress: "Tarkwa Station",
  customerNote: "Call on arrival",
  distanceMeters: 1500,
  callerName: null,
  callerPhone: null,
  customer: {
    id: "customer-1",
    userId: "customer-user-1",
    user: {
      id: "customer-user-1",
      phone: "0241000001",
      name: "Customer One",
    },
  },
  driver: {
    id: "driver-1",
    userId: "driver-user-1",
    user: {
      id: "driver-user-1",
      phone: "0242000001",
      name: "Driver One",
    },
  },
  feedback: null,
};

describe("GET /api/v1/bookings/trip/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTripById.mockResolvedValue(
      bookingDetailTrip
    );
  });

  it("allows the owning customer to read the trip", async () => {
    const response = await request(app).get(
      "/api/v1/bookings/trip/trip-detail-1"
    );

    expect(response.status).toBe(200);
    expect(response.body.data.trip.id).toBe(
      "trip-detail-1"
    );

    expect(
      mocks.getTripById
    ).toHaveBeenCalledWith(
      "trip-detail-1"
    );
  });

  it("returns 404 to another customer", async () => {
    mocks.authUser.id = "customer-user-2";

    const response = await request(app).get(
      "/api/v1/bookings/trip/trip-detail-1"
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Trip not found",
      },
    });
  });

  it("returns 404 to a non-customer role", async () => {
    mocks.authUser.id = "driver-user-1";
    mocks.authUser.role = "DRIVER";

    const response = await request(app).get(
      "/api/v1/bookings/trip/trip-detail-1"
    );

    expect(response.status).toBe(404);
  });

  it("returns 404 for a call-in trip with no customer owner", async () => {
    mocks.getTripById.mockResolvedValue({
      ...bookingDetailTrip,
      customerId: null,
      customer: null,
      callerName: "Ama Caller",
      callerPhone: "0243000001",
    });

    const response = await request(app).get(
      "/api/v1/bookings/trip/call-in-trip"
    );

    expect(response.status).toBe(404);
  });

  it("returns the same 404 when the trip does not exist", async () => {
    mocks.getTripById.mockResolvedValue(null);

    const response = await request(app).get(
      "/api/v1/bookings/trip/missing-trip"
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Trip not found",
      },
    });
  });
});


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

describe("POST /api/v1/bookings/trip/:id/cancel", () => {
  const cancelledTrip = {
    id: "trip-cancel-1",
    driverId: "driver-1",
    status: "CANCELLED",
    cancelReason: "Changed my mind",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ioTo.mockReturnValue({ emit: mocks.ioEmit });
    mocks.unregisterActiveTripIfCurrent.mockResolvedValue(true);
  });

  it("calls unregisterActiveTripIfCurrent with exact driverId and tripId for an assigned trip", async () => {
    mocks.cancelTrip.mockResolvedValue(cancelledTrip);

    const response = await request(app)
      .post("/api/v1/bookings/trip/trip-cancel-1/cancel")
      .send({ reason: "Changed my mind" });

    expect(response.status).toBe(200);
    expect(mocks.cancelTrip).toHaveBeenCalledWith(
      "trip-cancel-1",
      "customer-user-1",
      "Changed my mind"
    );
    expect(mocks.unregisterActiveTripIfCurrent).toHaveBeenCalledTimes(1);
    expect(mocks.unregisterActiveTripIfCurrent).toHaveBeenCalledWith("driver-1", "trip-cancel-1");
    expect(mocks.unregisterActiveTrip).not.toHaveBeenCalled();
  });

  it("returns the successful cancellation response even if cleanup rejects", async () => {
    mocks.cancelTrip.mockResolvedValue(cancelledTrip);
    mocks.unregisterActiveTripIfCurrent.mockRejectedValue(new Error("redis down"));

    const response = await request(app)
      .post("/api/v1/bookings/trip/trip-cancel-1/cancel")
      .send({ reason: "Changed my mind" });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.trip).toEqual(cancelledTrip);
  });

  it("still notifies the driver with trip:cancelled after committed cancellation, even if cleanup fails", async () => {
    mocks.cancelTrip.mockResolvedValue(cancelledTrip);
    mocks.unregisterActiveTripIfCurrent.mockRejectedValue(new Error("redis down"));

    const response = await request(app)
      .post("/api/v1/bookings/trip/trip-cancel-1/cancel")
      .send({ reason: "Changed my mind" });

    expect(response.status).toBe(200);
    expect(mocks.ioTo).toHaveBeenCalledWith("driver:driver-1");
    expect(mocks.ioEmit).toHaveBeenCalledWith("trip:cancelled", {
      tripId: "trip-cancel-1",
      reason: "Changed my mind",
    });
    expect(mocks.ioTo).toHaveBeenCalledWith("customer:customer-user-1");
    expect(mocks.ioEmit).toHaveBeenCalledWith("trip:status", {
      tripId: "trip-cancel-1",
      status: "CANCELLED",
    });
  });

  it("uses the default reason when the trip has no cancelReason", async () => {
    mocks.cancelTrip.mockResolvedValue({ ...cancelledTrip, cancelReason: null });

    const response = await request(app)
      .post("/api/v1/bookings/trip/trip-cancel-1/cancel")
      .send({});

    expect(response.status).toBe(200);
    expect(mocks.unregisterActiveTripIfCurrent).toHaveBeenCalledWith("driver-1", "trip-cancel-1");
    expect(mocks.ioEmit).toHaveBeenCalledWith("trip:cancelled", {
      tripId: "trip-cancel-1",
      reason: "Customer cancelled",
    });
  });

  it("does not run driver cleanup or driver notification when the cancelled trip has no driver", async () => {
    mocks.cancelTrip.mockResolvedValue({ ...cancelledTrip, driverId: null });

    const response = await request(app)
      .post("/api/v1/bookings/trip/trip-cancel-1/cancel")
      .send({});

    expect(response.status).toBe(200);
    expect(mocks.unregisterActiveTripIfCurrent).not.toHaveBeenCalled();
    expect(mocks.unregisterActiveTrip).not.toHaveBeenCalled();
    expect(mocks.ioTo).not.toHaveBeenCalledWith("driver:driver-1");
    expect(mocks.ioEmit).toHaveBeenCalledWith("trip:status", {
      tripId: "trip-cancel-1",
      status: "CANCELLED",
    });
  });

  it.each([
    {
      label: "authorization error",
      statusCode: 403,
      error: Object.assign(new Error("Forbidden"), { statusCode: 403 }),
    },
    {
      label: "lifecycle error",
      statusCode: 409,
      error: Object.assign(new Error("Trip cannot be cancelled in its current state"), {
        statusCode: 409,
      }),
    },
  ])(
    "propagates the exact $label (statusCode $statusCode) without cleanup or socket side effects",
    async ({ statusCode, error }) => {
      mocks.cancelTrip.mockRejectedValue(error);

      // Isolated app so the error handler never mutates the shared app
      // used by the other cancellation tests.
      let captured: unknown;
      const isolatedApp = express();
      isolatedApp.use(express.json());
      isolatedApp.use("/api/v1/bookings", bookingRouter);
      isolatedApp.use(
        (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
          captured = err;
          res.status(statusCode).json({ success: false });
        }
      );

      const response = await request(isolatedApp)
        .post("/api/v1/bookings/trip/trip-cancel-1/cancel")
        .send({});

      expect(response.status).toBe(statusCode);
      expect(captured).toBe(error);
      expect(mocks.unregisterActiveTripIfCurrent).not.toHaveBeenCalled();
      expect(mocks.unregisterActiveTrip).not.toHaveBeenCalled();
      expect(mocks.ioTo).not.toHaveBeenCalled();
      expect(mocks.ioEmit).not.toHaveBeenCalled();
    }
  );
});
