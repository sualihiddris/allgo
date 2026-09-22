import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  updateDriverNightMode: vi.fn(),
  hasActiveSubscription: vi.fn(),
}));

vi.mock("../middleware", () => ({
  requireAuth: (req: any, _res: any, next: () => void) => {
    req.user = { id: "driver-user-1", role: "DRIVER" };
    next();
  },
}));
vi.mock("../config", () => ({
  prisma: {
    driver: {
      findUnique: mocks.findUnique,
      update: mocks.update,
    },
    trip: { findMany: mocks.findMany },
  },
}));
vi.mock("../services/dispatch", () => ({
  updateDriverNightMode: mocks.updateDriverNightMode,
  hasActiveSubscription: mocks.hasActiveSubscription,
}));

import { driverRouter } from "./driver";

const app = express();
app.use(express.json());
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

describe("PATCH /api/v1/driver/online", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts a new online session with Night rides disabled", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "driver-1",
      userId: "driver-user-1",
      isApproved: true,
      isOnline: false,
      nightMode: false,
    });
    mocks.hasActiveSubscription.mockReturnValue(true);
    mocks.update.mockResolvedValue({
      isOnline: true,
      nightMode: false,
    });

    const response = await request(app)
      .patch("/api/v1/driver/online")
      .send({ isOnline: true });

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "driver-1" },
      data: {
        isOnline: true,
        nightMode: false,
      },
    });
    expect(response.body.data).toMatchObject({
      isOnline: true,
      nightMode: false,
    });
  });

  it("always allows going offline and resets Night rides", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "driver-1",
      userId: "driver-user-1",
      isApproved: true,
      isOnline: true,
      nightMode: true,
    });
    mocks.hasActiveSubscription.mockReturnValue(false);
    mocks.update.mockResolvedValue({
      isOnline: false,
      nightMode: false,
    });

    const response = await request(app)
      .patch("/api/v1/driver/online")
      .send({ isOnline: false });

    expect(response.status).toBe(200);
    expect(mocks.hasActiveSubscription).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "driver-1" },
      data: {
        isOnline: false,
        nightMode: false,
      },
    });
    expect(response.body.data).toMatchObject({
      isOnline: false,
      nightMode: false,
    });
  });
});

describe("PATCH /api/v1/driver/night-mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects enabling Night rides while offline", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "driver-1",
      userId: "driver-user-1",
      isOnline: false,
    });

    const response = await request(app)
      .patch("/api/v1/driver/night-mode")
      .send({ nightMode: true });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("Go online before enabling night rides.");
    expect(mocks.updateDriverNightMode).not.toHaveBeenCalled();
  });

  it("allows enabling Night rides while online", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "driver-1",
      userId: "driver-user-1",
      isOnline: true,
    });
    mocks.updateDriverNightMode.mockResolvedValue(undefined);

    const response = await request(app)
      .patch("/api/v1/driver/night-mode")
      .send({ nightMode: true });

    expect(response.status).toBe(200);
    expect(mocks.updateDriverNightMode).toHaveBeenCalledWith("driver-1", true);
    expect(response.body.data.nightMode).toBe(true);
  });
});
