/**
 * AllGO Trip Tracking Screen
 * 
 * Handles the full trip flow:
 * 1. SEARCHING: "Searching for drivers..." with cancel option
 * 2. NO_DRIVER_FOUND: "No drivers available" with retry
 * 3. ACCEPTED: Show driver info and start tracking
 * 4. ARRIVED/STARTED/COMPLETED: Show trip progress
 */

import { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { SPACING, CustomerTheme } from "../../constants/config";
import { useTheme } from "../../hooks/useTheme";
import { useBookingStore } from "../../store/bookingStore";
import { socketService, TripAcceptedData, DriverLocation } from "../../services/socket";
import bookingService from "../../services/booking";

type TripState = 
  | "SEARCHING" 
  | "NO_DRIVER_FOUND" 
  | "ACCEPTED" 
  | "ARRIVED" 
  | "STARTED" 
  | "COMPLETED"
  | "CANCELLED";

export default function TripTrackingScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = createStyles(theme);
  const { currentTrip, reset, setCurrentTrip } = useBookingStore();
  
  const [tripState, setTripState] = useState<TripState>("SEARCHING");
  const [driver, setDriver] = useState<TripAcceptedData["driver"] | null>(null);
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [searchTimeout, setSearchTimeout] = useState(30); // 30s for day, 45s for night
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Check if night mode (9pm - 5am) for 45s timeout
    const hour = new Date().getHours();
    const isNight = hour >= 21 || hour < 5;
    setSearchTimeout(isNight ? 45 : 30);

    // Connect socket and start dispatch
    initializeTrip();

    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
      socketService.disconnect();
    };
  }, []);

  useEffect(() => {
    // Pulse animation for searching state
    if (tripState === "SEARCHING") {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [tripState]);

  const initializeTrip = async () => {
    if (!currentTrip?.id) {
      Alert.alert("Error", "No trip found");
      router.replace("/home");
      return;
    }

    try {
      // Connect to socket
      await socketService.connect();

      // Set up event listeners
      socketService.onTripAccepted(handleTripAccepted);
      socketService.onTripNoDrivers(handleNoDrivers);
      socketService.onTripStatus(handleTripStatus);
      socketService.onDriverLocation(handleDriverLocation);

      // Dispatch trip
      socketService.dispatchTrip(currentTrip.id);

      // Start search timeout
      searchTimerRef.current = setTimeout(() => {
        if (tripState === "SEARCHING") {
          setTripState("NO_DRIVER_FOUND");
        }
      }, searchTimeout * 1000);
    } catch (error) {
      console.error("Failed to initialize trip:", error);
      Alert.alert("Error", "Failed to connect. Please try again.");
      router.back();
    }
  };

  const handleTripAccepted = (data: TripAcceptedData) => {
    console.log("Trip accepted by driver:", data);
    
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    
    setDriver(data.driver);
    setTripState("ACCEPTED");
    
    // Start tracking driver location
    if (currentTrip?.id) {
      socketService.startTracking(currentTrip.id);
    }
  };

  const handleNoDrivers = () => {
    console.log("No drivers found");
    
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    
    setTripState("NO_DRIVER_FOUND");
  };

  const handleTripStatus = (data: { status: string }) => {
    console.log("Trip status update:", data);
    
    const statusMap: Record<string, TripState> = {
      ARRIVED: "ARRIVED",
      STARTED: "STARTED",
      COMPLETED: "COMPLETED",
      CANCELLED: "CANCELLED",
    };
    
    const newState = statusMap[data.status];
    if (newState) {
      setTripState(newState);
      
      // Navigate to feedback after completion
      if (newState === "COMPLETED" && currentTrip?.id) {
        setTimeout(() => {
          router.replace({
            pathname: "/feedback",
            params: { tripId: currentTrip.id },
          });
        }, 1000);
      }
      
      // Go home if cancelled
      if (newState === "CANCELLED") {
        setTimeout(() => {
          reset();
          router.replace("/home");
        }, 2000);
      }
    }
  };

  const handleDriverLocation = (location: DriverLocation) => {
    setDriverLocation(location);
  };

  const handleCancelTrip = async () => {
    Alert.alert(
      "Cancel Trip",
      tripState === "SEARCHING" 
        ? "Stop searching for drivers?" 
        : "Are you sure you want to cancel this trip?",
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Cancel",
          style: "destructive",
          onPress: async () => {
            try {
              if (currentTrip?.id) {
                await bookingService.cancelTrip(currentTrip.id, "Customer cancelled");
              }
              reset();
              router.replace("/home");
            } catch (error) {
              console.error("Failed to cancel trip:", error);
              Alert.alert("Error", "Failed to cancel trip");
            }
          },
        },
      ]
    );
  };

  const handleRetrySearch = () => {
    setTripState("SEARCHING");
    if (currentTrip?.id) {
      socketService.dispatchTrip(currentTrip.id);
      searchTimerRef.current = setTimeout(() => {
        if (tripState === "SEARCHING") {
          setTripState("NO_DRIVER_FOUND");
        }
      }, searchTimeout * 1000);
    }
  };

  const handleCallDriver = () => {
    if (driver?.phone) {
      const phoneUrl = `tel:${driver.phone}`;
      Linking.openURL(phoneUrl);
    }
  };

  // Render based on trip state
  const renderContent = () => {
    switch (tripState) {
      case "SEARCHING":
        return (
          <View style={styles.centerContent}>
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <Text style={styles.searchIcon}>🔍</Text>
            </Animated.View>
            <Text style={styles.statusTitle}>Searching for drivers...</Text>
            <Text style={styles.statusDescription}>
              This usually takes less than {searchTimeout} seconds
            </Text>
            <ActivityIndicator size="large" color={theme.primary} style={styles.loader} />
            <TouchableOpacity style={styles.cancelButton} onPress={handleCancelTrip}>
              <Text style={styles.cancelText}>Cancel Search</Text>
            </TouchableOpacity>
          </View>
        );

      case "NO_DRIVER_FOUND":
        return (
          <View style={styles.centerContent}>
            <Text style={styles.errorIcon}>😔</Text>
            <Text style={styles.statusTitle}>No drivers available</Text>
            <Text style={styles.statusDescription}>
              All drivers are currently busy. Please try again in a few minutes.
            </Text>
            <TouchableOpacity style={styles.primaryButton} onPress={handleRetrySearch}>
              <Text style={styles.primaryButtonText}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => {
              reset();
              router.replace("/home");
            }}>
              <Text style={styles.secondaryButtonText}>Go Home</Text>
            </TouchableOpacity>
          </View>
        );

      case "ACCEPTED":
      case "ARRIVED":
      case "STARTED":
        return (
          <View style={styles.trackingContent}>
            {/* Driver Card */}
            <View style={styles.driverCard}>
              <View style={styles.driverAvatar}>
                <Text style={styles.avatarText}>
                  {driver?.name?.[0]?.toUpperCase() || "D"}
                </Text>
              </View>
              <View style={styles.driverInfo}>
                <Text style={styles.driverName}>{driver?.name || "Driver"}</Text>
                <Text style={styles.driverVehicle}>
                  {driver?.vehicleType} • {driver?.licensePlate}
                </Text>
              </View>
              <TouchableOpacity style={styles.callButton} onPress={handleCallDriver}>
                <Text style={styles.callIcon}>📞</Text>
              </TouchableOpacity>
            </View>

            {/* Trip Status */}
            <View style={styles.statusCard}>
              {tripState === "ACCEPTED" && (
                <>
                  <Text style={styles.statusEmoji}>🚗</Text>
                  <Text style={styles.statusTitle}>Driver is on the way</Text>
                  <Text style={styles.statusDescription}>
                    Your driver is heading to your pickup location
                  </Text>
                </>
              )}
              {tripState === "ARRIVED" && (
                <>
                  <Text style={styles.statusEmoji}>📍</Text>
                  <Text style={styles.statusTitle}>Driver has arrived</Text>
                  <Text style={styles.statusDescription}>
                    Your driver is waiting at the pickup location
                  </Text>
                </>
              )}
              {tripState === "STARTED" && (
                <>
                  <Text style={styles.statusEmoji}>🎯</Text>
                  <Text style={styles.statusTitle}>Trip in progress</Text>
                  <Text style={styles.statusDescription}>
                    You're on your way to the destination
                  </Text>
                </>
              )}
            </View>

            {/* Payment Reminder */}
            <View style={styles.paymentReminder}>
              <Text style={styles.reminderIcon}>💰</Text>
              <View style={styles.reminderText}>
                <Text style={styles.reminderTitle}>Payment after trip</Text>
                <Text style={styles.reminderDescription}>
                  Negotiate fare with driver and pay directly (cash or MoMo)
                </Text>
              </View>
            </View>

            {/* Cancel Trip Button (only if not started) */}
            {tripState !== "STARTED" && (
              <TouchableOpacity style={styles.cancelTripButton} onPress={handleCancelTrip}>
                <Text style={styles.cancelTripText}>Cancel Trip</Text>
              </TouchableOpacity>
            )}
          </View>
        );

      case "COMPLETED":
        return (
          <View style={styles.centerContent}>
            <Text style={styles.successIcon}>✅</Text>
            <Text style={styles.statusTitle}>Trip Completed!</Text>
            <Text style={styles.statusDescription}>
              Redirecting to feedback...
            </Text>
          </View>
        );

      case "CANCELLED":
        return (
          <View style={styles.centerContent}>
            <Text style={styles.errorIcon}>❌</Text>
            <Text style={styles.statusTitle}>Trip Cancelled</Text>
            <Text style={styles.statusDescription}>
              Returning to home...
            </Text>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {renderContent()}
    </SafeAreaView>
  );
}

