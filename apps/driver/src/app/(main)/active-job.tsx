/**
 * AllGO MVP Active Job Screen
 * 
 * Shows current trip details with:
 * - Live location tracking (sends updates to customer)
 * - Prominent CALL button
 * - Service type info (MOTO delivery details)
 * - Customer note
 * - NO FARE DISPLAY (payment is external)
 */

import { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Linking, Alert, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, Redirect } from "expo-router";
import { COLORS, SPACING, getDriverTheme, DriverTheme } from "../../constants/config";
import { useJobStore } from "../../store/jobStore";
import { useDriverStore } from "../../store";
import tripService from "../../services/trip";
import locationService from "../../services/location";
import socketService from "../../services/socket";
import TripMap from "../../components/TripMap";

const STATUS_CONFIG = {
  ACCEPTED: { label: "Heading to pickup", nextStatus: "STARTED" as const, action: "Start Trip", color: COLORS.primary },
  ACTIVE: { label: "Trip in progress", nextStatus: "COMPLETED" as const, action: "Complete Trip", color: COLORS.success },
};

const DELIVERY_ICONS = {
  FOOD: "🍜",
  GROCERIES: "🛒",
  PARCELS: "📦",
  OTHER: "❓",
};

export default function ActiveJobScreen() {
  const router = useRouter();
  const { nightMode } = useDriverStore();
  const theme = getDriverTheme(nightMode);
  const { activeJob, setActiveJob, reset } = useJobStore();
  const [isUpdating, setIsUpdating] = useState(false);
  const [isTrackingLocation, setIsTrackingLocation] = useState(false);
  // Cancellation/recovery synchronization.
  //
  // Socket delivery gives immediate convergence while HTTP recovery covers
  // the case where cancellation happened while this device was disconnected.
  useEffect(() => {
    let disposed = false;
    let unsubscribeTripCancelled:
      | (() => void)
      | undefined;

    const synchronizeTrip = async () => {
      try {
        await socketService.connect();

        if (!disposed) {
          unsubscribeTripCancelled =
            socketService.onTripCancelled(
              (data) => {
                const state =
                  useJobStore.getState();

                if (
                  state.activeJob?.id !==
                  data.tripId
                ) {
                  return;
                }

                locationService.stopTracking();
                state.reset();

                Alert.alert(
                  "Trip Cancelled",
                  data.reason ||
                    "The customer cancelled this trip."
                );
              }
            );
        }
      } catch (error) {
        if (!disposed) {
          console.error(
            "Failed to connect cancellation socket:",
            error
          );
        }
      }

      // Socket events are ephemeral. Re-read the authoritative active-trip
      // list so a cancellation that occurred while disconnected cannot leave
      // this screen showing a ghost trip.
      try {
        const trips =
          await tripService.getActiveTrips();

        if (disposed) return;

        const state =
          useJobStore.getState();

        const currentJob =
          state.activeJob;

        if (
          currentJob &&
          !trips.some(
            (trip) =>
              trip.id === currentJob.id
          )
        ) {
          locationService.stopTracking();
          state.reset();

          Alert.alert(
            "Trip Ended",
            "This trip is no longer active."
          );
        }
      } catch (error) {
        if (!disposed) {
          console.error(
            "Failed to reconcile active trip:",
            error
          );
        }
      }
    };

    void synchronizeTrip();

    return () => {
      disposed = true;
      unsubscribeTripCancelled?.();
    };
  }, []);

  // Start location tracking when screen mounts
  useEffect(() => {
    if (activeJob) {
      startLocationTracking();
    }

    return () => {
      // Stop tracking when leaving screen
      locationService.stopTracking();
    };
  }, [activeJob?.id]);

  const startLocationTracking = async () => {
    const started = await locationService.startTracking();
    setIsTrackingLocation(started);
    if (!started) {
      Alert.alert(
        "Location Required",
        "Please enable location services to share your location with the customer.",
        [{ text: "OK" }]
      );
    }
  };

  // Declarative redirect - unlike an imperative router.replace() call, this
  // integrates with the navigator's own readiness state, so it's safe even
  // when this screen is reached directly (deep link/refresh) before the
  // Root Layout has finished mounting. Same pattern already used in
  // app/index.tsx for its auth-state redirects.
  if (!activeJob) {
    return <Redirect href="/" />;
  }

  const statusConfig = STATUS_CONFIG[activeJob.status as keyof typeof STATUS_CONFIG];
  const isDelivery = activeJob.serviceType === "DELIVERY";

  const handleStatusUpdate = async () => {
    if (!statusConfig) return;
    
    setIsUpdating(true);
    try {
      const updatedTrip = await tripService.updateTripStatus(
        activeJob.id,
        statusConfig.nextStatus
      );
      
      if (statusConfig.nextStatus === "COMPLETED") {
        // Stop location tracking
        locationService.stopTracking();
        // Trip completed
        reset();
        Alert.alert("Trip Complete", "Trip complete — settle the fare directly with your customer.", [
          { text: "OK", onPress: () => router.replace("/") }
        ]);
      } else if (statusConfig.nextStatus === "STARTED") {
        // Update status locally - map STARTED to ACTIVE for UI
        setActiveJob({
          ...activeJob,
          status: "ACTIVE",
        });
      }
    } catch (error) {
      console.error("Failed to update status:", error);
      Alert.alert("Error", "Failed to update trip status. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCallCustomer = () => {
    const phoneUrl = `tel:${activeJob.customer.phone}`;
    Linking.canOpenURL(phoneUrl).then((supported) => {
      if (supported) {
        Linking.openURL(phoneUrl);
      } else {
        Alert.alert("Error", "Cannot make phone calls on this device");
      }
    });
  };

  const handleOpenMaps = () => {
    // Before pickup, navigate to the customer; after pickup, navigate to the destination
    const target = activeJob.status === "ACTIVE" ? activeJob.destination : activeJob.pickup;
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}`;
    Linking.openURL(mapsUrl);
  };

  const styles = createStyles(theme);

  return (
    <SafeAreaView style={styles.container}>
      {/* Status Header */}
      <View style={[styles.statusHeader, { backgroundColor: statusConfig?.color || theme.primary }]}>
        <Text style={styles.statusText}>{statusConfig?.label || activeJob.status}</Text>
        {isTrackingLocation && (
          <View style={styles.trackingIndicator}>
            <View style={styles.trackingDot} />
            <Text style={styles.trackingText}>LIVE</Text>
          </View>
        )}
      </View>

      <ScrollView style={styles.content}>
        {/* Delivery Info Card (for MOTO delivery) */}
        {isDelivery && activeJob.deliveryType && (
          <View style={styles.deliveryCard}>
            <Text style={styles.deliveryIcon}>
              {DELIVERY_ICONS[activeJob.deliveryType as keyof typeof DELIVERY_ICONS]}
            </Text>
            <View style={styles.deliveryInfo}>
              <Text style={styles.deliveryLabel}>Delivering</Text>
              <Text style={styles.deliveryType}>
                {activeJob.deliveryType === "OTHER" && activeJob.itemDescription
                  ? activeJob.itemDescription
                  : activeJob.deliveryType}
              </Text>
            </View>
          </View>
        )}

        {/* Prominent Call Button */}
        <TouchableOpacity style={styles.callCard} onPress={handleCallCustomer}>
          <View style={styles.callIconCircle}>
            <Text style={styles.callIconLarge}>📞</Text>
          </View>
          <View style={styles.callInfo}>
            <Text style={styles.callLabel}>Call Customer</Text>
            <Text style={styles.customerName}>{activeJob.customer.name}</Text>
            <Text style={styles.customerPhone}>{activeJob.customer.phone}</Text>
          </View>
          <Text style={styles.callChevron}>›</Text>
        </TouchableOpacity>

        {/* Customer Note */}
        {activeJob.customerNote && (
          <View style={styles.noteCard}>
            <Text style={styles.noteLabel}>📝 Customer Note:</Text>
            <Text style={styles.noteText}>{activeJob.customerNote}</Text>
          </View>
        )}

        {/* Map */}
        <TripMap pickup={activeJob.pickup} destination={activeJob.destination} theme={theme} />

        {/* Route Info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Route</Text>

          <View style={styles.routeItem}>
            <View style={styles.routeDot} />
            <View style={styles.routeInfo}>
              <Text style={styles.routeLabel}>Pickup</Text>
              <Text style={styles.routeAddress}>{activeJob.pickup.address}</Text>
            </View>
          </View>
          
          <View style={styles.routeLine} />
          
          <View style={styles.routeItem}>
            <View style={[styles.routeDot, styles.routeDotDestination]} />
            <View style={styles.routeInfo}>
              <Text style={styles.routeLabel}>Destination</Text>
              <Text style={styles.routeAddress}>{activeJob.destination.address}</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.mapsButton} onPress={handleOpenMaps}>
            <Text style={styles.mapsButtonText}>🗺️ Open in Maps</Text>
          </TouchableOpacity>
        </View>

        {/* Payment Reminder */}
        <View style={styles.paymentCard}>
          <Text style={styles.paymentIcon}>💬</Text>
          <Text style={styles.paymentText}>Negotiate fare directly with customer</Text>
        </View>
      </ScrollView>

      {/* Action Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: statusConfig?.color || theme.primary }, isUpdating && styles.actionButtonDisabled]}
          onPress={handleStatusUpdate}
          disabled={isUpdating}
        >
          {isUpdating ? (
            <ActivityIndicator color={COLORS.textInverse} />
          ) : (
            <Text style={styles.actionText}>{statusConfig?.action}</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function createStyles(theme: DriverTheme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    statusHeader: {
      paddingVertical: SPACING.md,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      gap: SPACING.sm,
    },
    statusText: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.textInverse,
    },
    trackingIndicator: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.overlaySoft,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      marginLeft: SPACING.sm,
    },
    trackingDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.error,
      marginRight: 6,
    },
    trackingText: {
      color: theme.textInverse,
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 1,
    },
    content: {
      flex: 1,
      padding: SPACING.lg,
    },
    deliveryCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.warningSoft,
      padding: SPACING.md,
      borderRadius: 12,
      marginBottom: SPACING.md,
      gap: SPACING.md,
      borderWidth: 1,
      borderColor: theme.border,
    },
    deliveryIcon: {
      fontSize: 40,
    },
    deliveryInfo: {
      flex: 1,
    },
    deliveryLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: theme.textSecondary,
    },
    deliveryType: {
      fontSize: 18,
      fontWeight: "600",
      color: theme.text,
    },
    callCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.primary,
      padding: SPACING.lg,
      borderRadius: 20,
      marginBottom: SPACING.md,
      shadowColor: theme.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 16,
      elevation: 5,
    },
    callIconCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: theme.background,
      alignItems: "center",
      justifyContent: "center",
      marginRight: SPACING.md,
    },
    callIconLarge: {
      fontSize: 32,
    },
    callInfo: {
      flex: 1,
    },
    callLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: theme.textInverse,
      opacity: 0.9,
      marginBottom: 4,
    },
    customerName: {
      fontSize: 20,
      fontWeight: "600",
      color: theme.textInverse,
    },
    customerPhone: {
      fontSize: 14,
      color: theme.textInverse,
      opacity: 0.9,
      marginTop: 2,
    },
    callChevron: {
      fontSize: 32,
      color: theme.textInverse,
      fontWeight: "bold",
    },
    noteCard: {
      backgroundColor: theme.primaryPale,
      padding: SPACING.md,
      borderRadius: 16,
      marginBottom: SPACING.md,
    },
    noteLabel: {
      fontSize: 14,
      fontWeight: "600",
      color: theme.text,
      marginBottom: SPACING.xs,
    },
    noteText: {
      fontSize: 14,
      color: theme.text,
      lineHeight: 20,
    },
    card: {
      backgroundColor: theme.surface,
      padding: SPACING.lg,
      borderRadius: 18,
      marginBottom: SPACING.md,
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: "#0F172A",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.04,
      shadowRadius: 16,
      elevation: 1,
    },
    cardTitle: {
      fontSize: 14,
      fontWeight: "600",
      color: theme.textSecondary,
      marginBottom: SPACING.md,
    },
    routeItem: {
      flexDirection: "row",
      alignItems: "flex-start",
    },
    routeDot: {
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: theme.primary,
      marginRight: SPACING.md,
      marginTop: 4,
    },
    routeDotDestination: {
      backgroundColor: theme.success,
    },
    routeInfo: {
      flex: 1,
    },
    routeLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: theme.textSecondary,
      marginBottom: 2,
    },
    routeAddress: {
      fontSize: 16,
      color: theme.text,
    },
    routeLine: {
      width: 2,
      height: 24,
      backgroundColor: theme.border,
      marginLeft: 7,
      marginVertical: SPACING.sm,
    },
    mapsButton: {
      marginTop: SPACING.md,
      paddingVertical: SPACING.md,
      borderRadius: 14,
      alignItems: "center",
      backgroundColor: theme.primaryPale,
    },
    mapsButtonText: {
      fontSize: 14,
      fontWeight: "600",
      color: theme.primaryDark,
    },
    paymentCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.surfaceLight,
      padding: SPACING.md,
      borderRadius: 16,
      gap: SPACING.sm,
    },
    paymentIcon: {
      fontSize: 20,
    },
    paymentText: {
      fontSize: 14,
      color: theme.textSecondary,
      fontStyle: "italic",
    },
    footer: {
      padding: SPACING.lg,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      backgroundColor: theme.background,
    },
    actionButton: {
      paddingVertical: SPACING.md,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 56,
      shadowColor: theme.deep,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 5,
    },
    actionButtonDisabled: {
      opacity: 0.6,
    },
    actionText: {
      fontSize: 18,
      fontWeight: "700",
      color: theme.textInverse,
    },
  });
}
