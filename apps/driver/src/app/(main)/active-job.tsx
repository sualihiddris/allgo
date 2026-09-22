/**
 * AllGo MVP Active Job Screen
 *
 * Pilot UI refresh:
 * - route and navigation are the primary task
 * - customer contact is secondary
 * - next trip action remains fixed and dominant
 * - night-rides preference does not change app appearance
 */

import { useState, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, Redirect } from "expo-router";
import {
  COLORS,
  SPACING,
  getDriverTheme,
  DriverTheme,
} from "../../constants/config";
import { useJobStore } from "../../store/jobStore";
import tripService from "../../services/trip";
import locationService from "../../services/location";
import socketService from "../../services/socket";
import TripMap from "../../components/TripMap";

const STATUS_CONFIG = {
  ACCEPTED: {
    label: "Heading to pickup",
    helper: "Navigate to the pickup point, then start the trip.",
    nextStatus: "STARTED" as const,
    action: "Start Trip",
    color: COLORS.primary,
  },
  ACTIVE: {
    label: "Trip in progress",
    helper: "Head to the destination and complete the trip when finished.",
    nextStatus: "COMPLETED" as const,
    action: "Complete Trip",
    color: COLORS.success,
  },
};

const DELIVERY_ICONS = {
  FOOD: "🍜",
  GROCERIES: "🛒",
  PARCELS: "📦",
  OTHER: "❓",
};

