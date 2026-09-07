/**
 * AllGO MVP Booking Routes
 * 
 * Vehicle types: MOTO, KEKE, MOTOR_KING
 * MOTO has sub-types: PASSENGER or DELIVERY
 * If DELIVERY: Food/Groceries/Parcels/Other
 * 
 * NO FARE SYSTEM - payment happens between customer and driver
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { generalRateLimit } from "../middleware/rateLimit";
import { createTrip, getTripById, cancelTrip } from "../services/trip";
import { sendSuccess, sendCreated } from "../utils/response";
import { prisma } from "../config/database";

const router = Router();

// Validation schemas
const createTripSchema = z.object({
  vehicleType: z.enum(["MOTO", "KEKE", "MOTOR_KING"]),
  // Service type: PASSENGER or DELIVERY (only relevant for MOTO)
  serviceType: z.enum(["PASSENGER", "DELIVERY"]).default("PASSENGER"),
  // Delivery details (only for MOTO + DELIVERY)
  deliveryType: z.enum(["FOOD", "GROCERIES", "PARCELS", "OTHER"]).optional(),
  itemDescription: z.string().max(200).optional(), // For OTHER delivery type
  pickup: z.object({
    lat: z.number(),
    lng: z.number(),
    address: z.string(),
  }),
  destination: z.object({
    lat: z.number(),
    lng: z.number(),
    address: z.string(),
  }),
  customerNote: z.string().max(200).optional(),
});

const cancelSchema = z.object({
  reason: z.string().max(500).optional(),
});

/**
 * POST /bookings/trip
 * Create a new ride/delivery booking
 */
router.post(
  "/trip",
  requireAuth,
  generalRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = createTripSchema.parse(req.body);

      // Trip.customerId references Customer.id, not the User's id
      const customer = await prisma.customer.findUnique({
        where: { userId: req.user!.id },
      });
      if (!customer) {
        return res.status(403).json({
          success: false,
          error: { code: "FORBIDDEN", message: "Only customer accounts can book trips" },
        });
      }
      const customerId = customer.id;

      // Validate MOTO delivery has deliveryType
      if (input.vehicleType === "MOTO" && input.serviceType === "DELIVERY") {
        if (!input.deliveryType) {
          return res.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Delivery type required for MOTO deliveries",
            },
          });
        }
        // Validate OTHER has itemDescription
        if (input.deliveryType === "OTHER" && !input.itemDescription) {
          return res.status(400).json({
            success: false,
            error: {
              code: "VALIDATION_ERROR", 
              message: "Item description required for OTHER delivery type",
            },
          });
        }
      }

      const result = await createTrip({
        customerId,
        ...input,
      });

      return sendCreated(res, {
        trip: result.trip,
        message: "Driver search in progress",
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /bookings/trip/:id
 * Get trip details
 */
router.get(
  "/trip/:id",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const trip = await getTripById(req.params.id);

      if (!trip) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Trip not found",
          },
        });
      }

      return sendSuccess(res, { trip });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /bookings/trip/:id/cancel
 * Cancel a trip
 */
router.post(
  "/trip/:id/cancel",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reason } = cancelSchema.parse(req.body);
      const userId = req.user!.id;

      const trip = await cancelTrip(req.params.id, userId, reason);

      return sendSuccess(res, { trip });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /bookings/trips
 * Get current customer's trip history
 */
router.get(
  "/trips",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Trip.customerId references Customer.id, not the User's id
      const customer = await prisma.customer.findUnique({
        where: { userId: req.user!.id },
      });
      if (!customer) {
        return sendSuccess(res, { trips: [] });
      }

      const trips = await prisma.trip.findMany({
        where: { customerId: customer.id },
        orderBy: { createdAt: "desc" },
        include: {
          driver: {
            include: {
              user: {
                select: { id: true, phone: true, name: true },
              },
            },
          },
          feedback: true,
        },
        take: 20,
      });

      return sendSuccess(res, { trips });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /bookings/trips/active
 * Recover the newest active trip for the authenticated customer.
 */
router.get(
  "/trips/active",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customer = await prisma.customer.findUnique({
        where: { userId: req.user!.id },
      });

      if (!customer) {
        return sendSuccess(res, { trip: null });
      }

      const trip = await prisma.trip.findFirst({
        where: {
          customerId: customer.id,
          status: { in: ["REQUESTED", "ACCEPTED", "ACTIVE"] },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          dispatchStatus: true,
          serviceType: true,
          deliveryType: true,
          itemDescription: true,
          vehicleType: true,
          pickupLat: true,
          pickupLng: true,
          pickupAddress: true,
          destLat: true,
          destLng: true,
          destAddress: true,
          customerNote: true,
          driver: {
            select: {
              id: true,
              licensePlate: true,
              user: { select: { name: true, phone: true } },
            },
          },
        },
      });

      return sendSuccess(res, {
        trip: trip
          ? {
              id: trip.id,
              status: trip.status,
              dispatchStatus: trip.dispatchStatus,
              serviceType: trip.serviceType,
              deliveryType: trip.deliveryType,
              itemDescription: trip.itemDescription,
              vehicleType: trip.vehicleType,
              pickup: { lat: trip.pickupLat, lng: trip.pickupLng, address: trip.pickupAddress },
              destination: { lat: trip.destLat, lng: trip.destLng, address: trip.destAddress },
              customerNote: trip.customerNote,
              ...(trip.driver
                ? {
                    driver: {
                      id: trip.driver.id,
                      name: trip.driver.user.name,
                      phone: trip.driver.user.phone,
                      vehiclePlate: trip.driver.licensePlate,
                    },
                  }
                : {}),
            }
          : null,
      });
    } catch (error) {
      next(error);
    }
  }
);

export const bookingRouter = router;
