/**
 * AllGO MVP Trip Lifecycle Service
 * 
 * Simplified: REQUESTED → ACCEPTED → ACTIVE → COMPLETED/CANCELLED
 */

import { prisma } from "../config/database";
import { unregisterActiveTrip } from "./tracking";

// Valid status transitions for trips
const TRIP_TRANSITIONS: Record<string, string[]> = {
  REQUESTED: ["ACCEPTED", "CANCELLED"],
  ACCEPTED: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["COMPLETED"],
  COMPLETED: [], // Terminal state
  CANCELLED: [], // Terminal state
};

export class TripLifecycleError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "TripLifecycleError";
  }
}

/**
 * Check if a trip status transition is valid
 */
export function isValidTripTransition(currentStatus: string, newStatus: string): boolean {
  const validTransitions = TRIP_TRANSITIONS[currentStatus];
  return validTransitions ? validTransitions.includes(newStatus) : false;
}

/**
 * Update trip status with validation
 */
export async function updateTripStatus(
  tripId: string,
  newStatus: string,
  userId: string,
  additionalData?: Record<string, any>
) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      customer: true,
      driver: true,
    },
  });

  if (!trip) {
    throw new TripLifecycleError("Trip not found", "TRIP_NOT_FOUND");
  }

  // Verify user is authorized (driver or customer for cancellation)
  // Note: Call-in trips (source: CALL) have no customer, so customer check returns false
  const isDriver = trip.driverId && trip.driver?.userId === userId;
  const isCustomer = trip.customer?.userId === userId;
  
  if (!isDriver && !isCustomer) {
    throw new TripLifecycleError("Not authorized to update this trip", "UNAUTHORIZED");
  }

  // Cancellation can be done by either party (before ACTIVE)
  if (newStatus === "CANCELLED") {
    if (!["REQUESTED", "ACCEPTED"].includes(trip.status)) {
      throw new TripLifecycleError("Cannot cancel trip after it has started", "INVALID_TRANSITION");
    }
  } else if (!isDriver) {
    // Only driver can update to other statuses
    throw new TripLifecycleError("Only driver can update trip status", "UNAUTHORIZED");
  }

  // Validate transition
  if (!isValidTripTransition(trip.status, newStatus)) {
    throw new TripLifecycleError(
      `Cannot transition from ${trip.status} to ${newStatus}`,
      "INVALID_TRANSITION"
    );
  }

  // Prepare update data
  const updateData: any = {
    status: newStatus,
    ...additionalData,
  };

  // Add timestamps based on status
  switch (newStatus) {
    case "ACCEPTED":
      updateData.acceptedAt = new Date();
      break;
    case "ACTIVE":
      updateData.startedAt = new Date();
      break;
    case "COMPLETED":
      updateData.completedAt = new Date();
      // Unregister from location tracking
      if (trip.driverId) {
        await unregisterActiveTrip(trip.driverId);
      }
      break;
    case "CANCELLED":
      updateData.cancelledBy = userId;
      // Unregister from location tracking
      if (trip.driverId) {
        await unregisterActiveTrip(trip.driverId);
      }
      break;
  }

  // Update and return
  return prisma.trip.update({
    where: { id: tripId },
    data: updateData,
    include: {
      customer: {
        include: {
          user: {
            select: { id: true, phone: true, name: true },
          },
        },
      },
      driver: {
        include: {
          user: {
            select: { id: true, phone: true, name: true },
          },
        },
      },
    },
  });
}

/**
 * Get trip timeline (all status changes)
 */
export function getTripTimeline(trip: any) {
  const timeline = [];

  if (trip.createdAt) {
    timeline.push({ status: "REQUESTED", timestamp: trip.createdAt, label: "Ride requested" });
  }
  if (trip.acceptedAt) {
    timeline.push({ status: "ACCEPTED", timestamp: trip.acceptedAt, label: "Driver accepted" });
  }
  if (trip.startedAt) {
    timeline.push({ status: "ACTIVE", timestamp: trip.startedAt, label: "Trip started" });
  }
  if (trip.completedAt) {
    timeline.push({ status: "COMPLETED", timestamp: trip.completedAt, label: "Trip completed" });
  }
  if (trip.status === "CANCELLED") {
    timeline.push({ status: "CANCELLED", timestamp: trip.updatedAt, label: "Trip cancelled" });
  }

  return timeline;
}

/**
 * Calculate trip duration in minutes
 */
export function calculateTripDuration(trip: any): number | null {
  if (!trip.startedAt || !trip.completedAt) return null;
  
  const start = new Date(trip.startedAt).getTime();
  const end = new Date(trip.completedAt).getTime();
  
  return Math.ceil((end - start) / 60000);
}
