/**
 * AllGO Section 20: Night Priority Service Constants
 * 
 * Night service operates 9pm-5am with:
 * - Driver opt-in (nightMode)
 * - Expanded search radius
 * - Extended timeout
 * - All vehicle types allowed
 */

import { VEHICLE_TYPES, VehicleType } from "./vehicleTypes";

// Night service hours (24h format)
export const NIGHT_SERVICE = {
  START_HOUR: 21,  // 9:00 PM
  END_HOUR: 5,     // 5:00 AM
} as const;

// Call-in booking hours (Section 18)
export const CALL_IN_HOURS = {
  START_HOUR: 7,   // 7:00 AM
  END_HOUR: 21,    // 9:00 PM
} as const;

// Search radius for night service (meters)
export const NIGHT_SEARCH_RADII = [3000, 6000, 10000]; // 3km → 6km → 10km

// Search radius for daytime (meters)
export const DAY_SEARCH_RADII = [2000, 5000, 8000]; // 2km → 5km → 8km

// Job timeout in seconds
export const NIGHT_JOB_TIMEOUT_SECONDS = 45; // Extended for night
export const DAY_JOB_TIMEOUT_SECONDS = 30;   // Standard daytime

// Vehicles allowed during night service
export const NIGHT_ALLOWED_VEHICLES: VehicleType[] = [
  VEHICLE_TYPES.MOTO,
  VEHICLE_TYPES.KEKE,
  VEHICLE_TYPES.MOTOR_KING,
];

// Check if a vehicle is allowed at night
export function isVehicleAllowedAtNight(vehicleType: VehicleType): boolean {
  return NIGHT_ALLOWED_VEHICLES.includes(vehicleType);
}

// Check if current time is within night service hours
export function isNightServiceHours(date: Date = new Date()): boolean {
  const hour = date.getHours();
  // Night service: 9pm (21) to 5am
  return hour >= NIGHT_SERVICE.START_HOUR || hour < NIGHT_SERVICE.END_HOUR;
}

// Check if current time is within call-in hours
export function isCallInHours(date: Date = new Date()): boolean {
  const hour = date.getHours();
  // Call-in: 7am to 9pm
  return hour >= CALL_IN_HOURS.START_HOUR && hour < CALL_IN_HOURS.END_HOUR;
}

// Get appropriate search radii based on time
export function getSearchRadii(date: Date = new Date()): number[] {
  return isNightServiceHours(date) ? NIGHT_SEARCH_RADII : DAY_SEARCH_RADII;
}

// Get appropriate job timeout based on time
export function getJobTimeout(date: Date = new Date()): number {
  return isNightServiceHours(date) ? NIGHT_JOB_TIMEOUT_SECONDS : DAY_JOB_TIMEOUT_SECONDS;
}

// Trip source types (Section 18)
export const TRIP_SOURCE = {
  APP: "APP",
  CALL: "CALL",
} as const;

export type TripSource = (typeof TRIP_SOURCE)[keyof typeof TRIP_SOURCE];
