export const colors = {
  primary: "#F97316",
  primaryPale: "#FFF0E6",
  primaryLight: "#FFD4B3",
  primaryDark: "#C2410C",
  deep: "#7C2D12",
  background: "#FFFFFF",
  textPrimary: "#1A1A1A",
  textSecondary: "#6B7280",
  border: "#E5E5E5",
  success: "#16A34A",
  successPale: "#DCFCE7",
  warning: "#F59E0B",
  warningPale: "#FEF3C7",
  error: "#DC2626",
  errorPale: "#FEE2E2",
  online: "#16A34A",
  offline: "#6B7280",
  white: "#FFFFFF",
  black: "#1A1A1A",
} as const;

export const semanticColors = {
  textInverse: "#FFFFFF",
  surfaceMuted: "#FFFFFF",
  overlaySoft: "rgba(0,0,0,0.3)",
  overlay: "rgba(0,0,0,0.5)",
  overlayStrong: "rgba(0,0,0,0.7)",
  inverseSoft: "rgba(255,255,255,0.2)",
  inverseMuted: "rgba(255,255,255,0.8)",
  inverseStrong: "rgba(255,255,255,0.9)",
  warningSoft: "rgba(245,158,11,0.2)",
  successSoft: "rgba(22,163,74,0.12)",
  errorSoft: "rgba(220,38,38,0.12)",
  mapTint: "rgba(249,115,22,0.1)",
} as const;

export const statusBadge = {
  searching: {
    background: colors.primaryPale,
    text: colors.primaryDark,
  },
  accepted: {
    background: colors.primaryPale,
    text: colors.primaryDark,
  },
  active: {
    background: colors.successPale,
    text: "#15803D",
  },
  completed: {
    background: colors.successPale,
    text: "#15803D",
  },
  warning: {
    background: colors.warningPale,
    text: "#B45309",
  },
  expired: {
    background: colors.errorPale,
    text: "#B91C1C",
  },
  trial: {
    background: colors.warningPale,
    text: "#B45309",
  },
  subscriptionActive: {
    background: colors.successPale,
    text: "#15803D",
  },
  subscriptionExpiringSoon: {
    background: colors.warningPale,
    text: "#B45309",
  },
  subscriptionExpired: {
    background: colors.errorPale,
    text: "#B91C1C",
  },
  jobOffer: {
    background: colors.primaryPale,
    text: colors.primaryDark,
  },
} as const;

export const typography = {
  screenTitle: { fontSize: 22, fontWeight: "500" },
  sectionHeader: { fontSize: 18, fontWeight: "500" },
  body: { fontSize: 16, fontWeight: "400" },
  label: { fontSize: 14, fontWeight: "500" },
  caption: { fontSize: 13, fontWeight: "400" },
  badge: { fontSize: 11, fontWeight: "500" },
  lineHeight: 1.6,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 999,
} as const;

export const shadows = {
  none: "none",
} as const;