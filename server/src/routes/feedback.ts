/**
 * AllGO MVP Feedback Routes
 * 
 * Post-trip feedback from customer:
 * - Rating (1-5 stars)
 * - Fare Rating (fair / too_high / too_low)
 * - Optional issue text
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../config/database";
import { sendSuccess, sendCreated } from "../utils/response";

const router = Router();

// Validation schema
const createFeedbackSchema = z.object({
  tripId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  fareRating: z.enum(["fair", "too_high", "too_low"]),
  issue: z.string().max(500).optional(),
});

/**
 * POST /feedback
 * Submit post-trip feedback
 */
router.post(
  "/",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = createFeedbackSchema.parse(req.body);
      const customerId = req.user!.id;

      // Verify trip exists and belongs to this customer
      const trip = await prisma.trip.findUnique({
        where: { id: input.tripId },
        include: { customer: true },
      });

      if (!trip) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Trip not found",
          },
        });
      }

      // Verify customer owns this trip (call-in trips have no customer)
      if (!trip.customer || trip.customer.userId !== customerId) {
        return res.status(403).json({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "You can only submit feedback for your own trips",
          },
        });
      }

      // Verify trip is completed
      if (trip.status !== "COMPLETED") {
        return res.status(400).json({
          success: false,
          error: {
            code: "INVALID_STATUS",
            message: "Feedback can only be submitted for completed trips",
          },
        });
      }

      // Check for existing feedback
      const existingFeedback = await prisma.feedback.findUnique({
        where: { tripId: input.tripId },
      });

      if (existingFeedback) {
        return res.status(400).json({
          success: false,
          error: {
            code: "ALREADY_EXISTS",
            message: "Feedback already submitted for this trip",
          },
        });
      }

      // Create feedback
      const feedback = await prisma.feedback.create({
        data: {
          tripId: input.tripId,
          rating: input.rating,
          fareRating: input.fareRating,
          issue: input.issue,
        },
      });

      return sendCreated(res, { feedback });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /feedback/trip/:tripId
 * Get feedback for a specific trip
 */
router.get(
  "/trip/:tripId",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const feedback = await prisma.feedback.findUnique({
        where: { tripId: req.params.tripId },
      });

      if (!feedback) {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Feedback not found for this trip",
          },
        });
      }

      return sendSuccess(res, { feedback });
    } catch (error) {
      next(error);
    }
  }
);

export const feedbackRouter = router;
