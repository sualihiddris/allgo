import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createTrip: vi.fn(),
  findDriverWithExpansion: vi.fn(),
  dispatchTrip: vi.fn(),
  geocode: vi.fn(),
  tripUpdateMany: vi.fn(),
  tripFindUnique: vi.fn(),
  driverFindMany: vi.fn(),
  driverCount: vi.fn(),
  customerCount: vi.fn(),
  tripCount: vi.fn(),
  feedbackCount: vi.fn(),
  getDriverLocation: vi.fn(),
  resolveBranchFilter: vi.fn(),
}));

vi.mock("../middleware/auth", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
}));
vi.mock("../middleware/branchScope", () => ({
  requireAdmin: (req: any, _res: any, next: () => void) => {
    req.user = { id: "admin-1", role: "ADMIN" };
    req.admin = { id: "admin-record-1", role: "SUPER_ADMIN", branchId: null };
    next();
  },
  requireSuperAdmin: (_req: any, _res: any, next: () => void) => next(),
  branchReadScope: () => ({}),
  resolveBranchFilter: mocks.resolveBranchFilter,
  assertBranchWriteAccess: () => undefined,
}));
vi.mock("../config/database", () => ({
  prisma: {
    trip: {
      updateMany: mocks.tripUpdateMany,
      findUnique: mocks.tripFindUnique,
      count: mocks.tripCount,
    },
    driver: {
      findMany: mocks.driverFindMany,
      count: mocks.driverCount,
    },
    customer: { count: mocks.customerCount },
    feedback: { count: mocks.feedbackCount },
  },
}));
vi.mock("../services/trip", () => ({ createTrip: mocks.createTrip }));
vi.mock("../services/dispatch", () => ({
  findDriverWithExpansion: mocks.findDriverWithExpansion,
  getDriverLocation: mocks.getDriverLocation,
  isNightServiceHours: vi.fn(() => false),
}));
vi.mock("../services/socket", () => ({ dispatchTrip: mocks.dispatchTrip }));
vi.mock("@allgo/shared/constants/nightService", () => ({
  isCallInHours: vi.fn(() => true),
  isVehicleAllowedAtNight: vi.fn(() => true),
}));
vi.mock("../services/maps", () => ({ mapsService: { geocode: mocks.geocode } }));
vi.mock("../services/sms", () => ({ sendSms: vi.fn() }));
vi.mock("../services/totp", () => ({
  generateTotpSecret: vi.fn(),
  generateTotpQrCode: vi.fn(),
  verifyTotpCode: vi.fn(),
}));
vi.mock("../services/auditLog", () => ({ logAdminAction: vi.fn() }));

import adminRouter from "./admin";

const app = express();
app.use(express.json());
app.use("/api/v1/admin", adminRouter);

const callInPayload = {
  callerPhone: "0241234567",
  callerName: "Ama",
  vehicleType: "MOTO",
  serviceType: "PASSENGER",
  pickup: { lat: 5, lng: -1, address: "Pickup" },
  destination: { lat: 5.1, lng: -1.1, address: "Destination" },
};

const createdTrip = {
  id: "trip-call-1",
  status: "REQUESTED",
  source: "CALL",
  callerPhone: "0241234567",
  callerName: "Ama",
  vehicleType: "MOTO",
  serviceType: "PASSENGER",
  deliveryType: null,
  pickupLat: 5,
  pickupLng: -1,
  pickupAddress: "Pickup",
  destLat: 5.1,
  destLng: -1.1,
  destAddress: "Destination",
  createdAt: new Date("2026-09-04T00:00:00.000Z"),
};

