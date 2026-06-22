import { API_URL } from "../constants/config";
import { authService } from "./auth";

interface Location {
  lat: number;
  lng: number;
  address: string;
}

type VehicleType = "MOTO" | "KEKE" | "MOTOR_KING";
type ServiceType = "PASSENGER" | "DELIVERY";
type DeliveryType = "FOOD" | "GROCERIES" | "PARCELS" | "OTHER";

interface TripHistoryItem {
  id: string;
  status: string;
  source: "APP" | "CALL";
  vehicleType: VehicleType;
  serviceType: ServiceType;
  pickupAddress: string;
  destAddress: string;
  createdAt: string;
  driver?: {
    user?: {
      name?: string | null;
      phone?: string | null;
    } | null;
    vehicleType?: string;
  } | null;
  feedback?: {
    rating: number;
  } | null;
}

export const bookingService = {
  async createTrip(params: {
    vehicleType: VehicleType;
    serviceType: ServiceType;
    deliveryType?: DeliveryType;
    itemDescription?: string;
    pickup: Location;
    destination: Location;
    customerNote?: string;
  }) {
    const token = await authService.getAccessToken();
    
    const response = await fetch(`${API_URL}/bookings/trip`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to create trip");
    }

    const data = await response.json();
    return data.data;
  },

  async getTrip(tripId: string) {
    const token = await authService.getAccessToken();
    
    const response = await fetch(`${API_URL}/bookings/trip/${tripId}`, {
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

  async getTrips() {
    const token = await authService.getAccessToken();

    const response = await fetch(`${API_URL}/bookings/trips`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to get trips");
    }

    const data = await response.json();
    return data.data.trips as TripHistoryItem[];
  },

  async cancelTrip(tripId: string, reason?: string) {
    const token = await authService.getAccessToken();
    
    const response = await fetch(`${API_URL}/bookings/trip/${tripId}/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reason }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to cancel trip");
    }

    const data = await response.json();
    return data.data.trip;
  },

  async submitFeedback(params: {
    tripId: string;
    rating: number;
    fareRating: "fair" | "too_high" | "too_low";
    issue?: string;
  }) {
    const token = await authService.getAccessToken();
    
    const response = await fetch(`${API_URL}/feedback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to submit feedback");
    }

    const data = await response.json();
    return data.data.feedback;
  },
};

export default bookingService;
