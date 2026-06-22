import { create } from 'zustand';
import { adminAuthService } from '../services/auth';

interface AdminUser {
  id: string;
  phone: string;
  name: string | null;
  role: string;
  admin?: {
    totpEnabled: boolean;
    role: 'BRANCH_ADMIN' | 'SUPER_ADMIN';
    branchId: string | null;
  };
}

interface AuthState {
  user: AdminUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;

  initialize: () => Promise<void>;
  login: (user: AdminUser) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isInitialized: false,

  initialize: async () => {
    try {
      set({ isLoading: true });
      
      if (adminAuthService.isAuthenticated()) {
        const user = await adminAuthService.getMe();
        if (user && user.role === 'ADMIN') {
          set({ user, isAuthenticated: true });
        } else {
          await adminAuthService.logout();
        }
      }
    } catch (error) {
      console.error('Auth init error:', error);
    } finally {
      set({ isLoading: false, isInitialized: true });
    }
  },

  login: (user) => {
    if (user.role !== 'ADMIN') {
      throw new Error('Admin access required');
    }
    set({ user, isAuthenticated: true });
  },

  logout: async () => {
    try {
      await adminAuthService.logout();
    } finally {
      set({ user: null, isAuthenticated: false });
    }
  },
}));
