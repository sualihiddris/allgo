/**
 * AllGO MVP Trip Status
 * 
 * REQUESTED - Customer requested, looking for driver
 * ACCEPTED - Driver accepted, en route to pickup
 * ACTIVE - Trip in progress
 * COMPLETED - Trip finished
 * CANCELLED - Trip cancelled
 */

export const TRIP_STATUS = {
  REQUESTED: "REQUESTED",
  ACCEPTED: "ACCEPTED",
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;

export type TripStatus = (typeof TRIP_STATUS)[keyof typeof TRIP_STATUS];

// Display names
export const TRIP_STATUS_DISPLAY: Record<TripStatus, string> = {
  REQUESTED: "Finding Driver",
  ACCEPTED: "Driver On The Way",
  ACTIVE: "Trip In Progress",
  COMPLETED: "Trip Completed",
  CANCELLED: "Cancelled",
};
