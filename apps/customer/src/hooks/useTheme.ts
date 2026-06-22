import { useColorScheme } from "react-native";
import { useThemeStore } from "../store/themeStore";
import { getCustomerTheme, CustomerTheme } from "../constants/config";

/**
 * Resolves the user's Appearance mode (Light/Dark/System) to an actual
 * theme. "system" follows the OS color scheme via useColorScheme() and
 * updates live if the OS theme changes while the app is open.
 */
export function useTheme(): CustomerTheme {
  const mode = useThemeStore((s) => s.mode);
  const systemScheme = useColorScheme();

  const isDark = mode === "dark" || (mode === "system" && systemScheme === "dark");

  return getCustomerTheme(isDark);
}

/** True if the resolved theme is currently dark - handy for StatusBar style, etc. */
export function useIsDarkMode(): boolean {
  const mode = useThemeStore((s) => s.mode);
  const systemScheme = useColorScheme();
  return mode === "dark" || (mode === "system" && systemScheme === "dark");
}
