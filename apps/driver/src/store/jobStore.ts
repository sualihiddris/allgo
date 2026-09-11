import { create } from "zustand";

type VehicleType = "MOTO" | "KEKE" | "MOTOR_KING";
type ServiceType = "PASSENGER" | "DELIVERY";
type DeliveryType = "FOOD" | "GROCERIES" | "PARCELS" | "OTHER";

interface JobOffer {
  tripId: string;
  offerId: string;
  vehicleType: VehicleType;
  serviceType: ServiceType;
  deliveryType?: DeliveryType;
  itemDescription?: string;
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
  expiresAt: number;
}

interface ActiveJob {
  id: string;
  vehicleType: VehicleType;
  serviceType: ServiceType;
  deliveryType?: DeliveryType;
  itemDescription?: string;
  status: string;
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
  customer: {
    name: string;
    phone: string;
  };
  customerNote?: string;
}

interface JobState {
  currentOffer: JobOffer | null;
  activeJob: ActiveJob | null;
  isAccepting: boolean;
  isDeclining: boolean;
  
  // Actions
  setCurrentOffer: (offer: JobOffer | null) => void;
  setActiveJob: (job: ActiveJob | null) => void;
  setIsAccepting: (loading: boolean) => void;
  setIsDeclining: (loading: boolean) => void;
  clearOffer: () => void;
  reset: () => void;
}

export const useJobStore = create<JobState>((set) => ({
  currentOffer: null,
  activeJob: null,
  isAccepting: false,
  isDeclining: false,
  
  setCurrentOffer: (offer) => set({ currentOffer: offer }),
  setActiveJob: (job) => set({ activeJob: job }),
  setIsAccepting: (loading) => set({ isAccepting: loading }),
  setIsDeclining: (loading) => set({ isDeclining: loading }),
  clearOffer: () => set({ currentOffer: null }),
  reset: () => set({
    currentOffer: null,
    activeJob: null,
    isAccepting: false,
    isDeclining: false,
  }),
}));
