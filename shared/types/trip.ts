/**
 * AllGO MVP Trip Types
 * 
 * Simplified: No payment or fare fields
 */

import type { VehicleType } from "../constants/vehicleTypes";
import type { TripStatus } from "../constants/jobStatus";
import type { GeoPoint } from "./dispatch";

export interface Trip {
  id: string;
  customerId: string;
  driverId?: string;
  pickup: GeoPoint;
  destination: GeoPoint;
  vehicleType: VehicleType;
  serviceType: "PASSENGER" | "DELIVERY";
  deliveryType?: "FOOD" | "GROCERIES" | "PARCELS" | "OTHER";
  itemDescription?: string;
  status: TripStatus;
  customerNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Feedback {
  id: string;
  tripId: string;
  rating: number;
  fareRating: "fair" | "too_high" | "too_low";
  issue?: string;
  createdAt: string;
}
