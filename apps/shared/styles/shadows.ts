import { Platform, ViewStyle } from "react-native";

export interface ShadowConfig {
  elevation?: number;
  shadowColor?: string;
  shadowOpacity?: number;
  shadowOffset?: { width: number; height: number };
  shadowRadius?: number;
}

/**
 * Creates platform-specific shadow styles
 * Uses elevation for Android and shadow properties for iOS
 */
export const createShadow = (
  elevation: number = 4,
  color: string = "rgba(0, 0, 0, 0.25)",
  opacity: number = 0.15,
  offset: { width: number; height: number } = { width: 0, height: 2 },
  radius: number = 4
): ViewStyle => {
  if (Platform.OS === "android") {
    return {
      elevation,
    };
  }

  return {
    shadowColor: color,
    shadowOffset: offset,
    shadowOpacity: opacity,
    shadowRadius: radius,
  };
};

/**
 * Preset shadow styles
 */
export const shadows = {
  small: createShadow(2, "rgba(0, 0, 0, 0.25)", 0.1, { width: 0, height: 2 }, 4),
  medium: createShadow(4, "rgba(0, 0, 0, 0.25)", 0.15, { width: 0, height: 4 }, 8),
  large: createShadow(8, "rgba(0, 0, 0, 0.25)", 0.2, { width: 0, height: 8 }, 12),
};
