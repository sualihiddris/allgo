/**
 * AllGO Trip Tracking Screen
 * 
 * Handles the full trip flow:
 * 1. SEARCHING: "Searching for drivers..." with cancel option
 * 2. NO_DRIVER_FOUND: "No drivers available" with retry
 * 3. FAILED: Dispatch failure with retry
 * 4. ACCEPTED: Show driver info and start tracking
 * 5. ARRIVED/STARTED/COMPLETED: Show trip progress
 */

import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, useRouter } from "expo-router";
import { SPACING, CustomerTheme } from "../../constants/config";
import { useTheme } from "../../hooks/useTheme";
import { useBookingStore } from "../../store/bookingStore";
import { socketService, TripAcceptedData, DriverLocation } from "../../services/socket";
import bookingService from "../../services/booking";

type TripState = 
  | "SEARCHING" 
  | "NO_DRIVER_FOUND" 
  | "FAILED"
  | "ACCEPTED" 
  | "ARRIVED" 
  | "STARTED" 
  | "COMPLETED"
  | "CANCELLED";

export default function TripTrackingScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = createStyles(theme);
  const { currentTrip, isRecoveredRequestedTrip, reset, setCurrentTrip } = useBookingStore();
  
  const [tripState, setTripState] = useState<TripState>("SEARCHING");
  const [driver, setDriver] = useState<TripAcceptedData["driver"] | null>(null);
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const reconcileTrip = useRef<() => Promise<void>>(async () => {});
  const revision = useRef(0);

  useEffect(() => {
    const tripId = currentTrip?.id;
    if (!tripId) return;
    let cancelled = false;
    let reading = false;
    let controller: AbortController | undefined;
    let cancelRead: (() => void) | undefined;
    let lastDispatchCheck = Date.now();
    const reconcile = async () => {
      if (cancelled || reading) return;
      reading = true;
      const startedRevision = revision.current;
      controller = new AbortController();
      const requestController = controller;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const snapshot = await Promise.race([
          bookingService.getTrip(tripId, requestController.signal),
          new Promise<never>((_, reject) => {
            cancelRead = () => { requestController.abort(); reject(new Error("Trip refresh cancelled or timed out")); };
            timeout = setTimeout(cancelRead, 15000);
          }),
        ]);
        const latest = useBookingStore.getState().currentTrip;
        if (cancelled || startedRevision !== revision.current || snapshot?.id !== tripId || latest?.id !== tripId) return;
        // A delayed SEARCHING read must never undo a confirmed assignment.
        if (snapshot.status === "REQUESTED" && latest.status !== "REQUESTED") return;
        setCurrentTrip({ ...latest, status: snapshot.status, dispatchStatus: snapshot.dispatchStatus });
        if (snapshot.status === "REQUESTED") {
          setTripState(snapshot.dispatchStatus === "NO_DRIVER_FOUND" ? "NO_DRIVER_FOUND"
            : snapshot.dispatchStatus === "FAILED" ? "FAILED" : "SEARCHING");
          // Reattach/reclaim only an unfinished search. A live owner rejects the
          // claim; after a process crash the existing database lease permits recovery.
          if ((snapshot.dispatchStatus === "SEARCHING" || snapshot.dispatchStatus == null) && Date.now() - lastDispatchCheck >= 30000) {
            lastDispatchCheck = Date.now();
            socketService.dispatchTrip(tripId);
          }
        } else if (snapshot.status === "ACCEPTED" && snapshot.driver) {
          setDriver({ id: snapshot.driver.id, name: snapshot.driver.user?.name || "Driver",
            phone: snapshot.driver.user?.phone || "", vehicleType: snapshot.driver.vehicleType,
            licensePlate: snapshot.driver.licensePlate });
          setTripState("ACCEPTED");
          socketService.startTracking(tripId);
        } else {
          handleTripStatus({ tripId, status: snapshot.status });
        }
      } catch {
        // A failed read is not a durable dispatch failure. Retry the read.
      } finally {
        if (timeout) clearTimeout(timeout);
        cancelRead = undefined;
        reading = false;
      }
    };
    reconcileTrip.current = reconcile;
    if (isRecoveredRequestedTrip) void reconcile();
    const poll = setInterval(() => {
      if (useBookingStore.getState().currentTrip?.status === "REQUESTED") void reconcile();
    }, 5000);
    return () => { cancelled = true; cancelRead?.(); clearInterval(poll); };
  }, [currentTrip?.id]);


  useEffect(() => {
    if (!currentTrip?.id) {
      return;
    }

    if (currentTrip.status === "REQUESTED") {
      setTripState(
        currentTrip.dispatchStatus === "NO_DRIVER_FOUND"
          ? "NO_DRIVER_FOUND"
          : currentTrip.dispatchStatus === "FAILED"
            ? "FAILED"
            : "SEARCHING"
      );
    }

    let isUnmounted = false;
    let cleanupListeners: (() => void) | undefined;

    initializeTrip().then((cleanup) => {
      if (isUnmounted) {
        cleanup?.();
      } else {
        cleanupListeners = cleanup;
      }
    });

    return () => {
      isUnmounted = true;
      cleanupListeners?.();
      socketService.disconnect();
    };
  }, [currentTrip?.id, isRecoveredRequestedTrip]);

  const initializeTrip = async (): Promise<(() => void) | undefined> => {
    if (!currentTrip?.id) return undefined;

    try {
      // Connect to socket
      await socketService.connect();

      // Set up event listeners
      const unsubTripAccepted = socketService.onTripAccepted(handleTripAccepted);
      const unsubNoDrivers = socketService.onTripNoDrivers(handleNoDrivers);
      const unsubTripFailed = socketService.onTripFailed(handleTripFailed);
      const unsubTripStatus = socketService.onTripStatus(handleTripStatus);
      const unsubDriverLocation = socketService.onDriverLocation(handleDriverLocation);

      if (!isRecoveredRequestedTrip) {
        socketService.dispatchTrip(currentTrip.id);
      }

      return () => {
        unsubTripAccepted();
        unsubNoDrivers();
        unsubTripFailed();
        unsubTripStatus();
        unsubDriverLocation();
      };
    } catch (error) {
      console.error("Failed to initialize trip:", error);
      Alert.alert("Error", "Failed to connect. Please try again.");
      router.back();
      return undefined;
    }
  };

  const handleTripAccepted = (data: TripAcceptedData) => {
    if (data.tripId === currentTrip?.id) void reconcileTrip.current();
  };

  const handleNoDrivers = (data: { tripId: string; message?: string }) => {
    if (data.tripId !== currentTrip?.id) return;
    void reconcileTrip.current();
  };

  const handleTripFailed = (data: { tripId: string; reason: string }) => {
    if (data.tripId !== currentTrip?.id) return;
    void reconcileTrip.current();
  };

  const handleTripStatus = (data: { tripId: string; status: string }) => {
    if (data.tripId !== currentTrip?.id) return;
    console.log("Trip status update:", data);
    
    const statusMap: Record<string, TripState> = {
      ARRIVED: "ARRIVED",
      ACTIVE: "STARTED",
      STARTED: "STARTED",
      COMPLETED: "COMPLETED",
      CANCELLED: "CANCELLED",
    };
    
    const newState = statusMap[data.status];
    if (newState) {
      revision.current++;
      setTripState(newState);
      if (currentTrip) {
        setCurrentTrip({
          ...currentTrip,
          status: data.status,
          ...(data.status === "ACCEPTED" ? { dispatchStatus: null } : {}),
        });
      }
      
      // Navigate to feedback after completion
      if (newState === "COMPLETED" && currentTrip?.id) {
        setTimeout(() => {
          router.replace({
            pathname: "/(main)/feedback",
            params: { tripId: currentTrip.id },
          });
        }, 1000);
      }
      
      // Go home if cancelled
      if (newState === "CANCELLED") {
        setTimeout(() => {
          reset();
          router.replace("/(main)/home");
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
              router.replace("/(main)/home");
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
    revision.current++;
    setTripState("SEARCHING");
    if (currentTrip?.id) {
      setCurrentTrip({ ...currentTrip, dispatchStatus: "SEARCHING" });
      socketService.dispatchTrip(currentTrip.id);
    }
  };

  const handleGoHome = async () => {
    if (!currentTrip?.id) return;

    try {
      await bookingService.cancelTrip(currentTrip.id, "No drivers available");
      reset();
      router.replace("/(main)/home");
    } catch (error) {
      console.error("Failed to cancel trip before leaving:", error);
      Alert.alert("Error", "Failed to cancel trip. Please try again.");
    }
  };

  const handleCallDriver = () => {
    if (driver?.phone) {
      const phoneUrl = `tel:${driver.phone}`;
      Linking.openURL(phoneUrl);
    }
  };

  if (!currentTrip?.id) {
    return <Redirect href="/(main)/home" />;
  }

  // Render based on trip state
  const renderContent = () => {
    switch (tripState) {
      case "SEARCHING":
        return (
          <View style={styles.centerContent}>
            <Text style={styles.statusTitle}>Finding a nearby driver</Text>
            <Text style={styles.statusDescription}>
              We are contacting nearby drivers. This may take a moment on a slow connection.
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
            <Text style={styles.statusTitle}>No driver accepted this trip</Text>
            <Text style={styles.statusDescription}>
              Try the search again or cancel this request and return home.
            </Text>
            <TouchableOpacity style={styles.primaryButton} onPress={handleRetrySearch}>
              <Text style={styles.primaryButtonText}>Search Again</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleGoHome}>
              <Text style={styles.secondaryButtonText}>Cancel Request</Text>
            </TouchableOpacity>
          </View>
        );

      case "FAILED":
        return (
          <View style={styles.centerContent}>
            <Text style={styles.statusTitle}>We couldn't contact drivers</Text>
            <Text style={styles.statusDescription}>
              Check your connection and try the search again.
            </Text>
            <TouchableOpacity style={styles.primaryButton} onPress={handleRetrySearch}>
              <Text style={styles.primaryButtonText}>Search Again</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleGoHome}>
              <Text style={styles.secondaryButtonText}>Cancel Request</Text>
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
              <TouchableOpacity
                style={styles.callButton}
                onPress={handleCallDriver}
                accessibilityRole="button"
                accessibilityLabel="Call driver"
              >
                <Text style={styles.callButtonText}>Call</Text>
              </TouchableOpacity>
            </View>

            {/* Trip Status */}
            <View style={styles.statusCard}>
              {tripState === "ACCEPTED" && (
                <>
                  <Text style={styles.statusTitle}>Driver is on the way</Text>
                  <Text style={styles.statusDescription}>
                    Your driver is heading to your pickup location
                  </Text>
                </>
              )}
              {tripState === "ARRIVED" && (
                <>
                  <Text style={styles.statusTitle}>Driver has arrived</Text>
                  <Text style={styles.statusDescription}>
                    Your driver is waiting at the pickup location
                  </Text>
                </>
              )}
              {tripState === "STARTED" && (
                <>
                  <Text style={styles.statusTitle}>Trip in progress</Text>
                  <Text style={styles.statusDescription}>
                    You're on your way to the destination
                  </Text>
                </>
              )}
            </View>

            {/* Payment Reminder */}
            <View style={styles.paymentReminder}>
              <Text style={styles.reminderTitle}>Payment after trip</Text>
              <Text style={styles.reminderDescription}>
                Agree the fare with your driver and pay directly after the trip.
              </Text>
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
            <Text style={styles.statusTitle}>Trip completed</Text>
            <Text style={styles.statusDescription}>
              Redirecting to feedback...
            </Text>
          </View>
        );

      case "CANCELLED":
        return (
          <View style={styles.centerContent}>
            <Text style={styles.statusTitle}>Trip cancelled</Text>
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
    minHeight: 44,
    paddingHorizontal: SPACING.md,
    borderRadius: 10,
    backgroundColor: theme.success,
    justifyContent: "center",
    alignItems: "center",
  },
  callButtonText: {
    color: theme.textInverse,
    fontSize: 14,
    fontWeight: "600",
  },
  statusCard: {
    backgroundColor: theme.surface,
    padding: SPACING.xl,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: SPACING.lg,
  },
  paymentReminder: {
    backgroundColor: theme.primaryLight,
    padding: SPACING.md,
    borderRadius: 12,
    marginBottom: SPACING.lg,
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
