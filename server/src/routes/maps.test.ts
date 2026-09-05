import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  autocompletePlaces: vi.fn(),
  getPlaceDetails: vi.fn(),
  reverseGeocode: vi.fn(),
}));

vi.mock("../middleware", () => ({
  requireAuth: (_req: any, _res: any, next: () => void) => next(),
}));
vi.mock("../middleware/rateLimit", () => ({ generalRateLimit: (_req: any, _res: any, next: () => void) => next() }));
vi.mock("../services/maps", () => ({ mapsService: mocks }));

import { mapsRouter } from "./maps";

const app = express();
app.use("/api/v1/maps", mapsRouter);
app.use((error: any, _req: any, res: any, _next: any) => {
  res.status(error.name === "ZodError" ? 400 : 500).json({ error: error.message });
});

describe("maps place routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects queries shorter than two characters", async () => {
    const response = await request(app).get("/api/v1/maps/places/autocomplete?q=a");
    expect(response.status).toBe(400);
    expect(mocks.autocompletePlaces).not.toHaveBeenCalled();
  });

  it("delegates autocomplete with optional pickup bias", async () => {
    mocks.autocompletePlaces.mockResolvedValue([{ placeId: "p1", text: "Tarkwa" }]);
    const response = await request(app).get("/api/v1/maps/places/autocomplete?q=Tarkwa&lat=5.2&lng=-2");
    expect(response.status).toBe(200);
    expect(mocks.autocompletePlaces).toHaveBeenCalledWith("Tarkwa", { lat: 5.2, lng: -2 });
  });

  it("rejects an incomplete coordinate pair", async () => {
    const response = await request(app).get("/api/v1/maps/places/autocomplete?q=Tarkwa&lat=5.2");
    expect(response.status).toBe(400);
  });

  it("maps place details into the customer response", async () => {
    mocks.getPlaceDetails.mockResolvedValue({
      placeId: "p1",
      address: "University of Mines and Technology, Tarkwa, Ghana",
      location: { lat: 5.3, lng: -2 },
    });
    const response = await request(app).get("/api/v1/maps/places/p1");
    expect(response.status).toBe(200);
    expect(response.body.data.place).toEqual({
      placeId: "p1",
      address: "University of Mines and Technology, Tarkwa, Ghana",
      lat: 5.3,
      lng: -2,
    });
  });
});
