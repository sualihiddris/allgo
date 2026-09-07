/**
 * AllGO MVP Booking Store
 * 
 * Vehicle types: MOTO, KEKE, MOTOR_KING
 * MOTO service types: PASSENGER or DELIVERY
 * NO FARE SYSTEM - payment handled externally
 */

import { create } from "zustand";

export type VehicleType = "MOTO" | "KEKE" | "MOTOR_KING";
export type ServiceType = "PASSENGER" | "DELIVERY";
export type DeliveryType = "FOOD" | "GROCERIES" | "PARCELS" | "OTHER";

interface Location {
  lat: number;
  lng: number;
  address: string;
}

interface Trip {
  id: string;
  status: string;
  dispatchStatus?: "SEARCHING" | "NO_DRIVER_FOUND" | "FAILED" | null;
  pickup: Location;
  destination: Location;
  vehicleType: VehicleType;
  serviceType: ServiceType;
  deliveryType?: DeliveryType | null;
  itemDescription?: string | null;
  customerNote?: string | null;
  driver?: {
    id: string;
    name: string;
    phone: string;
    vehiclePlate: string | null;
  };
}

interface BookingState {
  // Locations
  pickup: Location | null;
  destination: Location | null;
  
  // Vehicle selection
  vehicleType: VehicleType;
  
  // MOTO service type (PASSENGER or DELIVERY)
  serviceType: ServiceType;
  
  // Delivery details (for MOTO DELIVERY)
  deliveryType: DeliveryType | null;
  itemDescription: string;
  
  // Notes
  customerNote: string;
  
  // Current trip
  currentTrip: Trip | null;
  isRecoveredRequestedTrip: boolean;
  isBooking: boolean;
  
  // Actions
  setPickup: (location: Location) => void;
  setDestination: (location: Location) => void;
  setVehicleType: (type: VehicleType) => void;
  setServiceType: (type: ServiceType) => void;
  setDeliveryType: (type: DeliveryType | null) => void;
  setItemDescription: (desc: string) => void;
  setCustomerNote: (note: string) => void;
  setCurrentTrip: (trip: Trip | null) => void;
  setRecoveredRequestedTrip: (recovered: boolean) => void;
  setIsBooking: (loading: boolean) => void;
  reset: () => void;
}

const initialState = {
  pickup: null,
  destination: null,
  vehicleType: "MOTO" as VehicleType,
  serviceType: "PASSENGER" as ServiceType,
  deliveryType: null as DeliveryType | null,
  itemDescription: "",
  customerNote: "",
  currentTrip: null,
  isRecoveredRequestedTrip: false,
  isBooking: false,
};

export const useBookingStore = create<BookingState>((set) => ({
  ...initialState,
  
  setPickup: (location) => set({ pickup: location }),
  setDestination: (location) => set({ destination: location }),
  setVehicleType: (type) => {
    // Reset service type for non-MOTO vehicles
    if (type !== "MOTO") {
      set({ vehicleType: type, serviceType: "PASSENGER", deliveryType: null, itemDescription: "" });
    } else {
      set({ vehicleType: type });
    }
  },
  setServiceType: (type) => {
    if (type === "PASSENGER") {
      set({ serviceType: type, deliveryType: null, itemDescription: "" });
    } else {
      set({ serviceType: type });
    }
  },
  setDeliveryType: (type) => set({ deliveryType: type }),
  setItemDescription: (desc) => set({ itemDescription: desc }),
  setCustomerNote: (note) => set({ customerNote: note }),
  setCurrentTrip: (trip) => set({ currentTrip: trip }),
  setRecoveredRequestedTrip: (recovered) => set({ isRecoveredRequestedTrip: recovered }),
  setIsBooking: (loading) => set({ isBooking: loading }),
  reset: () => set(initialState),
}));
