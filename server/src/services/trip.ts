/**
 * AllGO MVP Trip Service
 * 
 * Vehicle Types: MOTO, KEKE, MOTOR_KING
 * MOTO supports: PASSENGER or DELIVERY
 * NO FARE SYSTEM - payment happens directly between parties
 * 
 * Section 18: Call-In Booking Support
 * - Trips can be created without a customer account (callerPhone/callerName)
 * - Trip source tracks APP vs CALL bookings
 */

import { prisma } from "../config/database";
import { mapsService } from "./maps";
import { createError } from "../middleware/errorHandler";
import { VehicleType, ServiceType, DeliveryType, TripSource } from "@prisma/client";

interface CreateTripInput {
  customerId?: string;  // Optional for call-in trips
  vehicleType: VehicleType;
  serviceType: ServiceType;
  deliveryType?: DeliveryType;
  itemDescription?: string;
  pickup: { lat: number; lng: number; address: string };
  destination: { lat: number; lng: number; address: string };
  customerNote?: string;
  source?: TripSource;       // Section 18: APP or CALL
  callerPhone?: string;      // Section 18: Phone for call-in customers
  callerName?: string;       // Section 18: Name for call-in customers
}

export async function createTrip(input: CreateTripInput) {
  // Validate: either customerId OR callerPhone must be provided
  if (!input.customerId && !input.callerPhone) {
    throw new Error("Either customerId or callerPhone is required");
  }
  
  // Get route information for distance
  const route = await mapsService.getRoute(input.pickup, input.destination);

  // Create trip - no fare calculation
  const trip = await prisma.trip.create({
    data: {
      customerId: input.customerId,
      vehicleType: input.vehicleType,
      serviceType: input.serviceType,
      deliveryType: input.deliveryType,
      itemDescription: input.itemDescription,
      status: "REQUESTED",
      source: input.source || "APP",
      callerPhone: input.callerPhone,
      callerName: input.callerName,
      pickupLat: input.pickup.lat,
      pickupLng: input.pickup.lng,
      pickupAddress: input.pickup.address,
      destLat: input.destination.lat,
      destLng: input.destination.lng,
      destAddress: input.destination.address,
      customerNote: input.customerNote,
      distanceMeters: route.distance,
    },
    include: {
      customer: input.customerId ? {
        include: {
          user: {
            select: { id: true, phone: true, name: true },
          },
        },
      } : false,
    },
  });

  return { trip };
}

export async function getTripById(tripId: string) {
  return prisma.trip.findUnique({
    where: { id: tripId },
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
      feedback: true,
    },
  });
}

export async function cancelTrip(
  tripId: string,
  cancelledBy: string,
  reason?: string
) {
  // The booking cancellation route receives User.id. Resolve it to the
  // Customer.id stored on Trip so another authenticated user cannot cancel
  // a trip merely by knowing its id.
  const customer = await prisma.customer.findUnique({
    where: { userId: cancelledBy },
    select: { id: true },
  });

  if (!customer) {
    throw createError(
      "Customer profile not found",
      403,
      "FORBIDDEN"
    );
  }

  // Cancellation and driver assignment race on the same database row.
  // This conditional update is the arbitration point: once either operation
  // changes the status, the competing operation can no longer overwrite it.
  const cancelled = await prisma.trip.updateMany({
    where: {
      id: tripId,
      customerId: customer.id,
      status: { in: ["REQUESTED", "ACCEPTED"] },
    },
    data: {
      status: "CANCELLED",
      cancelledBy,
      cancelReason: reason,
      dispatchStatus: null,
      dispatchClaimToken: null,
      dispatchClaimedAt: null,
    },
  });

  if (cancelled.count === 0) {
    // The failed conditional write is authoritative. This lookup is only
    // used to return an accurate error; it never performs another write.
    const currentTrip = await prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        customerId: true,
        status: true,
      },
    });

    if (!currentTrip) {
      throw createError(
        "Trip not found",
        404,
        "TRIP_NOT_FOUND"
      );
    }

    if (currentTrip.customerId !== customer.id) {
      throw createError(
        "Not authorized to cancel this trip",
        403,
        "FORBIDDEN"
      );
    }

    throw createError(
      "Cannot cancel trip in current status",
      409,
      "INVALID_TRIP_STATE"
    );
  }

  return prisma.trip.findUniqueOrThrow({
    where: { id: tripId },
  });
}
