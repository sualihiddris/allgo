import { API_BASE_URL } from "../constants/config";
import { driverAuthService } from "./auth";

export const tripService = {
  async updateTripStatus(
    tripId: string,
    status: "STARTED" | "COMPLETED",
    location?: { lat: number; lng: number }
  ) {
    const token = driverAuthService.getAccessToken();
    
    const response = await fetch(`${API_BASE_URL}/tracking/trip/${tripId}/status`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status, location }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to update trip status");
    }

    const data = await response.json();
    return data.data.trip;
  },

  async getTrip(tripId: string) {
    const token = driverAuthService.getAccessToken();
    
    const response = await fetch(`${API_BASE_URL}/tracking/trip/${tripId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to get trip");
    }

    const data = await response.json();
    return data.data.trip;
  },

  async getActiveTrips() {
    const token = driverAuthService.getAccessToken();
    
    const response = await fetch(`${API_BASE_URL}/driver/trips/active`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to get active trips");
    }

    const data = await response.json();
    return data.data.trips;
  },

  async getTripHistory(limit: number = 20) {
    const token = driverAuthService.getAccessToken();
    
    const response = await fetch(`${API_BASE_URL}/driver/trips?limit=${limit}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to get trip history");
    }

    const data = await response.json();
    return data.data.trips;
  },
};

export default tripService;
