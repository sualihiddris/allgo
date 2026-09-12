import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  customerFindUnique: vi.fn(),
  tripUpdateMany: vi.fn(),
  tripFindUnique: vi.fn(),
  tripFindUniqueOrThrow: vi.fn(),
}));

vi.mock("../config/database", () => ({
  prisma: {
    customer: {
      findUnique: mocks.customerFindUnique,
    },
    trip: {
      updateMany: mocks.tripUpdateMany,
      findUnique: mocks.tripFindUnique,
      findUniqueOrThrow: mocks.tripFindUniqueOrThrow,
    },
  },
}));

vi.mock("./maps", () => ({
  mapsService: {
    getRoute: vi.fn(),
  },
}));

import { cancelTrip } from "./trip";

describe("cancelTrip", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.customerFindUnique.mockResolvedValue({
      id: "customer-1",
    });

    mocks.tripUpdateMany.mockResolvedValue({
      count: 1,
    });

    mocks.tripFindUniqueOrThrow.mockResolvedValue({
      id: "trip-1",
      customerId: "customer-1",
      driverId: null,
      status: "CANCELLED",
      dispatchStatus: null,
      dispatchClaimToken: null,
      dispatchClaimedAt: null,
      cancelledBy: "customer-user-1",
      cancelReason: "Changed plans",
    });
  });

  it(
    "atomically cancels only a cancellable trip owned by the authenticated customer",
    async () => {
      const result = await cancelTrip(
        "trip-1",
        "customer-user-1",
        "Changed plans"
      );

      expect(
        mocks.customerFindUnique
      ).toHaveBeenCalledWith({
        where: {
          userId: "customer-user-1",
        },
        select: {
          id: true,
        },
      });

      expect(
        mocks.tripUpdateMany
      ).toHaveBeenCalledWith({
        where: {
          id: "trip-1",
          customerId: "customer-1",
          status: {
            in: [
              "REQUESTED",
              "ACCEPTED",
            ],
          },
        },
        data: {
          status: "CANCELLED",
          cancelledBy:
            "customer-user-1",
          cancelReason:
            "Changed plans",
          dispatchStatus: null,
          dispatchClaimToken: null,
          dispatchClaimedAt: null,
        },
      });

      expect(result).toMatchObject({
        id: "trip-1",
        status: "CANCELLED",
      });
    }
  );

  it(
    "rejects an authenticated customer who does not own the trip",
    async () => {
      mocks.tripUpdateMany.mockResolvedValue({
        count: 0,
      });

      mocks.tripFindUnique.mockResolvedValue({
        customerId: "customer-OTHER",
        status: "REQUESTED",
      });

      await expect(
        cancelTrip(
          "trip-1",
          "customer-user-1"
        )
      ).rejects.toMatchObject({
        statusCode: 403,
        code: "FORBIDDEN",
      });

      expect(
        mocks.tripFindUniqueOrThrow
      ).not.toHaveBeenCalled();
    }
  );

  it(
    "returns a conflict when the trip is no longer cancellable",
    async () => {
      mocks.tripUpdateMany.mockResolvedValue({
        count: 0,
      });

      mocks.tripFindUnique.mockResolvedValue({
        customerId: "customer-1",
        status: "ACTIVE",
      });

      await expect(
        cancelTrip(
          "trip-1",
          "customer-user-1"
        )
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "INVALID_TRIP_STATE",
      });

      expect(
        mocks.tripFindUniqueOrThrow
      ).not.toHaveBeenCalled();
    }
  );

  it(
    "returns not found when the trip does not exist",
    async () => {
      mocks.tripUpdateMany.mockResolvedValue({
        count: 0,
      });

      mocks.tripFindUnique.mockResolvedValue(
        null
      );

      await expect(
        cancelTrip(
          "missing-trip",
          "customer-user-1"
        )
      ).rejects.toMatchObject({
        statusCode: 404,
        code: "TRIP_NOT_FOUND",
      });
    }
  );

  it(
    "rejects cancellation when the authenticated user has no customer profile",
    async () => {
      mocks.customerFindUnique.mockResolvedValue(
        null
      );

      await expect(
        cancelTrip(
          "trip-1",
          "non-customer-user"
        )
      ).rejects.toMatchObject({
        statusCode: 403,
        code: "FORBIDDEN",
      });

      expect(
        mocks.tripUpdateMany
      ).not.toHaveBeenCalled();
    }
  );
});