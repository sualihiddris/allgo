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
      const userId = req.user!.id;

      // Missing, unauthorized and non-customer requests intentionally
      // share the same response to avoid exposing trip existence.
      if (req.user!.role !== "CUSTOMER") {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Trip not found",
          },
        });
      }

      const trip = await prisma.trip.findFirst({
        where: {
          id: input.tripId,
          customer: {
            userId,
          },
        },
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
      if (req.user!.role !== "CUSTOMER") {
        return res.status(404).json({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Feedback not found for this trip",
          },
        });
      }

      const feedback = await prisma.feedback.findFirst({
        where: {
          tripId: req.params.tripId,
          trip: {
            customer: {
              userId: req.user!.id,
            },
          },
        },
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
