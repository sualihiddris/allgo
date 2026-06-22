import { create } from "zustand";
import { driverAuthService, DriverProfile } from "../services/auth";
import { driverApiService } from "../services/driver";
import { ServiceMode, SERVICE_MODES } from "../constants/config";

interface DriverState {
  user: DriverProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  isOnline: boolean;
  nightMode: boolean;  // Section 20
  serviceMode: ServiceMode;
  isUpdatingOnline: boolean;
  isUpdatingNightMode: boolean;

  // Actions
  initialize: () => Promise<void>;
  setUser: (user: DriverProfile | null) => void;
  login: (user: DriverProfile) => void;
  logout: () => Promise<void>;
  toggleOnline: () => Promise<{ success: boolean; message: string }>;
  toggleNightMode: () => Promise<{ success: boolean; message: string }>;
  setServiceMode: (mode: ServiceMode) => void;
  updateProfile: (updates: Partial<DriverProfile>) => void;
}

export const useDriverStore = create<DriverState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isInitialized: false,
  isOnline: false,
  nightMode: false,  // Section 20
  serviceMode: SERVICE_MODES.BOTH,
  isUpdatingOnline: false,
  isUpdatingNightMode: false,

  initialize: async () => {
    try {
      set({ isLoading: true });
      
      const hasToken = await driverAuthService.init();
      
      if (hasToken) {
        const user = await driverAuthService.getMe();
        if (user) {
          set({ 
            user, 
            isAuthenticated: true,
            isOnline: user.driver?.isOnline || false,
            nightMode: user.driver?.nightMode || false,  // Section 20
            serviceMode: (user.driver?.serviceMode as ServiceMode) || SERVICE_MODES.BOTH,
          });
        }
      }
    } catch (error) {
      console.error("Auth init error:", error);
    } finally {
      set({ isLoading: false, isInitialized: true });
    }
  },

  setUser: (user) => {
    set({ user, isAuthenticated: !!user });
  },

  login: (user) => {
    set({ 
      user, 
      isAuthenticated: true,
      isOnline: user.driver?.isOnline || false,
      nightMode: user.driver?.nightMode || false,  // Section 20
      serviceMode: (user.driver?.serviceMode as ServiceMode) || SERVICE_MODES.BOTH,
    });
  },

  logout: async () => {
    try {
      await driverAuthService.logout();
    } finally {
      set({ user: null, isAuthenticated: false, isOnline: false, nightMode: false });
    }
  },

  // Toggle online status with API call
  toggleOnline: async () => {
    const { isOnline, isUpdatingOnline } = get();
    
    if (isUpdatingOnline) {
      return { success: false, message: "Already updating..." };
    }
    
    set({ isUpdatingOnline: true });
    
    try {
      const newOnlineStatus = !isOnline;
      const result = await driverApiService.setOnline(newOnlineStatus);
      
      if (result.success) {
        set({ isOnline: newOnlineStatus });
      }
      
      return result;
    } catch (error) {
      return { 
        success: false, 
        message: error instanceof Error ? error.message : "Failed to update status" 
      };
    } finally {
      set({ isUpdatingOnline: false });
    }
  },

  // Section 20: Toggle night mode with API call
  toggleNightMode: async () => {
    const { nightMode, isUpdatingNightMode } = get();
    
    if (isUpdatingNightMode) {
      return { success: false, message: "Already updating..." };
    }
    
    set({ isUpdatingNightMode: true });
    
    try {
      const newNightMode = !nightMode;
      const result = await driverApiService.setNightMode(newNightMode);
      
      if (result.success) {
        set({ nightMode: newNightMode });
      }
      
      return result;
    } catch (error) {
      return { 
        success: false, 
        message: error instanceof Error ? error.message : "Failed to update night mode" 
      };
    } finally {
      set({ isUpdatingNightMode: false });
    }
  },

  setServiceMode: (mode) => {
    set({ serviceMode: mode });
    // TODO: Call API to update service mode
  },

  updateProfile: (updates) => {
    const { user } = get();
    if (user) {
      set({ user: { ...user, ...updates } });
    }
  },
}));
