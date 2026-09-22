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
  initializationError: string | null;

  initialize: () => Promise<void>;
  login: (user: AdminUser) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isInitialized: false,
  initializationError: null,

  initialize: async () => {
    try {
      set({
        isLoading: true,
        initializationError: null,
      });

      if (!adminAuthService.isAuthenticated()) {
        set({
          user: null,
          isAuthenticated: false,
        });
        return;
      }

      const user = await adminAuthService.getMe();

      if (user && user.role === 'ADMIN') {
        set({
          user,
          isAuthenticated: true,
          initializationError: null,
        });
        return;
      }

      await adminAuthService.logout();
      set({
        user: null,
        isAuthenticated: false,
      });
    } catch (error) {
      console.error('Auth init error:', error);

      set({
        user: null,
        isAuthenticated: false,
        initializationError:
          'Unable to verify your admin session. Check the connection and try again.',
      });
    } finally {
      set({
        isLoading: false,
        isInitialized: true,
      });
    }
  },

  login: (user) => {
    if (user.role !== 'ADMIN') {
      throw new Error('Admin access required');
    }

    set({
      user,
      isAuthenticated: true,
      initializationError: null,
    });
  },

  logout: async () => {
    try {
      await adminAuthService.logout();
    } finally {
      set({
        user: null,
        isAuthenticated: false,
        initializationError: null,
      });
    }
  },
}));