function createStyles(theme: CustomerTheme) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: SPACING.xl,
  },
  trackingContent: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
  },
  searchIcon: {
    fontSize: 80,
    marginBottom: SPACING.lg,
  },
  errorIcon: {
    fontSize: 80,
    marginBottom: SPACING.lg,
  },
  successIcon: {
    fontSize: 80,
    marginBottom: SPACING.lg,
  },
  statusEmoji: {
    fontSize: 60,
    marginBottom: SPACING.md,
  },
  statusTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: theme.text,
    textAlign: "center",
    marginBottom: SPACING.sm,
  },
  statusDescription: {
    fontSize: 16,
    color: theme.textSecondary,
    textAlign: "center",
    lineHeight: 24,
  },
  loader: {
    marginVertical: SPACING.xl,
  },
  primaryButton: {
    backgroundColor: theme.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: 12,
    marginTop: SPACING.xl,
    minWidth: 200,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.textInverse,
    textAlign: "center",
  },
  secondaryButton: {
    backgroundColor: theme.surface,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: 12,
    marginTop: SPACING.md,
    minWidth: 200,
    borderWidth: 1,
    borderColor: theme.border,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.text,
    textAlign: "center",
  },
  cancelButton: {
    marginTop: SPACING.xl,
    paddingVertical: SPACING.sm,
  },
  cancelText: {
    fontSize: 16,
    color: theme.error,
    fontWeight: "600",
  },
  driverCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.surface,
    padding: SPACING.lg,
    borderRadius: 16,
    marginBottom: SPACING.lg,
    shadowColor: theme.deep,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  driverAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.primary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: SPACING.md,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: "700",
    color: theme.textInverse,
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.text,
    marginBottom: 4,
  },
  driverVehicle: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  callButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.success,
    justifyContent: "center",
    alignItems: "center",
  },
  callIcon: {
    fontSize: 24,
  },
  statusCard: {
    backgroundColor: theme.surface,
    padding: SPACING.xl,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: SPACING.lg,
    shadowColor: theme.deep,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  paymentReminder: {
    flexDirection: "row",
    backgroundColor: theme.primaryLight,
    padding: SPACING.md,
    borderRadius: 12,
    marginBottom: SPACING.lg,
  },
  reminderIcon: {
    fontSize: 32,
    marginRight: SPACING.md,
  },
  reminderText: {
    flex: 1,
  },
  reminderTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.text,
    marginBottom: 4,
  },
  reminderDescription: {
    fontSize: 12,
    color: theme.textSecondary,
    lineHeight: 18,
  },
  cancelTripButton: {
    paddingVertical: SPACING.md,
    alignItems: "center",
  },
  cancelTripText: {
    fontSize: 16,
    color: theme.error,
    fontWeight: "600",
  },
});
}
