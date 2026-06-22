import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore, useThemeStore } from "../store";
import { useIsDarkMode } from "../hooks/useTheme";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

export default function RootLayout() {
  const { initialize, isInitialized } = useAuthStore();
  const { initialize: initializeTheme, isInitialized: isThemeInitialized } = useThemeStore();
  const isDark = useIsDarkMode();

  useEffect(() => {
    initialize();
    initializeTheme();
  }, []);

  if (!isInitialized || !isThemeInitialized) {
    return null; // Or a splash screen
  }

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(main)" options={{ headerShown: false }} />
        <Stack.Screen name="trip-detail" options={{ headerShown: false }} />
      </Stack>
    </QueryClientProvider>
  );
}
