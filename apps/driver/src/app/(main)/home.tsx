/**
 * AllGO MVP Driver Home Screen
 * 
 * Simplified: Rides only, online toggle, no earnings/ratings
 * Section 20: Night mode toggle for night service opt-in
 */

import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Switch, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useDriverStore, useJobStore } from "../../store";
import { COLORS, SPACING, getDriverTheme, DriverTheme } from "../../constants/config";
import socketService from "../../services/socket";
import locationService from "../../services/location";
import JobOfferModal from "../../components/JobOfferModal";

import { isNightServiceHours } from "@allgo/shared/constants/nightService";

export default function HomeScreen() {
  const router = useRouter();
  const { user, isOnline, nightMode, isUpdatingOnline, isUpdatingNightMode, toggleOnline, toggleNightMode } = useDriverStore();
  const theme = getDriverTheme(nightMode);
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
          setIsAccepting(false);
          clearOffer();
          Alert.alert("Error", data.reason || "Failed to accept trip");
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
      locationService.stopTracking();
      socketService.disconnect();
    };
  }, [isOnline]);

  useEffect(() => {
    if (activeJob) {
      router.push("/(main)/active-job");
    }
  }, [activeJob]);

  const handleToggleOnline = async () => {
    const result = await toggleOnline();
    if (!result.success) {
      Alert.alert("Error", result.message);
    }
  };

  // Section 20: Handle night mode toggle
  const handleToggleNightMode = async () => {
    const result = await toggleNightMode();
    
    if (result.success && !nightMode) {
      // Night mode was just enabled
      Alert.alert(
        "Night Mode Enabled",
        "You'll receive ride requests during night hours (9pm-5am). Night rides may have different pricing agreed with customers.",
        [{ text: "OK" }]
      );
    } else if (!result.success) {
      Alert.alert("Error", result.message);
    }
  };

  // Section 20: Check if it's currently night hours
  const [isNightTime, setIsNightTime] = useState(isNightServiceHours());
  
  useEffect(() => {
    const interval = setInterval(() => {
      setIsNightTime(isNightServiceHours());
    }, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  const handleAcceptOffer = () => {
    if (!currentOffer) return;
    setIsAccepting(true);
    socketService.acceptTrip(currentOffer.tripId);
  };

  const handleDeclineOffer = () => {
    if (!currentOffer) return;
    setIsDeclining(true);
    socketService.declineTrip(currentOffer.tripId);
    clearOffer();
    setIsDeclining(false);
  };

  const isApproved = !!user?.driver?.isApproved;
  // Section 4A: subscription must be active to go online - mirrors the
  // server-side check in PATCH /driver/online so the toggle never looks
  // tappable when it would just be rejected
  const isSubscriptionActive = user?.driver?.subscriptionStatus === "ACTIVE";

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello, {user?.name || "Rider"}</Text>
          <Text style={styles.subtitle}>
            {user?.driver?.vehicleType || "AllGO Rider"}
          </Text>
        </View>
        <View style={styles.statusDot}>
          <Text style={styles.statusEmoji}>{isOnline ? "🟢" : "⚫"}</Text>
        </View>
      </View>

      {/* Online Toggle */}
      <View style={styles.toggleCard}>
        <View style={styles.toggleInfo}>
          <Text style={styles.toggleTitle}>Go Online</Text>
          <Text style={styles.toggleSubtitle}>
            {isOnline ? "You're receiving ride requests" : "Toggle on to start receiving requests"}
          </Text>
        </View>
        <Switch
          value={isOnline}
          onValueChange={handleToggleOnline}
          trackColor={{ false: COLORS.border, true: COLORS.success }}
          thumbColor={COLORS.textInverse}
          disabled={!isApproved || !isSubscriptionActive || isUpdatingOnline}
        />
      </View>

      {/* Section 20: Night Mode Toggle */}
      {isApproved && (
        <View style={[styles.toggleCard, nightMode && styles.nightModeCard]}>
          <View style={styles.toggleInfo}>
            <View style={styles.nightModeHeader}>
              <Text style={styles.toggleTitle}>
                🌙 Night Mode {isNightTime && <Text style={styles.nightActiveLabel}>(Active Now)</Text>}
              </Text>
            </View>
            <Text style={styles.toggleSubtitle}>
              {nightMode 
                ? "You'll receive requests 9pm-5am" 
                : "Enable to work during night hours"}
            </Text>
          </View>
          <Switch
            value={nightMode}
            onValueChange={handleToggleNightMode}
            trackColor={{ false: COLORS.border, true: COLORS.primaryDark }}
            thumbColor={COLORS.textInverse}
            disabled={isUpdatingNightMode}
          />
        </View>
      )}

      {/* Night Service Banner (show during night hours) */}
      {isNightTime && isOnline && nightMode && isApproved && (
        <View style={styles.nightBanner}>
          <Text style={styles.nightBannerIcon}>🌙</Text>
          <View style={styles.nightBannerInfo}>
            <Text style={styles.nightBannerTitle}>Night Service Active</Text>
            <Text style={styles.nightBannerText}>
              Extended search radius • 45s response time • Premium rates apply
            </Text>
          </View>
        </View>
      )}

      {/* Verification Status */}
      {!isApproved && (
        <View style={styles.verificationBanner}>
          <Text style={styles.verificationIcon}>⚠️</Text>
          <View style={styles.verificationInfo}>
            <Text style={styles.verificationTitle}>Account Pending Approval</Text>
            <Text style={styles.verificationText}>
              Your account is under review. You'll be notified when approved.
            </Text>
          </View>
        </View>
      )}

      {/* Section 4A: Subscription Expired Banner */}
      {isApproved && !isSubscriptionActive && (
        <TouchableOpacity
          style={styles.verificationBanner}
          onPress={() => router.push("/(main)/subscription")}
        >
          <Text style={styles.verificationIcon}>💳</Text>
          <View style={styles.verificationInfo}>
            <Text style={styles.verificationTitle}>Subscription Expired</Text>
            <Text style={styles.verificationText}>
              Renew your subscription to go online. Tap to view payment instructions.
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Waiting State */}
      {isOnline && !activeJob && isApproved && (
        <View style={styles.waitingState}>
          <Text style={styles.waitingIcon}>🔍</Text>
          <Text style={styles.waitingText}>Looking for ride requests...</Text>
          <Text style={styles.waitingSubtext}>
            Stay online to receive requests nearby
          </Text>
        </View>
      )}

      {/* Info Cards */}
      {isApproved && (
        <View style={styles.infoSection}>
          <View style={styles.infoCard}>
            <Text style={styles.infoIcon}>📍</Text>
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>Your Location</Text>
              <Text style={styles.infoText}>
                Make sure location services are enabled
              </Text>
            </View>
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.infoIcon}>📞</Text>
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>Communication</Text>
              <Text style={styles.infoText}>
                You'll call customers directly for each trip
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Job Offer Modal */}
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
      backgroundColor: theme.background,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: SPACING.lg,
      backgroundColor: theme.surface,
    },
    greeting: {
      fontSize: 24,
      fontWeight: "bold",
      color: theme.text,
    },
    subtitle: {
      fontSize: 14,
      color: theme.textSecondary,
      marginTop: 4,
    },
    statusDot: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: theme.background,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.border,
    },
    statusEmoji: {
      fontSize: 24,
    },
    toggleCard: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: theme.surface,
      margin: SPACING.lg,
      padding: SPACING.lg,
      borderRadius: 18,
      shadowColor: "#0F172A",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.06,
      shadowRadius: 24,
      elevation: 3,
      borderWidth: 1,
      borderColor: theme.border,
    },
    toggleInfo: {
      flex: 1,
    },
    toggleTitle: {
      fontSize: 18,
      fontWeight: "600",
      color: theme.text,
      marginBottom: 4,
    },
    toggleSubtitle: {
      fontSize: 13,
      color: theme.textSecondary,
    },
    verificationBanner: {
      flexDirection: "row",
      backgroundColor: theme.warningSoft,
      margin: SPACING.lg,
      marginTop: 0,
      padding: SPACING.md,
      borderRadius: 16,
    },
    verificationIcon: {
      fontSize: 24,
      marginRight: SPACING.md,
    },
    verificationInfo: {
      flex: 1,
    },
    verificationTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.text,
      marginBottom: 4,
    },
    verificationText: {
      fontSize: 13,
      color: theme.textSecondary,
    },
    waitingState: {
      alignItems: "center",
      justifyContent: "center",
      padding: SPACING.xl,
      marginTop: SPACING.xl,
    },
    waitingIcon: {
      fontSize: 64,
      marginBottom: SPACING.md,
    },
    waitingText: {
      fontSize: 18,
      fontWeight: "600",
      color: theme.text,
      marginBottom: SPACING.xs,
    },
    waitingSubtext: {
      fontSize: 14,
      color: theme.textSecondary,
      textAlign: "center",
    },
    infoSection: {
      padding: SPACING.lg,
      gap: SPACING.md,
    },
    infoCard: {
      flexDirection: "row",
      backgroundColor: theme.surface,
      padding: SPACING.md,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      shadowColor: "#0F172A",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.04,
      shadowRadius: 16,
      elevation: 1,
    },
    infoIcon: {
      fontSize: 32,
      marginRight: SPACING.md,
    },
    infoContent: {
      flex: 1,
    },
    infoTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.text,
      marginBottom: 4,
    },
    infoText: {
      fontSize: 13,
      color: theme.textSecondary,
    },
    // Section 20: Night mode styles
    nightModeCard: {
      marginTop: 0,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.primaryLight,
    },
    nightModeHeader: {
      flexDirection: "row",
      alignItems: "center",
    },
    nightActiveLabel: {
      fontSize: 12,
      color: theme.primaryDark,
      fontWeight: "500",
    },
    nightBanner: {
      flexDirection: "row",
      backgroundColor: theme.primaryPale,
      margin: SPACING.lg,
      marginTop: 0,
      padding: SPACING.md,
      borderRadius: 16,
    },
    nightBannerIcon: {
      fontSize: 28,
      marginRight: SPACING.md,
      color: theme.primaryDark,
    },
    nightBannerInfo: {
      flex: 1,
    },
    nightBannerTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.text,
      marginBottom: 4,
    },
    nightBannerText: {
      fontSize: 12,
      color: theme.textSecondary,
    },
  });
}
