/**
 * AllGO Brand Constants
 * 
 * Official brand colors and design tokens.
 * Reference: AllGO v0.1 Branding Update
 */

import { colors } from "./theme";

/**
 * Brand Colors
 * 
 * No gradients. No multiple color combinations. High contrast at all times.
 */
export const BRAND_COLORS = {
  // PRIMARY - Orange
  // Represents warmth, movement, and trust
  // Used for primary buttons and active states
  primary: colors.primary,
  primaryDark: colors.primaryDark,
  primaryLight: colors.primaryLight,

  // BACKGROUND - White
  // Clean bright surface for outdoor readability
  background: colors.background,
  surface: colors.background,
  surfaceElevated: colors.primaryPale,

  // TEXT
  text: colors.textPrimary,
  textSecondary: colors.textSecondary,
  textMuted: colors.textSecondary,

  // ACCENT
  accent: colors.warning,

  // Status colors
  success: colors.success,
  warning: colors.warning,
  error: colors.error,

  // UI Elements
  border: colors.border,
  disabled: colors.border,
} as const;

/**
 * App name styling
 * 
 * Text: "AllGo"
 * "Go" slightly emphasized in Orange
 */
export const BRAND_NAME = "AllGo";
export const BRAND_TAGLINE = "Trusted Rides. Reliable Delivery.";

/**
 * Design rules
 */
export const DESIGN_RULES = {
  noGradients: true,
  highContrast: true,
  minIconSize: 48, // px - for app icon legibility
} as const;

export type BrandColor = keyof typeof BRAND_COLORS;
