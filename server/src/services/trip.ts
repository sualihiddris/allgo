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

export async function cancelTrip(tripId: string, cancelledBy: string, reason?: string) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  
  if (!trip) throw new Error("Trip not found");
  if (!["REQUESTED", "ACCEPTED"].includes(trip.status)) {
    throw new Error("Cannot cancel trip in current status");
  }

  return prisma.trip.update({
    where: { id: tripId },
    data: {
      status: "CANCELLED",
      cancelledBy,
      cancelReason: reason,
    },
  });
}
