/**
 * AllGo MVP Driver Home Screen
 *
 * Pilot UI refresh:
 * - explicit online/offline work-state action
 * - lightweight, light-theme-first presentation
 * - night rides kept as an operational preference
 */

import { useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useDriverStore, useJobStore } from "../../store";
import {
  SPACING,
  getDriverTheme,
  DriverTheme,
} from "../../constants/config";
import socketService from "../../services/socket";
import locationService from "../../services/location";
import tripService from "../../services/trip";
import JobOfferModal from "../../components/JobOfferModal";

import { isNightServiceHours } from "@allgo/shared/constants/nightService";

function formatVehicleType(vehicleType?: string): string {
  switch (vehicleType) {
    case "MOTO":
      return "Motorcycle";
    case "KEKE":
      return "Keke / Pragya";
    case "MOTOR_KING":
      return "Aboboya";
    default:
      return "AllGo Driver";
  }
}

export default function HomeScreen() {
  const router = useRouter();
  const {
    user,
    isOnline,
    nightMode,
    isUpdatingOnline,
    isUpdatingNightMode,
    toggleOnline,
    toggleNightMode,
  } = useDriverStore();

  // nightMode is an operational preference, not an appearance preference.
  const theme = getDriverTheme(false);
  const styles = createStyles(theme);

  const {
    currentOffer,
    activeJob,
    isAccepting,
    setCurrentOffer,
    setActiveJob,
    setIsAccepting,
    setIsDeclining,
    clearOffer,
  } = useJobStore();

  useEffect(() => {
    let cancelled = false;
    let unsubscribeTripOffer: (() => void) | undefined;
    let unsubscribeTripConfirmed: (() => void) | undefined;
    let unsubscribeTripAcceptFailed: (() => void) | undefined;
    let unsubscribeTripCancelled: (() => void) | undefined;

    const connectSocket = async () => {
      if (!isOnline) return;

      try {
        // Location tracking must start only after the socket connects.
        await socketService.connect();

        if (cancelled) return;

        unsubscribeTripOffer = socketService.onTripOffer((offer) => {
          console.log("Received trip offer:", offer);
          setCurrentOffer({
            ...offer,
            expiresAt: Date.now() + (offer.timeoutSeconds ?? 30) * 1000,
          });
        });

        unsubscribeTripConfirmed = socketService.onTripConfirmed((data) => {
          console.log("Trip confirmed:", data);
          const offer = useJobStore.getState().currentOffer;
          clearOffer();
          setActiveJob({
            id: data.tripId,
            vehicleType: offer?.vehicleType || "MOTO",
            serviceType: offer?.serviceType || "PASSENGER",
            deliveryType: offer?.deliveryType,
            itemDescription: offer?.itemDescription,
            status: "ACCEPTED",
            pickup: offer?.pickup || { lat: 0, lng: 0, address: "" },
            destination: offer?.destination || { lat: 0, lng: 0, address: "" },
            customer: {
              name: offer?.customerName || "Customer",
              phone: offer?.customerPhone || "",
            },
            customerNote: offer?.customerNote,
          });
        });

        unsubscribeTripAcceptFailed = socketService.onTripAcceptFailed((data) => {
          console.log("Accept failed:", data);
          const activeOffer = useJobStore.getState().currentOffer;

          if (
            data.offerId &&
            activeOffer?.offerId &&
            data.offerId !== activeOffer.offerId
          ) {
            return;
          }

          setIsAccepting(false);
          clearOffer();
          Alert.alert("Error", data.reason || "Failed to accept trip");
        });

        unsubscribeTripCancelled = socketService.onTripCancelled((data) => {
          const state = useJobStore.getState();

          const matchesOffer = state.currentOffer?.tripId === data.tripId;
          const matchesActiveJob = state.activeJob?.id === data.tripId;

          // Ignore cancellation events for stale/other trips.
          if (!matchesOffer && !matchesActiveJob) {
            return;
          }

          console.log("Trip cancelled:", data);

          // Stop location collection before clearing the job. Home and
          // Active Job may both receive this event; either listener must
          // be independently safe to handle cancellation first.
          locationService.stopTracking();
          state.reset();

          Alert.alert(
            "Trip Cancelled",
            data.reason || "The customer cancelled this trip."
          );
        });

        if (!cancelled) {
          await locationService.startTracking();
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to connect socket:", error);
        }
      }
    };

    connectSocket();

    return () => {
      cancelled = true;
      unsubscribeTripOffer?.();
      unsubscribeTripConfirmed?.();
      unsubscribeTripAcceptFailed?.();
      unsubscribeTripCancelled?.();
      locationService.stopTracking();
      socketService.disconnect();
    };
  }, [isOnline]);

  useEffect(() => {
    if (activeJob) {
      router.push("/(main)/active-job");
    }
  }, [activeJob]);

  useEffect(() => {
    if (!user?.driver) return;

    let cancelled = false;

    tripService
      .getActiveTrips()
      .then((trips) => {
        if (
          cancelled ||
          !trips.length ||
          useJobStore.getState().activeJob
        ) {
          return;
        }

        const trip = trips[0];
        clearOffer();
        setActiveJob({
          id: trip.id,
          vehicleType: trip.vehicleType,
          serviceType: trip.serviceType,
          deliveryType: trip.deliveryType,
          itemDescription: trip.itemDescription,
          status: trip.status,
          pickup: trip.pickup,
          destination: trip.destination,
          customer: trip.customer,
          customerNote: trip.customerNote,
        });
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Failed to recover active trip:", error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.driver]);

  const handleToggleOnline = async () => {
    const result = await toggleOnline();
    if (!result.success) {
      Alert.alert("Error", result.message);
    }
  };

  const handleToggleNightMode = async () => {
    const result = await toggleNightMode();

    if (result.success && !nightMode) {
      Alert.alert(
        "Night rides enabled",
        "You'll receive ride requests during night hours (9 PM–5 AM)."
      );
    } else if (!result.success) {
      Alert.alert("Error", result.message);
    }
  };

  const [isNightTime, setIsNightTime] = useState(isNightServiceHours());

  useEffect(() => {
    const interval = setInterval(() => {
      setIsNightTime(isNightServiceHours());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const handleAcceptOffer = () => {
    if (!currentOffer) return;
    setIsAccepting(true);
    socketService.acceptTrip(currentOffer.tripId, currentOffer.offerId);
  };

  const handleDeclineOffer = () => {
    if (!currentOffer) return;
    setIsDeclining(true);
    socketService.declineTrip(currentOffer.tripId, currentOffer.offerId);
    clearOffer();
    setIsDeclining(false);
  };

  const isApproved = !!user?.driver?.isApproved;

  // Section 4A: subscription must be active to go online - mirrors the
  // server-side check in PATCH /driver/online.
  const isSubscriptionActive =
    user?.driver?.subscriptionStatus === "ACTIVE";

  const canChangeOnline =
    !isUpdatingOnline &&
    (isOnline || (isApproved && isSubscriptionActive));

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.brandLabel}>AllGo Driver</Text>
          <Text style={styles.greeting}>
            Hello, {user?.name || "Driver"}
          </Text>
          <Text style={styles.vehicleLabel}>
            {formatVehicleType(user?.driver?.vehicleType)}
          </Text>
        </View>

        {!isApproved && (
          <View style={styles.noticeBanner}>
            <View style={styles.noticeMarker}>
              <Text style={styles.noticeMarkerText}>!</Text>
            </View>
            <View style={styles.noticeInfo}>
              <Text style={styles.noticeTitle}>
                Account pending approval
              </Text>
              <Text style={styles.noticeText}>
                Your account is under review. You'll be notified when approved.
              </Text>
            </View>
          </View>
        )}

        {isApproved && !isSubscriptionActive && (
          <TouchableOpacity
            style={styles.noticeBanner}
            onPress={() => router.push("/(main)/subscription")}
            activeOpacity={0.75}
          >
            <View style={styles.noticeMarker}>
              <Text style={styles.noticeMarkerText}>!</Text>
            </View>
            <View style={styles.noticeInfo}>
              <Text style={styles.noticeTitle}>
                Subscription expired
              </Text>
              <Text style={styles.noticeText}>
                Renew your subscription to go online. Tap to view payment
                instructions.
              </Text>
            </View>
          </TouchableOpacity>
        )}

        <View style={styles.workSection}>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusIndicator,
                isOnline
                  ? styles.statusIndicatorOnline
                  : styles.statusIndicatorOffline,
              ]}
            />
            <Text
              style={[
                styles.statusText,
                isOnline && styles.statusTextOnline,
              ]}
            >
              {isOnline ? "ONLINE" : "OFFLINE"}
            </Text>
          </View>

          {isOnline && (
            <Text style={styles.workTitle}>
              Waiting for a ride request
            </Text>
          )}

          <Text style={styles.workDescription}>
            {isOnline
              ? "We'll notify you when a nearby request arrives."
              : "You're not receiving ride requests."}
          </Text>

          <TouchableOpacity
            style={[
              styles.workButton,
              isOnline && styles.workButtonOnline,
              !canChangeOnline && styles.workButtonDisabled,
            ]}
            onPress={handleToggleOnline}
            disabled={!canChangeOnline}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.workButtonText,
                isOnline && styles.workButtonTextOnline,
                !canChangeOnline && styles.workButtonTextDisabled,
              ]}
            >
              {isUpdatingOnline
                ? "Updating..."
                : isOnline
                  ? "Go Offline"
                  : "Go Online"}
            </Text>
          </TouchableOpacity>
        </View>

        {isApproved && (
          <View style={styles.nightSection}>
            <View style={styles.nightInfo}>
              <View style={styles.nightTitleRow}>
                <Text style={styles.nightTitle}>Night rides</Text>
                {isOnline && nightMode && isNightTime && (
                  <Text style={styles.nightActiveText}>Active now</Text>
                )}
              </View>
              <Text style={styles.nightDescription}>
                {isOnline
                  ? "Receive requests between 9 PM and 5 AM"
                  : "Go online to enable night rides"}
              </Text>
            </View>

            <Switch
              value={isOnline && nightMode}
              onValueChange={handleToggleNightMode}
              trackColor={{
                false: "#D1D5DB",
                true: theme.primaryDark,
              }}
              thumbColor="#FFFFFF"
              disabled={!isOnline || isUpdatingNightMode}
              accessibilityLabel="Night rides"
              accessibilityHint="Receive ride requests during night service hours"
            />
          </View>
        )}
      </ScrollView>

      <JobOfferModal
        visible={!!currentOffer}
        onAccept={handleAcceptOffer}
        onDecline={handleDeclineOffer}
      />
    </SafeAreaView>
  );
}

function createStyles(theme: DriverTheme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: "#F9FAFB",
    },
    scrollView: {
      flex: 1,
    },
    content: {
      paddingBottom: SPACING.xl,
    },
    header: {
      backgroundColor: theme.surface,
      paddingHorizontal: 20,
      paddingTop: SPACING.lg,
      paddingBottom: 20,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    brandLabel: {
      fontSize: 13,
      fontWeight: "700",
      color: theme.primaryDark,
      letterSpacing: 0.5,
      marginBottom: SPACING.sm,
    },
    greeting: {
      fontSize: 26,
      lineHeight: 32,
      fontWeight: "700",
      color: theme.text,
    },
    vehicleLabel: {
      fontSize: 14,
      lineHeight: 20,
      color: theme.textSecondary,
      marginTop: 2,
    },
    noticeBanner: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginHorizontal: 20,
      marginTop: SPACING.lg,
      padding: SPACING.md,
      backgroundColor: theme.warningSoft,
      borderWidth: 1,
      borderColor: "#FDE68A",
      borderRadius: 10,
    },
    noticeMarker: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.warning,
      marginRight: SPACING.md,
    },
    noticeMarkerText: {
      color: "#FFFFFF",
      fontSize: 14,
      lineHeight: 18,
      fontWeight: "700",
    },
    noticeInfo: {
      flex: 1,
    },
    noticeTitle: {
      fontSize: 15,
      lineHeight: 20,
      fontWeight: "600",
      color: theme.text,
      marginBottom: 2,
    },
    noticeText: {
      fontSize: 13,
      lineHeight: 19,
      color: theme.textSecondary,
    },
    workSection: {
      marginTop: 28,
      paddingHorizontal: 20,
    },
    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: SPACING.md,
    },
    statusIndicator: {
      width: 9,
      height: 9,
      borderRadius: 5,
      marginRight: SPACING.sm,
    },
    statusIndicatorOnline: {
      backgroundColor: theme.success,
    },
    statusIndicatorOffline: {
      backgroundColor: theme.textSecondary,
    },
    statusText: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: "700",
      letterSpacing: 0.8,
      color: theme.textSecondary,
    },
    statusTextOnline: {
      color: theme.success,
    },
    workTitle: {
      fontSize: 22,
      lineHeight: 28,
      fontWeight: "700",
      color: theme.text,
      marginBottom: SPACING.xs,
    },
    workDescription: {
      fontSize: 15,
      lineHeight: 22,
      color: theme.textSecondary,
      marginBottom: 22,
    },
    workButton: {
      minHeight: 52,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: SPACING.lg,
      backgroundColor: theme.primaryDark,
      borderWidth: 1,
      borderColor: theme.primaryDark,
    },
    workButtonOnline: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
    },
    workButtonDisabled: {
      backgroundColor: theme.disabled,
      borderColor: theme.disabled,
    },
    workButtonText: {
      fontSize: 16,
      lineHeight: 22,
      fontWeight: "700",
      color: "#FFFFFF",
    },
    workButtonTextOnline: {
      color: theme.text,
    },
    workButtonTextDisabled: {
      color: theme.textSecondary,
    },
    nightSection: {
      flexDirection: "row",
      alignItems: "center",
      marginHorizontal: 20,
      marginTop: 32,
      paddingTop: 20,
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    nightInfo: {
      flex: 1,
      paddingRight: SPACING.md,
    },
    nightTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      marginBottom: 3,
    },
    nightTitle: {
      fontSize: 16,
      lineHeight: 22,
      fontWeight: "600",
      color: theme.text,
    },
    nightActiveText: {
      fontSize: 12,
      lineHeight: 17,
      fontWeight: "600",
      color: theme.success,
      marginLeft: SPACING.sm,
    },
    nightDescription: {
      fontSize: 13,
      lineHeight: 19,
      color: theme.textSecondary,
    },
  });
}
