/**
 * AllGO MVP Dispatch Types
 * 
 * Simplified: Rides only - NO FARES
 */

import type { VehicleType } from "../constants/vehicleTypes";

export interface GeoPoint {
  lat: number;
  lng: number;
  address?: string;
}

export interface DispatchJob {
  jobId: string;
  customerId: string;
  pickup: GeoPoint;
  destination: GeoPoint;
  vehicleType: VehicleType;
  serviceType: "PASSENGER" | "DELIVERY";
  deliveryType?: "FOOD" | "GROCERIES" | "PARCELS" | "OTHER";
  itemDescription?: string;
  expiresAt: string; // ISO timestamp for driver response window
}

export interface DriverDecision {
  jobId: string;
  driverId: string;
  action: "ACCEPT" | "DECLINE";
  decidedAt: string;
}

export interface DispatchResult {
  jobId: string;
  status: "ASSIGNED" | "TIMEOUT" | "NO_DRIVER_FOUND";
  acceptedBy?: string; // driverId
}

export interface LocationPing {
  driverId: string;
  jobId?: string;
  lat: number;
  lng: number;
  capturedAt: string;
}
