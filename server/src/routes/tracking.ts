/**
 * AllGO Tracking Routes
 *
 * Endpoints for trip lifecycle management:
 * - GET  /tracking/trip/:id       — get trip details
 * - PUT  /tracking/trip/:id/status — driver updates trip status
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware";
import { prisma } from "../config";
import { sendSuccess } from "../utils";
import { getIO } from "../services/socket";
import { unregisterActiveTripIfCurrent } from "../services/tracking";

const router = Router();

const statusUpdateSchema = z.object({
  status: z.enum(["STARTED", "COMPLETED", "CANCELLED"]),
  location: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .optional(),
  cancelReason: z.string().optional(),
});

/**
 * GET /api/v1/tracking/trip/:id
 * Get trip details
 */
router.get(
  "/trip/:id",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const trip = await prisma.trip.findUnique({
        where: { id: req.params.id },
        include: {
          customer: {
            select: {
              userId: true,
              user: { select: { name: true, phone: true } },
            },
          },
          driver: {
            select: {
              userId: true,
              user: { select: { name: true, phone: true } },
              vehicleType: true,
              licensePlate: true,
              lastLocation: true,
            },
          },
        },
      });

      if (!trip) {
        return res.status(404).json({ error: { message: "Trip not found" } });
      }

      // Trip ids are identifiers, not authorization.
      // Only the owning customer or currently assigned driver may read
      // tracking details. Use the same 404 for absent and unauthorized
      // trips so this endpoint cannot be used as an existence oracle.
      const userId = req.user!.id;
      const isCustomerOwner =
        trip.customer?.userId === userId;
      const isAssignedDriver =
        trip.driver?.userId === userId;

      if (!isCustomerOwner && !isAssignedDriver) {
        return res.status(404).json({
          error: { message: "Trip not found" },
        });
      }

      sendSuccess(res, {
        trip: {
          id: trip.id,
          serviceType: trip.serviceType,
          deliveryType: trip.deliveryType,
          itemDescription: trip.itemDescription,
          vehicleType: trip.vehicleType,
          status: trip.status,
          source: trip.source,
          pickup: {
            lat: trip.pickupLat,
            lng: trip.pickupLng,
            address: trip.pickupAddress,
          },
          destination: {
            lat: trip.destLat,
            lng: trip.destLng,
            address: trip.destAddress,
          },
          customerNote: trip.customerNote,
          distanceMeters: trip.distanceMeters,
          customer: trip.customer
            ? {
                name: trip.customer.user.name,
                phone: trip.customer.user.phone,
              }
            : trip.callerName
            ? { name: trip.callerName, phone: trip.callerPhone }
            : null,
          driver: trip.driver
            ? {
                name: trip.driver.user.name,
                phone: trip.driver.user.phone,
                vehicleType: trip.driver.vehicleType,
                licensePlate: trip.driver.licensePlate,
                location: trip.driver.lastLocation,
              }
            : null,
          createdAt: trip.createdAt,
          acceptedAt: trip.acceptedAt,
          startedAt: trip.startedAt,
          completedAt: trip.completedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/v1/tracking/trip/:id/status
 * Driver updates trip status (STARTED → COMPLETED)
 */
router.put(
  "/trip/:id/status",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user!.role !== "DRIVER") {
        return res.status(403).json({
          error: {
            message: "Not authorized to update this trip",
          },
        });
      }

      const { status, location, cancelReason } = statusUpdateSchema.parse(
        req.body
      );
      const tripId = req.params.id;

      // Find trip and verify ownership
      const trip = await prisma.trip.findUnique({
        where: { id: tripId },
        include: { driver: true, customer: true },
      });

      if (!trip) {
        return res.status(404).json({ error: { message: "Trip not found" } });
      }

      if (trip.driver?.userId !== req.user!.id) {
        return res
          .status(403)
          .json({ error: { message: "Not authorized to update this trip" } });
      }

      // Convert the API command into the canonical status and the exact
      // state from which that transition is permitted.
      const canonicalStatus =
        status === "STARTED" ? "ACTIVE" : status;

      const expectedCurrentStatus =
        status === "STARTED"
          ? "ACCEPTED"
          : status === "COMPLETED"
          ? "ACTIVE"
          : "ACCEPTED";

      const updateData: any = {
        status: canonicalStatus,
      };

      switch (status) {
        case "STARTED":
          updateData.startedAt = new Date();
          break;

        case "COMPLETED":
          updateData.completedAt = new Date();
          break;

        case "CANCELLED":
          updateData.cancelledBy = req.user!.id;
          updateData.cancelReason =
            cancelReason || "Driver cancelled";
          break;
      }

      // The status predicate is the concurrency fence. If customer
      // cancellation changed ACCEPTED -> CANCELLED first, STARTED cannot
      // overwrite it. Likewise duplicate completion cannot increment twice.
      const transition = await prisma.trip.updateMany({
        where: {
          id: tripId,
          driverId: trip.driverId!,
          status: expectedCurrentStatus,
        },
        data: updateData,
      });

      if (transition.count === 0) {
        return res.status(409).json({
          error: {
            message:
              "Trip state changed before this update could be applied",
          },
        });
      }

      // Perform secondary effects only after this request actually won the
      // authoritative state transition.
      if (location && trip.driverId) {
        await prisma.driver.update({
          where: { id: trip.driverId },
          data: {
            lastLocation: JSON.stringify({
              lat: location.lat,
              lng: location.lng,
              timestamp: Date.now(),
            }),
          },
        });
      }

      if (status === "COMPLETED") {
        await prisma.driver.update({
          where: { id: trip.driverId! },
          data: {
            totalTrips: { increment: 1 },
          },
        });

        if (trip.driverId) {
          // Trip-specific compare-and-delete: a delayed cleanup for this
          // trip must never remove a newer active_trip mapping.
          await unregisterActiveTripIfCurrent(trip.driverId, tripId);
        }
      }

      if (status === "CANCELLED" && trip.driverId) {
        await unregisterActiveTripIfCurrent(trip.driverId, tripId);
      }

      const updatedTrip =
        await prisma.trip.findUniqueOrThrow({
          where: { id: tripId },
        });
      console.log(
        `[Tracking] Trip ${tripId} status → ${updatedTrip.status}`
      );

      // Notify the customer in real time - the customer's socket is on a
      // separate connection (the one that dispatched the trip), so a plain
      // REST update here would otherwise leave them stuck on "Searching..."
      if (trip.customer) {
        getIO()
          .to(`customer:${trip.customer.userId}`)
          .emit("trip:status", {
            tripId: updatedTrip.id,
            status: updatedTrip.status,
          });
      }

      sendSuccess(res, {
        trip: {
          id: updatedTrip.id,
          status: updatedTrip.status,
          startedAt: updatedTrip.startedAt,
          completedAt: updatedTrip.completedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export const trackingRouter = router;
