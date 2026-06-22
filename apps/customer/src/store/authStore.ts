import { create } from "zustand";
import { authService } from "../services/auth";

interface User {
  id: string;
  phone: string;
  name: string | null;
  photoUrl?: string;
  role: string;
  customer?: {
    loyaltyPoints: number;
    loyaltyTier: string;
    referralCode: string;
  };
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;

  // Actions
  initialize: () => Promise<void>;
  setUser: (user: User | null) => void;
  login: (user: User) => void;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isInitialized: false,

  initialize: async () => {
    try {
      set({ isLoading: true });
      
      const hasToken = await authService.init();
      
      if (hasToken) {
        const user = await authService.getMe();
        if (user) {
          set({ user, isAuthenticated: true });
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
    set({ user, isAuthenticated: true });
  },

  logout: async () => {
    try {
      await authService.logout();
    } finally {
      set({ user: null, isAuthenticated: false });
    }
  },

  updateProfile: (updates) => {
    const { user } = get();
    if (user) {
      set({ user: { ...user, ...updates } });
    }
  },
}));
