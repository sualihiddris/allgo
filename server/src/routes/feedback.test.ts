import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import request from "supertest";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  tripFindFirst: vi.fn(),
  feedbackFindUnique: vi.fn(),
  feedbackFindFirst: vi.fn(),
  feedbackCreate: vi.fn(),
  authUser: {
    id: "customer-user-1",
    phone: "0241000001",
    role: "CUSTOMER",
  },
}));

vi.mock("../middleware/auth", () => ({
  requireAuth: (
    req: Request,
    _res: Response,
    next: NextFunction
  ) => {
    req.user = { ...mocks.authUser };
    next();
  },
}));

vi.mock("../config/database", () => ({
  prisma: {
    trip: {
      findFirst: mocks.tripFindFirst,
    },
    feedback: {
      findUnique: mocks.feedbackFindUnique,
      findFirst: mocks.feedbackFindFirst,
      create: mocks.feedbackCreate,
    },
  },
}));

import { feedbackRouter } from "./feedback";

const app = express();
app.use(express.json());
app.use("/api/v1/feedback", feedbackRouter);

const completedTrip = {
  id: "trip-1",
  status: "COMPLETED",
  customerId: "customer-1",
};

const createdFeedback = {
  id: "feedback-1",
  tripId: "trip-1",
  rating: 5,
  fareRating: "fair",
  issue: null,
};

beforeEach(() => {
  vi.clearAllMocks();

  mocks.authUser.id = "customer-user-1";
  mocks.authUser.phone = "0241000001";
  mocks.authUser.role = "CUSTOMER";
});

describe("POST /api/v1/feedback", () => {
  const payload = {
    tripId: "trip-1",
    rating: 5,
    fareRating: "fair",
  };

  it("allows the owning customer to submit feedback for a completed trip", async () => {
    mocks.tripFindFirst.mockResolvedValue(completedTrip);
    mocks.feedbackFindUnique.mockResolvedValue(null);
    mocks.feedbackCreate.mockResolvedValue(createdFeedback);

    const response = await request(app)
      .post("/api/v1/feedback")
      .send(payload);

    expect(response.status).toBe(201);

    expect(mocks.tripFindFirst).toHaveBeenCalledWith({
      where: {
        id: "trip-1",
        customer: {
          userId: "customer-user-1",
        },
      },
    });

    expect(mocks.feedbackCreate).toHaveBeenCalledTimes(1);
  });

  it("returns 404 for another customer's trip", async () => {
    mocks.authUser.id = "customer-user-2";
    mocks.authUser.phone = "0241000002";
    mocks.tripFindFirst.mockResolvedValue(null);

    const response = await request(app)
      .post("/api/v1/feedback")
      .send(payload);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Trip not found",
      },
    });

    expect(mocks.feedbackCreate).not.toHaveBeenCalled();
  });

  it("returns the same 404 for a missing trip", async () => {
    mocks.tripFindFirst.mockResolvedValue(null);

    const response = await request(app)
      .post("/api/v1/feedback")
      .send({
        ...payload,
        tripId: "missing-trip",
      });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Trip not found",
      },
    });
  });

  it("rejects a non-customer before the trip lookup", async () => {
    mocks.authUser.id = "driver-user-1";
    mocks.authUser.phone = "0242000001";
    mocks.authUser.role = "DRIVER";

    const response = await request(app)
      .post("/api/v1/feedback")
      .send(payload);

    expect(response.status).toBe(404);
    expect(mocks.tripFindFirst).not.toHaveBeenCalled();
    expect(mocks.feedbackCreate).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/feedback/trip/:tripId", () => {
  it("allows the owning customer to read feedback", async () => {
    mocks.feedbackFindFirst.mockResolvedValue(createdFeedback);

    const response = await request(app).get(
      "/api/v1/feedback/trip/trip-1"
    );

    expect(response.status).toBe(200);
    expect(response.body.data.feedback).toEqual(
      createdFeedback
    );

    expect(mocks.feedbackFindFirst).toHaveBeenCalledWith({
      where: {
        tripId: "trip-1",
        trip: {
          customer: {
            userId: "customer-user-1",
          },
        },
      },
    });
  });

  it("returns 404 to another customer", async () => {
    mocks.authUser.id = "customer-user-2";
    mocks.authUser.phone = "0241000002";
    mocks.feedbackFindFirst.mockResolvedValue(null);

    const response = await request(app).get(
      "/api/v1/feedback/trip/trip-1"
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Feedback not found for this trip",
      },
    });
  });

  it("returns the same 404 when feedback does not exist", async () => {
    mocks.feedbackFindFirst.mockResolvedValue(null);

    const response = await request(app).get(
      "/api/v1/feedback/trip/missing-trip"
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Feedback not found for this trip",
      },
    });
  });

  it("rejects a non-customer before the feedback lookup", async () => {
    mocks.authUser.id = "driver-user-1";
    mocks.authUser.phone = "0242000001";
    mocks.authUser.role = "DRIVER";

    const response = await request(app).get(
      "/api/v1/feedback/trip/trip-1"
    );

    expect(response.status).toBe(404);
    expect(mocks.feedbackFindFirst).not.toHaveBeenCalled();
  });
});
