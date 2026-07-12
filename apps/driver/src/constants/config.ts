import { colors, semanticColors, spacing, typography, radius } from "@allgo/shared/constants/theme";

// Use local IP in development so browser context can reach backend API
// Fall back to localhost for production builds
const getHost = () => {
  if (typeof window !== "undefined" && window.location) {
    return window.location.hostname;
  }
  return "172.20.10.3"; // Fallback to current Wi-Fi IP
};
const host = getHost();
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || `http://${host}:3000/api/v1`;
export const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || `http://${host}:3000`;

/**
 * AllGO Brand Colors (Driver App)
 * 
 * PRIMARY: Orange - buttons, active states
 * BACKGROUND: White - clean, bright surfaces
 * TEXT: Near Black - high readability
 * ACCENT: Amber - alerts, warnings only
 */
export const COLORS = {
  primary: colors.primary,
  primaryDark: colors.primaryDark,
  primaryLight: colors.primaryLight,
  primaryPale: colors.primaryPale,
  deep: colors.deep,
  background: colors.background,
  surface: colors.background,
  surfaceLight: colors.primaryPale,
  text: colors.textPrimary,
  textPrimary: colors.textPrimary,
  textSecondary: colors.textSecondary,
  textMuted: colors.textSecondary,
  accent: colors.warning,
  success: colors.success,
  warning: colors.warning,
  error: colors.error,
  danger: colors.error,
  border: colors.border,
  disabled: colors.border,
  online: colors.success,
  offline: colors.textSecondary,
  textInverse: semanticColors.textInverse,
  surfaceMuted: semanticColors.surfaceMuted,
  overlaySoft: semanticColors.overlaySoft,
  overlay: semanticColors.overlay,
  overlayStrong: semanticColors.overlayStrong,
  inverseSoft: semanticColors.inverseSoft,
  inverseMuted: semanticColors.inverseMuted,
  inverseStrong: semanticColors.inverseStrong,
  warningSoft: semanticColors.warningSoft,
  successSoft: semanticColors.successSoft,
  errorSoft: semanticColors.errorSoft,
  mapTint: semanticColors.mapTint,
} as const;

export type DriverTheme = typeof COLORS;

const NIGHT_THEME: DriverTheme = {
  primary: colors.primary,
  primaryDark: colors.primaryLight,
  primaryLight: "#3A2417",
  primaryPale: "#2A1A12",
  deep: colors.primary,
  background: "#0F1115",
  surface: "#171A21",
  surfaceLight: "#202636",
  text: "#F3F4F6",
  textPrimary: "#F3F4F6",
  textSecondary: "#A7B0BE",
  textMuted: "#A7B0BE",
  accent: colors.warning,
  success: colors.success,
  warning: colors.warning,
  error: colors.error,
  danger: colors.error,
  border: "#2B3140",
  disabled: "#2B3140",
  online: colors.success,
  offline: "#8B95A7",
  textInverse: semanticColors.textInverse,
  surfaceMuted: "#1D2230",
  overlaySoft: "rgba(255,255,255,0.08)",
  overlay: "rgba(255,255,255,0.14)",
  overlayStrong: "rgba(7,10,15,0.88)",
  inverseSoft: "rgba(255,255,255,0.14)",
  inverseMuted: "rgba(255,255,255,0.8)",
  inverseStrong: "rgba(255,255,255,0.95)",
  warningSoft: "rgba(245,158,11,0.14)",
  successSoft: "rgba(22,163,74,0.16)",
  errorSoft: "rgba(220,38,38,0.16)",
  mapTint: "rgba(249,115,22,0.14)",
} as const;

export function getDriverTheme(nightMode: boolean): DriverTheme {
  return nightMode ? NIGHT_THEME : COLORS;
}

export const SPACING = spacing;
export const TYPOGRAPHY = typography;
export const RADIUS = radius;

export const SERVICE_MODES = {
  RIDES: "RIDES",
  DELIVERIES: "DELIVERIES", 
  BOTH: "BOTH",
} as const;

export type ServiceMode = keyof typeof SERVICE_MODES;