describe("POST /api/v1/admin/trips/call-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createTrip.mockResolvedValue({ trip: createdTrip });
    mocks.findDriverWithExpansion.mockResolvedValue({
      success: true,
      driver: { driverId: "driver-1", name: "Driver" },
      message: "Driver found",
    });
    mocks.dispatchTrip.mockResolvedValue({ status: "NO_DRIVERS", message: "exhausted" });
    mocks.tripUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("returns the existing creation error when createTrip fails", async () => {
    mocks.createTrip.mockRejectedValue(new Error("database unavailable"));

    const response = await request(app).post("/api/v1/admin/trips/call-in").send(callInPayload);

    expect(response.status).toBe(500);
    expect(response.body.error).toBe("Trip could not be created. Please try again.");
    expect(mocks.tripUpdateMany).not.toHaveBeenCalled();
  });

  it("starts dispatch after a successful driver pre-check and returns SEARCHING", async () => {
    const response = await request(app).post("/api/v1/admin/trips/call-in").send(callInPayload);

    expect(response.status).toBe(201);
    expect(response.body.dispatch.status).toBe("SEARCHING");
    expect(mocks.dispatchTrip).toHaveBeenCalledTimes(1);
    expect(mocks.dispatchTrip).toHaveBeenCalledWith(createdTrip.id);
    expect(mocks.tripUpdateMany).toHaveBeenCalledWith({
      where: { id: createdTrip.id, status: "REQUESTED", driverId: null },
      data: { dispatchStatus: "SEARCHING" },
    });
  });

  describe("Admin effective driver presence", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mocks.resolveBranchFilter.mockReturnValue(undefined);
      mocks.getDriverLocation.mockResolvedValue(null);
      mocks.driverCount.mockResolvedValue(0);
      mocks.customerCount.mockResolvedValue(0);
      mocks.tripCount.mockResolvedValue(0);
      mocks.feedbackCount.mockResolvedValue(0);
    });

    it("reports only fresh intent-online drivers as online", async () => {
      mocks.driverFindMany.mockResolvedValue([
        {
          id: "driver-fresh",
          userId: "user-fresh",
          branchId: null,
          isOnline: true,
          isApproved: true,
          vehicleType: "MOTO",
          licensePlate: "GT-1",
          user: { id: "user-fresh", name: "Fresh", phone: "0201", createdAt: new Date() },
        },
        {
          id: "driver-stale",
          userId: "user-stale",
          branchId: null,
          isOnline: true,
          isApproved: true,
          vehicleType: "MOTO",
          licensePlate: null,
          user: { id: "user-stale", name: "Stale", phone: "0202", createdAt: new Date() },
        },
        {
          id: "driver-offline",
          userId: "user-offline",
          branchId: null,
          isOnline: false,
          isApproved: true,
          vehicleType: "MOTO",
          licensePlate: null,
          user: { id: "user-offline", name: "Offline", phone: "0203", createdAt: new Date() },
        },
      ]);
      mocks.getDriverLocation.mockImplementation(async (driverId: string) =>
        driverId === "driver-fresh" ? { lat: 5, lng: -1, timestamp: Date.now() } : null
      );

      const response = await request(app).get("/api/v1/admin/drivers");

      expect(response.status).toBe(200);
      expect(response.body.drivers.map((driver: any) => driver.isOnline)).toEqual([true, false, false]);
      expect(mocks.driverFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} })
      );
    });

    it("counts only fresh intent-online drivers and preserves branch filtering", async () => {
      mocks.resolveBranchFilter.mockReturnValue("branch-1");
      mocks.driverFindMany.mockResolvedValue([
        { id: "driver-fresh", nightMode: true },
        { id: "driver-stale", nightMode: true },
        { id: "driver-day", nightMode: false },
      ]);
      mocks.getDriverLocation.mockImplementation(async (driverId: string) =>
        driverId === "driver-stale" ? null : { lat: 5, lng: -1, timestamp: Date.now() }
      );

      const response = await request(app).get("/api/v1/admin/stats");

      expect(response.status).toBe(200);
      expect(response.body.drivers.online).toBe(2);
      expect(response.body.drivers.nightModeActive).toBe(1);
      expect(mocks.driverFindMany).toHaveBeenCalledWith({
        where: { branchId: "branch-1", isOnline: true },
        select: { id: true, nightMode: true },
      });
      expect(mocks.driverCount).toHaveBeenCalledWith({ where: { branchId: "branch-1" } });
    });
  });

  it("returns the created trip as FAILED when SEARCHING persistence fails", async () => {
    mocks.tripUpdateMany.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await request(app).post("/api/v1/admin/trips/call-in").send(callInPayload);

    expect(response.status).toBe(201);
    expect(response.body.trip.id).toBe(createdTrip.id);
    expect(response.body.dispatch.status).toBe("FAILED");
    expect(response.body.dispatch.message).toBe(
      "Trip created successfully, but automatic driver dispatch failed."
    );
    expect(mocks.findDriverWithExpansion).not.toHaveBeenCalled();
    expect(mocks.dispatchTrip).not.toHaveBeenCalled();
    expect(mocks.tripUpdateMany).toHaveBeenNthCalledWith(1, {
      where: { id: createdTrip.id, status: "REQUESTED", driverId: null },
      data: { dispatchStatus: "SEARCHING" },
    });
    expect(mocks.tripUpdateMany).toHaveBeenNthCalledWith(2, {
      where: { id: createdTrip.id, status: "REQUESTED", driverId: null },
      data: { dispatchStatus: "FAILED" },
    });
  });

  it("does not start discovery when the SEARCHING claim loses the lifecycle race", async () => {
    mocks.tripUpdateMany.mockResolvedValueOnce({ count: 0 });

    const response = await request(app).post("/api/v1/admin/trips/call-in").send(callInPayload);

    expect(response.status).toBe(201);
    expect(response.body.dispatch.status).toBe("FAILED");
    expect(mocks.findDriverWithExpansion).not.toHaveBeenCalled();
    expect(mocks.dispatchTrip).not.toHaveBeenCalled();
    expect(mocks.tripUpdateMany).toHaveBeenNthCalledWith(1, {
      where: { id: createdTrip.id, status: "REQUESTED", driverId: null },
      data: { dispatchStatus: "SEARCHING" },
    });
  });

  it("does not start dispatch when the pre-check finds no driver", async () => {
    mocks.findDriverWithExpansion.mockResolvedValue({
      success: false,
      message: "No driver found",
    });

    const response = await request(app).post("/api/v1/admin/trips/call-in").send(callInPayload);

    expect(response.status).toBe(201);
    expect(response.body.dispatch.status).toBe("NO_DRIVER_FOUND");
    expect(mocks.dispatchTrip).not.toHaveBeenCalled();
    expect(mocks.tripUpdateMany).toHaveBeenCalledWith({
      where: { id: createdTrip.id, status: "REQUESTED", driverId: null },
      data: { dispatchStatus: "NO_DRIVER_FOUND" },
    });
  });

  it("returns 201 without waiting for the background dispatch promise", async () => {
    let resolveDispatch!: (value: { status: "NO_DRIVERS"; message: string }) => void;
    mocks.dispatchTrip.mockReturnValue(
      new Promise((resolve) => {
        resolveDispatch = resolve;
      })
    );

    const response = await request(app).post("/api/v1/admin/trips/call-in").send(callInPayload);

    expect(response.status).toBe(201);
    expect(response.body.dispatch.status).toBe("SEARCHING");
    expect(mocks.dispatchTrip).toHaveBeenCalledWith(createdTrip.id);

    resolveDispatch({ status: "NO_DRIVERS", message: "exhausted" });
  });

  it("rejects a country-only pickup geocode before creating or dispatching", async () => {
    mocks.geocode.mockResolvedValue({
      location: { lat: 7.946527, lng: -1.023194 },
      address: "Ghana",
    });

    const response = await request(app)
      .post("/api/v1/admin/trips/call-in")
      .send({
        ...callInPayload,
        pickup: { address: "8224+PQP, Tarkwa, Ghana" },
        destination: { lat: 5.1, lng: -1.1, address: "Destination" },
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(
      "Could not locate the pickup location. Please enter a more specific landmark or address."
    );
    expect(mocks.createTrip).not.toHaveBeenCalled();
    expect(mocks.findDriverWithExpansion).not.toHaveBeenCalled();
    expect(mocks.dispatchTrip).not.toHaveBeenCalled();
  });

  it("rejects a country-only destination geocode before creating or dispatching", async () => {
    mocks.geocode
      .mockResolvedValueOnce({
        location: { lat: 5.298625, lng: -2.001296 },
        address: "Tarkwa, Ghana",
      })
      .mockResolvedValueOnce({
        location: { lat: 7.946527, lng: -1.023194 },
        address: " Ghana. ",
      });

    const response = await request(app)
      .post("/api/v1/admin/trips/call-in")
      .send({
        ...callInPayload,
        pickup: { address: "Pickup landmark" },
        destination: { address: "Destination landmark" },
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(
      "Could not locate the destination. Please enter a more specific landmark or address."
    );
    expect(mocks.createTrip).not.toHaveBeenCalled();
    expect(mocks.findDriverWithExpansion).not.toHaveBeenCalled();
    expect(mocks.dispatchTrip).not.toHaveBeenCalled();
  });

  it("preserves normal call-in creation for a specific Tarkwa geocode", async () => {
    mocks.geocode.mockResolvedValue({
      address: "72X2+P2Q, Tarkwa - Esiama Rd, Tarkwa, Ghana",
      location: { lat: 5.298625, lng: -2.001296 },
    });

    const response = await request(app)
      .post("/api/v1/admin/trips/call-in")
      .send({
        ...callInPayload,
        pickup: { address: "8224+PQP, Tarkwa, Ghana" },
        destination: { lat: 5.1, lng: -1.1, address: "Destination" },
      });

    expect(response.status).toBe(201);
    expect(mocks.createTrip).toHaveBeenCalledTimes(1);
    expect(mocks.findDriverWithExpansion).toHaveBeenCalledWith(5.298625, -2.001296, "MOTO");
    expect(mocks.dispatchTrip).toHaveBeenCalledWith(createdTrip.id);
  });

  it("persists FAILED when the driver pre-check throws", async () => {
    mocks.findDriverWithExpansion.mockRejectedValue(new Error("dispatch unavailable"));

    const response = await request(app).post("/api/v1/admin/trips/call-in").send(callInPayload);

    expect(response.status).toBe(201);
    expect(response.body.dispatch.status).toBe("FAILED");
    expect(mocks.dispatchTrip).not.toHaveBeenCalled();
    expect(mocks.tripUpdateMany).toHaveBeenCalledWith({
      where: { id: createdTrip.id, status: "REQUESTED", driverId: null },
      data: { dispatchStatus: "FAILED" },
    });
  });

  it("returns persisted dispatchStatus from the call-in status endpoint", async () => {
    mocks.tripFindUnique.mockResolvedValue({
      ...createdTrip,
      dispatchStatus: "SEARCHING",
      driver: null,
    });

    const response = await request(app).get("/api/v1/admin/trips/call-in/trip-call-1/status");

    expect(response.status).toBe(200);
    expect(response.body.dispatchStatus).toBe("SEARCHING");
  });
});
