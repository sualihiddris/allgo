/**
 * AllGO MVP Dispatch Service
 * 
 * STRICT VEHICLE TYPE MATCHING:
 * - MOTO requests → MOTO drivers only
 * - KEKE requests → KEKE drivers only  
 * - MOTOR_KING requests → MOTOR_KING drivers only
 * 
 * MOTO SERVICE TYPES:
 * - PASSENGER: regular ride for 1 person
 * - DELIVERY: small items (Food/Groceries/Parcels/Other)
 * 
 * DAYTIME RADIUS EXPANSION:
 * Step 1: 2km → Step 2: 5km → Step 3: 8km → NO_DRIVER_FOUND
 * 
 * NIGHT RADIUS EXPANSION (Section 20):
 * Step 1: 3km → Step 2: 6km → Step 3: 10km → NO_DRIVER_FOUND
 * 
 * JOB TIMEOUT: 
 * - Daytime: 30 seconds
 * - Night (9pm-5am): 45 seconds
 * 
 * NIGHT SERVICE (Section 20):
 * - Only MOTO & KEKE (no MOTOR_KING)
 * - Only drivers with nightMode = true
 * 
 * NO PAYMENT: App does not handle fares or payments
 */

import { prisma } from "../config/database";
import { redis } from "../config/redis";
import { VehicleType, ServiceType, DeliveryType } from "@prisma/client";
import {
  isNightServiceHours,
  isVehicleAllowedAtNight,
  getSearchRadii,
  getJobTimeout,
  DAY_SEARCH_RADII,
  DAY_JOB_TIMEOUT_SECONDS,
} from "@allgo/shared/constants/nightService";

// Types
interface DriverLocation {
  lat: number;
  lng: number;
  timestamp: number;
}

interface NearbyDriver {
  driverId: string;
  distance: number;
  lat: number;
  lng: number;
  vehicleType: VehicleType;
  driverName: string;
  driverPhone: string;
}

interface DispatchResult {
  success: boolean;
  driver?: NearbyDriver;
  message: string;
}

// Job offer data sent to driver
export interface JobOffer {
  tripId: string;
  vehicleType: VehicleType;
  serviceType: ServiceType;        // PASSENGER or DELIVERY
  deliveryType?: DeliveryType;     // If MOTO DELIVERY
  itemDescription?: string;        // If deliveryType = OTHER
  pickup: {
    lat: number;
    lng: number;
    address: string;
  };
  destination: {
    lat: number;
    lng: number;
    address: string;
  };
  distance: number;
  customerName: string;
  customerPhone: string;
  customerNote?: string;
  expiresAt: number;  // timestamp
}

// Constants - now dynamic based on time of day
const DRIVER_LOCATION_PREFIX = "driver:location:";
const DRIVER_LOCATION_TTL = 300; // 5 minutes

// Legacy exports for compatibility (use getSearchRadii() and getJobTimeout() instead)
const SEARCH_RADII = DAY_SEARCH_RADII;
export const JOB_TIMEOUT_SECONDS = DAY_JOB_TIMEOUT_SECONDS;

/**
 * Update driver location in Redis
 */
export async function updateDriverLocation(
  driverId: string,
  lat: number,
  lng: number
): Promise<void> {
  const key = `${DRIVER_LOCATION_PREFIX}${driverId}`;
  await redis.setex(
    key,
    DRIVER_LOCATION_TTL,
    JSON.stringify({ lat, lng, timestamp: Date.now() })
  );

  // Also update in database for persistence
  await prisma.driver.update({
    where: { id: driverId },
    data: {
      lastLocation: JSON.stringify({ lat, lng, timestamp: new Date().toISOString() }),
    },
  });
}

/**
 * Get driver location from Redis (with DB fallback)
 */
export async function getDriverLocation(driverId: string): Promise<DriverLocation | null> {
  const key = `${DRIVER_LOCATION_PREFIX}${driverId}`;
  const cached = await redis.get(key);

  if (cached) {
    const parsed = JSON.parse(cached);
    return { lat: parsed.lat, lng: parsed.lng, timestamp: parsed.timestamp };
  }

  // Fallback to database
  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { lastLocation: true },
  });

  if (driver?.lastLocation) {
    const loc = JSON.parse(driver.lastLocation as unknown as string) as { lat: number; lng: number };
    return { lat: loc.lat, lng: loc.lng, timestamp: Date.now() };
  }

  return null;
}

/**
 * Haversine distance calculation
 */
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Find nearby drivers - STRICT vehicle type matching
 * Section 20: Night service only includes nightMode drivers
 */
