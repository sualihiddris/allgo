import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type AppearanceMode = "light" | "dark" | "system";

const STORAGE_KEY = "appearance_mode";

interface ThemeState {
  mode: AppearanceMode;
  isInitialized: boolean;

  initialize: () => Promise<void>;
  setMode: (mode: AppearanceMode) => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: "system",
  isInitialized: false,

  initialize: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored === "light" || stored === "dark" || stored === "system") {
        set({ mode: stored });
      }
    } catch (error) {
      console.error("Failed to load appearance mode:", error);
    } finally {
      set({ isInitialized: true });
    }
  },

  setMode: async (mode) => {
    set({ mode });
    try {
      await AsyncStorage.setItem(STORAGE_KEY, mode);
    } catch (error) {
      console.error("Failed to save appearance mode:", error);
    }
  },
}));
