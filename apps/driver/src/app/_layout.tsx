import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useDriverStore } from "../store";
import notificationService from "../services/notifications";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000,
    },
  },
});

export default function RootLayout() {
  const { initialize, isInitialized, isAuthenticated } = useDriverStore();

  useEffect(() => {
    initialize();
  }, []);

  // Registered once at app start when authenticated - decoupled from the
  // isOnline socket lifecycle (home.tsx) so a backgrounded-but-online
  // driver's token stays registered even while their socket is dead.
  useEffect(() => {
    if (isAuthenticated) {
      notificationService.registerPushToken();
    }
  }, [isAuthenticated]);

  if (!isInitialized) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(main)" options={{ headerShown: false }} />
      </Stack>
    </QueryClientProvider>
  );
}
