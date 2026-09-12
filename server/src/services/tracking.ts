/**
 * AllGO MVP - Minimal Trip Tracking
 *
 * Section 4D: driver-to-trip mapping is ephemeral, high-frequency state -
 * it lives in the Redis-backed store (config/redis.ts), not Postgres/MySQL,
 * so dispatch stays stateless across multiple backend instances later.
 * Falls back to an in-memory store automatically when REDIS_URL isn't set
 * (see config/redis.ts) - no behavior change for local/pilot use.
 */

import { Server } from "socket.io";
import { prisma } from "../config/database";
import { redis, compareAndDelete } from "../config/redis";

const ACTIVE_TRIP_PREFIX = "active_trip:";
const ACTIVE_TRIP_TTL_SECONDS = 12 * 60 * 60; // 12h safety net in case unregister is ever missed

/**
 * Register an active trip for a driver
 */
export async function registerActiveTrip(driverId: string, tripId: string): Promise<void> {
  await redis.setex(`${ACTIVE_TRIP_PREFIX}${driverId}`, ACTIVE_TRIP_TTL_SECONDS, tripId);
  console.log(`📍 Registered active trip ${tripId} for driver ${driverId}`);
}

/**
 * Unregister active trip when completed/cancelled
 */
export async function unregisterActiveTrip(driverId: string): Promise<void> {
  const deleted = await redis.del(`${ACTIVE_TRIP_PREFIX}${driverId}`);
  if (deleted) {
    console.log(`📍 Unregistered active trip for driver ${driverId}`);
  }
}

/**
 * Unregister active trip only if it still belongs to the given trip.
 *
 * Cancellation-safety invariant:
 * - If active_trip:<driverId> still holds tripId, it is atomically deleted
 *   and true is returned.
 * - If the mapping has already moved on to a newer trip (or is missing),
 *   nothing is deleted and false is returned, so delayed cleanup for a stale
 *   trip can never remove the current trip's mapping.
 *
 * Uses the reviewed atomic compareAndDelete primitive (Lua CAS on real
 * Redis, direct Map compare-and-delete on the in-memory store).
 */
export async function unregisterActiveTripIfCurrent(driverId: string, tripId: string): Promise<boolean> {
  const deleted = await compareAndDelete(`${ACTIVE_TRIP_PREFIX}${driverId}`, tripId);
  if (deleted) {
    console.log(`📍 Unregistered active trip ${tripId} for driver ${driverId}`);
  }
  return deleted;
}

/**
 * Get active trip for a driver (if any)
 */
export async function getActiveTripForDriver(driverId: string): Promise<string | undefined> {
  const tripId = await redis.get(`${ACTIVE_TRIP_PREFIX}${driverId}`);
  return tripId ?? undefined;
}

/**
 * Check if driver has an active trip
 */
export async function hasActiveTrip(driverId: string): Promise<boolean> {
  return (await redis.exists(`${ACTIVE_TRIP_PREFIX}${driverId}`)) === 1;
}

/**
 * Start tracking a trip - returns tracking room info
 */
export async function startTripTracking(
  io: Server,
  tripId: string,
  customerId: string
): Promise<{ trackingRoom: string; driverId: string; currentLocation: { lat: number; lng: number } | null }> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      driver: true,
      customer: true,
    },
  });

  if (!trip) {
    throw new Error("Trip not found");
  }

  if (!trip.driver) {
    throw new Error("No driver assigned to trip");
  }

  // Verify customer owns this trip
  if (trip.customer?.userId !== customerId) {
    throw new Error("Not authorized to track this trip");
  }

  // Get driver's last known location
  const driverLocation = trip.driver.lastLocation as { lat: number; lng: number } | null;

  return {
    trackingRoom: `tracking:trip:${tripId}`,
    driverId: trip.driver.userId,
    currentLocation: driverLocation,
  };
}