export default function ActiveJobScreen() {
  const router = useRouter();

  // Night rides are an operational preference, not an appearance setting.
  const theme = getDriverTheme(false);

  const { activeJob, setActiveJob, reset } = useJobStore();
  const [isUpdating, setIsUpdating] = useState(false);
  const [isTrackingLocation, setIsTrackingLocation] = useState(false);

  useEffect(() => {
    let disposed = false;
    let unsubscribeTripCancelled: (() => void) | undefined;

    const synchronizeTrip = async () => {
      try {
        await socketService.connect();

        if (!disposed) {
          unsubscribeTripCancelled = socketService.onTripCancelled((data) => {
            const state = useJobStore.getState();

            if (state.activeJob?.id !== data.tripId) {
              return;
            }

            locationService.stopTracking();
            state.reset();

            Alert.alert(
              "Trip Cancelled",
              data.reason || "The customer cancelled this trip."
            );
          });
        }
      } catch (error) {
        if (!disposed) {
          console.error("Failed to connect cancellation socket:", error);
        }
      }

      try {
        const trips = await tripService.getActiveTrips();

        if (disposed) return;

        const state = useJobStore.getState();
        const currentJob = state.activeJob;

        if (
          currentJob &&
          !trips.some((trip) => trip.id === currentJob.id)
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
          console.error("Failed to reconcile active trip:", error);
        }
      }
    };

    void synchronizeTrip();

    return () => {
      disposed = true;
      unsubscribeTripCancelled?.();
    };
  }, []);

  useEffect(() => {
    if (activeJob) {
      void startLocationTracking();
    }

    return () => {
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

  if (!activeJob) {
    return <Redirect href="/" />;
  }

  const statusConfig =
    STATUS_CONFIG[activeJob.status as keyof typeof STATUS_CONFIG];
  const isDelivery = activeJob.serviceType === "DELIVERY";

  const handleStatusUpdate = async () => {
    if (!statusConfig) return;

    setIsUpdating(true);

    try {
      await tripService.updateTripStatus(
        activeJob.id,
        statusConfig.nextStatus
      );

      if (statusConfig.nextStatus === "COMPLETED") {
        locationService.stopTracking();
        reset();

        Alert.alert(
          "Trip Complete",
          "Trip complete — settle the fare directly with your customer.",
          [{ text: "OK", onPress: () => router.replace("/") }]
        );
      } else if (statusConfig.nextStatus === "STARTED") {
        setActiveJob({
          ...activeJob,
          status: "ACTIVE",
        });
      }
    } catch (error) {
      console.error("Failed to update status:", error);
      Alert.alert(
        "Error",
        "Failed to update trip status. Please try again."
      );
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
        Alert.alert(
          "Error",
          "Cannot make phone calls on this device"
        );
      }
    });
  };

  const handleOpenMaps = () => {
    const target =
      activeJob.status === "ACTIVE"
        ? activeJob.destination
        : activeJob.pickup;

    const mapsUrl =
      `https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}`;

    Linking.openURL(mapsUrl);
  };

  const styles = createStyles(theme);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.statusHeader}>
        <View style={styles.statusCopy}>
          <View style={styles.statusTitleRow}>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor:
                    statusConfig?.color || theme.primary,
                },
              ]}
            />
            <Text style={styles.statusText}>
              {statusConfig?.label || activeJob.status}
            </Text>
          </View>

          <Text style={styles.statusHelper}>
            {statusConfig?.helper}
          </Text>
        </View>

        {isTrackingLocation && (
          <View style={styles.trackingIndicator}>
            <View style={styles.trackingDot} />
            <Text style={styles.trackingText}>LIVE</Text>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {isDelivery && activeJob.deliveryType && (
          <View style={styles.deliveryCard}>
            <Text style={styles.deliveryIcon}>
              {
                DELIVERY_ICONS[
                  activeJob.deliveryType as keyof typeof DELIVERY_ICONS
                ]
              }
            </Text>

            <View style={styles.deliveryInfo}>
              <Text style={styles.sectionLabel}>Delivery</Text>
              <Text style={styles.deliveryType}>
                {activeJob.deliveryType === "OTHER" &&
                activeJob.itemDescription
                  ? activeJob.itemDescription
                  : activeJob.deliveryType}
              </Text>
            </View>
          </View>
        )}

        <TripMap
          pickup={activeJob.pickup}
          destination={activeJob.destination}
          theme={theme}
        />

        <View style={styles.routeCard}>
          <Text style={styles.sectionTitle}>Route</Text>

          <View style={styles.routeItem}>
            <View style={styles.routeDot} />
            <View style={styles.routeInfo}>
              <Text style={styles.routeLabel}>Pickup</Text>
              <Text style={styles.routeAddress}>
                {activeJob.pickup.address}
              </Text>
            </View>
          </View>

          <View style={styles.routeLine} />

          <View style={styles.routeItem}>
            <View
              style={[
                styles.routeDot,
                styles.routeDotDestination,
              ]}
            />
            <View style={styles.routeInfo}>
              <Text style={styles.routeLabel}>Destination</Text>
              <Text style={styles.routeAddress}>
                {activeJob.destination.address}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.mapsButton}
            onPress={handleOpenMaps}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={
              activeJob.status === "ACTIVE"
                ? "Open destination in maps"
                : "Open pickup in maps"
            }
          >
            <Text style={styles.mapsButtonText}>
              {activeJob.status === "ACTIVE"
                ? "Navigate to destination"
                : "Navigate to pickup"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.customerCard}>
          <View style={styles.customerInfo}>
            <Text style={styles.sectionLabel}>Customer</Text>
            <Text style={styles.customerName}>
              {activeJob.customer.name}
            </Text>
            {!!activeJob.customer.phone && (
              <Text style={styles.customerPhone}>
                {activeJob.customer.phone}
              </Text>
            )}
          </View>

          <TouchableOpacity
            style={styles.callButton}
            onPress={handleCallCustomer}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Call customer"
          >
            <Text style={styles.callButtonText}>Call</Text>
          </TouchableOpacity>
        </View>

        {!!activeJob.customerNote && (
          <View style={styles.noteCard}>
            <Text style={styles.sectionLabel}>Customer note</Text>
            <Text style={styles.noteText}>
              {activeJob.customerNote}
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.actionButton,
            {
              backgroundColor:
                statusConfig?.color || theme.primaryDark,
            },
            isUpdating && styles.actionButtonDisabled,
          ]}
          onPress={handleStatusUpdate}
          disabled={isUpdating}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={statusConfig?.action}
        >
          {isUpdating ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.actionText}>
              {statusConfig?.action}
            </Text>
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
      backgroundColor: "#F9FAFB",
    },
    statusHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 16,
      backgroundColor: theme.background,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      gap: SPACING.md,
    },
    statusCopy: {
      flex: 1,
      minWidth: 0,
    },
    statusTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 5,
    },
    statusDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginRight: 9,
    },
    statusText: {
      flexShrink: 1,
      fontSize: 20,
      lineHeight: 26,
      fontWeight: "700",
      color: theme.text,
    },
    statusHelper: {
      fontSize: 13,
      lineHeight: 19,
      color: theme.textSecondary,
    },
    trackingIndicator: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 10,
      minHeight: 30,
      borderRadius: 10,
      backgroundColor: "#ECFDF5",
      borderWidth: 1,
      borderColor: "#D1FAE5",
    },
    trackingDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: theme.success,
      marginRight: 6,
    },
    trackingText: {
      fontSize: 11,
      lineHeight: 15,
      fontWeight: "700",
      letterSpacing: 0.5,
      color: "#047857",
    },
    content: {
      flex: 1,
    },
    contentContainer: {
      padding: 20,
      paddingBottom: 28,
    },
    deliveryCard: {
      flexDirection: "row",
      alignItems: "center",
      padding: SPACING.md,
      borderRadius: 10,
      marginBottom: SPACING.md,
      backgroundColor: theme.warningSoft,
      borderWidth: 1,
      borderColor: "#FDE68A",
      gap: SPACING.md,
    },
    deliveryIcon: {
      fontSize: 30,
    },
    deliveryInfo: {
      flex: 1,
    },
    deliveryType: {
      fontSize: 17,
      lineHeight: 23,
      fontWeight: "600",
      color: theme.text,
    },
    routeCard: {
      backgroundColor: theme.background,
      padding: 18,
      borderRadius: 12,
      marginBottom: SPACING.md,
      borderWidth: 1,
      borderColor: theme.border,
    },
    sectionTitle: {
      fontSize: 15,
      lineHeight: 21,
      fontWeight: "700",
      color: theme.text,
      marginBottom: SPACING.lg,
    },
    routeItem: {
      flexDirection: "row",
      alignItems: "flex-start",
    },
    routeDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: theme.primary,
      marginRight: SPACING.md,
      marginTop: 5,
    },
    routeDotDestination: {
      backgroundColor: theme.success,
    },
    routeInfo: {
      flex: 1,
      minWidth: 0,
    },
    routeLabel: {
      fontSize: 12,
      lineHeight: 17,
      fontWeight: "600",
      color: theme.textSecondary,
      marginBottom: 3,
    },
    routeAddress: {
      fontSize: 16,
      lineHeight: 23,
      color: theme.text,
      flexShrink: 1,
    },
    routeLine: {
      width: 2,
      height: 24,
      backgroundColor: theme.border,
      marginLeft: 5,
      marginVertical: SPACING.xs,
    },
    mapsButton: {
      minHeight: 48,
      marginTop: 18,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#FFF7ED",
      borderWidth: 1,
      borderColor: "#FED7AA",
      paddingHorizontal: SPACING.md,
    },
    mapsButtonText: {
      fontSize: 15,
      lineHeight: 21,
      fontWeight: "700",
      color: theme.primaryDark,
    },
    customerCard: {
      flexDirection: "row",
      alignItems: "center",
      padding: 18,
      borderRadius: 12,
      marginBottom: SPACING.md,
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: theme.border,
      gap: SPACING.md,
    },
    customerInfo: {
      flex: 1,
      minWidth: 0,
    },
    sectionLabel: {
      fontSize: 12,
      lineHeight: 17,
      fontWeight: "600",
      color: theme.textSecondary,
      marginBottom: 4,
    },
    customerName: {
      fontSize: 17,
      lineHeight: 23,
      fontWeight: "600",
      color: theme.text,
    },
    customerPhone: {
      fontSize: 13,
      lineHeight: 19,
      color: theme.textSecondary,
      marginTop: 2,
    },
    callButton: {
      minWidth: 78,
      minHeight: 44,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: SPACING.md,
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: theme.primaryDark,
    },
    callButtonText: {
      fontSize: 15,
      lineHeight: 20,
      fontWeight: "700",
      color: theme.primaryDark,
    },
    noteCard: {
      padding: SPACING.md,
      borderRadius: 10,
      marginBottom: SPACING.md,
      backgroundColor: theme.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.border,
    },
    noteText: {
      fontSize: 14,
      lineHeight: 21,
      color: theme.text,
    },
    footer: {
      paddingHorizontal: 20,
      paddingTop: SPACING.md,
      paddingBottom: 20,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      backgroundColor: theme.background,
    },
    actionButton: {
      minHeight: 56,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: SPACING.lg,
    },
    actionButtonDisabled: {
      opacity: 0.6,
    },
    actionText: {
      fontSize: 17,
      lineHeight: 23,
      fontWeight: "700",
      color: "#FFFFFF",
    },
  });
}