export async function findNearbyDrivers(
  lat: number,
  lng: number,
  vehicleType: VehicleType,
  radiusMeters: number,
  isNightTime: boolean = false
): Promise<NearbyDriver[]> {
  // Build where clause
  const whereClause: any = {
    vehicleType, // STRICT: must match exactly
    isApproved: true,
    isOnline: true,
    // Section 4A: second safeguard against a lapsed subscription, in case
    // isOnline wasn't properly reset when the period ended
    subscriptionStatus: "ACTIVE",
    subscriptionPeriodEnd: { gt: new Date() },
  };
  
  // Section 20: During night hours, only include drivers with nightMode = true
  if (isNightTime) {
    whereClause.nightMode = true;
  }
  
  // Get online, approved drivers with EXACT vehicle type match
  const drivers = await prisma.driver.findMany({
    where: whereClause,
    include: {
      user: {
        select: {
          name: true,
          phone: true,
        },
      },
    },
  });

  const nearbyDrivers: NearbyDriver[] = [];

  for (const driver of drivers) {
    const location = await getDriverLocation(driver.id);
    if (!location) continue;

    const distance = calculateDistance(lat, lng, location.lat, location.lng);

    if (distance <= radiusMeters) {
      // Check if driver has active trip
      const activeTrip = await prisma.trip.findFirst({
        where: {
          driverId: driver.id,
          status: { in: ["ACCEPTED", "ACTIVE"] },
        },
      });

      if (!activeTrip) {
        nearbyDrivers.push({
          driverId: driver.id,
          distance,
          lat: location.lat,
          lng: location.lng,
          vehicleType: driver.vehicleType,
          driverName: driver.user.name || "Driver",
          driverPhone: driver.user.phone,
        });
      }
    }
  }

  // Sort by distance (nearest first)
  return nearbyDrivers.sort((a, b) => a.distance - b.distance);
}

/**
 * Find driver with radius expansion
 * Daytime: 2km → 5km → 8km → NO_DRIVER_FOUND
 * Night (Section 20): 3km → 6km → 10km → NO_DRIVER_FOUND
 */
export async function findDriverWithExpansion(
  lat: number,
  lng: number,
  vehicleType: VehicleType
): Promise<DispatchResult> {
  const isNight = isNightServiceHours();
  const searchRadii = getSearchRadii();
  
  // Section 20: Check if vehicle type is allowed at night
  if (isNight && !isVehicleAllowedAtNight(vehicleType)) {
    console.log(`[Dispatch] ${vehicleType} not available during night hours`);
    return {
      success: false,
      message: `${vehicleType} service is not available during night hours (9pm-5am). Please try MOTO or KEKE.`,
    };
  }
  
  const modeLabel = isNight ? "NIGHT" : "DAY";
  
  for (const radius of searchRadii) {
    console.log(`[Dispatch ${modeLabel}] Searching ${radius / 1000}km for ${vehicleType}...`);

    const drivers = await findNearbyDrivers(lat, lng, vehicleType, radius, isNight);

    if (drivers.length > 0) {
      console.log(`[Dispatch ${modeLabel}] Found ${drivers.length} drivers within ${radius / 1000}km`);
      return {
        success: true,
        driver: drivers[0], // Nearest driver
        message: `Found driver within ${radius / 1000}km`,
      };
    }
  }

  // No driver found after all radius expansions
  console.log(`[Dispatch ${modeLabel}] No ${vehicleType} drivers found after full search`);
  
  const nightMessage = isNight 
    ? "No night service drivers available right now. Please try again in a few minutes."
    : "No drivers available nearby. Please try again in a few minutes.";
    
  return {
    success: false,
    message: nightMessage,
  };
}

/**
 * Assign trip to driver
 */
export async function assignTripToDriver(tripId: string, driverId: string) {
  return prisma.trip.update({
    where: { id: tripId },
    data: {
      driverId,
      status: "ACCEPTED",
      acceptedAt: new Date(),
    },
    include: {
      customer: {
        include: {
          user: { select: { id: true, phone: true, name: true } },
        },
      },
      driver: {
        include: {
          user: { select: { id: true, phone: true, name: true } },
        },
      },
    },
  });
}

/**
 * Section 4A: a driver's subscription is only ACTIVE if both the status
 * flag and the period end are still valid - the flag alone can go stale
 * since nothing flips it on a schedule in this MVP (no cron job)
 */
export function hasActiveSubscription(driver: { subscriptionStatus: string; subscriptionPeriodEnd: Date | null }): boolean {
  return (
    driver.subscriptionStatus === "ACTIVE" &&
    !!driver.subscriptionPeriodEnd &&
    driver.subscriptionPeriodEnd > new Date()
  );
}

/**
 * Check if driver is available
 */
export async function isDriverAvailable(driverId: string): Promise<boolean> {
  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { isOnline: true, isApproved: true, subscriptionStatus: true, subscriptionPeriodEnd: true },
  });

  if (!driver || !driver.isOnline || !driver.isApproved || !hasActiveSubscription(driver)) {
    return false;
  }

  // Check for active trips
  const activeTrip = await prisma.trip.count({
    where: {
      driverId,
      status: { in: ["ACCEPTED", "ACTIVE"] },
    },
  });

  return activeTrip === 0;
}

/**
 * Update driver night mode setting
 */
export async function updateDriverNightMode(
  driverId: string,
  nightMode: boolean
): Promise<void> {
  await prisma.driver.update({
    where: { id: driverId },
    data: { nightMode },
  });
  console.log(`[Dispatch] Driver ${driverId} nightMode set to ${nightMode}`);
}

/**
 * Get current dispatch timeout based on time of day
 */
export function getCurrentJobTimeout(): number {
  return getJobTimeout();
}

// Export constants for use elsewhere
export { SEARCH_RADII, getSearchRadii, getJobTimeout, isNightServiceHours, isVehicleAllowedAtNight };
