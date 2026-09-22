/**
 * AllGO Customer Home Screen
 * 
 * Mobile-first, simple design for rural Ghana users
 * Features:
 * - Hero section with clear CTA
 * - Automatic current-location pickup
 * - Simple location inputs
 * - Bottom navigation (not tabs)
 */

import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuthStore } from "../../store";
import { useBookingStore } from "../../store/bookingStore";
import { SPACING, CustomerTheme } from "../../constants/config";
import { useTheme } from "../../hooks/useTheme";
import { getCurrentPickupLocation } from "../../services/location";
import bookingService from "../../services/booking";


export default function HomeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = createStyles(theme);
  const { user } = useAuthStore();
  const {
    pickup,
    destination,
    currentTrip,
    setPickup,
    setCurrentTrip,
    setRecoveredRequestedTrip,
  } = useBookingStore();
  const [pickupLoading, setPickupLoading] = useState(false);
  const [pickupError, setPickupError] = useState<string | null>(null);
  const recoveryAttempted = useRef(false);

  useEffect(() => {
    if (!user || currentTrip || recoveryAttempted.current) {
      return;
    }

    recoveryAttempted.current = true;
    let isMounted = true;

    const recoverActiveTrip = async () => {
      try {
        const recoveredTrip = await bookingService.getActiveTrip();
        if (!isMounted || !recoveredTrip) {
          return;
        }

        setCurrentTrip(recoveredTrip);
        const isRequested = recoveredTrip.status === "REQUESTED";
        setRecoveredRequestedTrip(isRequested);
        router.replace(isRequested ? "/trip-tracking" : "/active-trip");
      } catch (error) {
        console.error("Failed to recover active trip:", error);
      }
    };

    recoverActiveTrip();

    return () => {
      isMounted = false;
    };
  }, [currentTrip, router, setCurrentTrip, setRecoveredRequestedTrip, user]);

  useEffect(() => {
    if (pickup) {
      setPickupError(null);
      setPickupLoading(false);
      return;
    }

    let isMounted = true;

    const loadPickupLocation = async () => {
      setPickupLoading(true);
      setPickupError(null);

      try {
        const currentPickup = await getCurrentPickupLocation();
        if (isMounted) {
          setPickup(currentPickup);
        }
      } catch (error) {
        if (isMounted) {
          setPickupError(error instanceof Error ? error.message : "Unable to detect your location.");
        }
      } finally {
        if (isMounted) {
          setPickupLoading(false);
        }
      }
    };

    loadPickupLocation();

    return () => {
      isMounted = false;
    };
  }, [pickup, setPickup]);

  const handlePickupPress = () => {
    router.push({ pathname: "/location-search", params: { type: "pickup" } });
  };

  const handleDestinationPress = () => {
    router.push({ pathname: "/location-search", params: { type: "destination" } });
  };

  const handleBookRide = () => {
    if (pickup && destination) {
      router.push("/booking-confirm");
    }
  };


  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.logoText}>
          All<Text style={styles.logoAccent}>Go</Text>
        </Text>

        <TouchableOpacity
          style={styles.userAvatar}
          onPress={() => router.push("/profile")}
          accessibilityRole="button"
          accessibilityLabel="Open account"
        >
          <Text style={styles.avatarText}>
            {user?.name?.[0]?.toUpperCase() || "U"}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.scrollView} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <Text style={styles.heroGreeting}>
            Hello, {user?.name?.split(" ")[0] || "there"}
          </Text>
          <Text style={styles.heroTitle}>
            Where do you want to go?
          </Text>
          <Text style={styles.heroSubtitle}>
            Book a ride in seconds
          </Text>
        </View>

        {/* Main Booking Card */}
        <View style={styles.bookingCard}>
          {/* Pickup */}
          <TouchableOpacity
            style={styles.locationRow}
            onPress={handlePickupPress}
            activeOpacity={0.7}
          >
            <View style={styles.locationDot}>
              <View style={styles.dotGreen} />
            </View>
            <View style={styles.locationContent}>
              <Text style={styles.locationLabel}>PICKUP</Text>
              <Text
                style={pickup ? styles.locationValue : styles.locationPlaceholder}
                numberOfLines={1}
              >
                {pickupLoading
                  ? "Getting your current location..."
                  : pickup?.address || "Tap to choose your pickup location"}
              </Text>
              {pickupError && (
                <Text style={styles.locationError}>
                  {pickupError}
                </Text>
              )}
            </View>
          </TouchableOpacity>

          <View style={styles.connectorLine} />

          {/* Destination */}
          <TouchableOpacity 
            style={styles.locationRow} 
            onPress={handleDestinationPress}
            activeOpacity={0.7}
          >
            <View style={styles.locationDot}>
              <View style={styles.dotDestination} />
            </View>
            <View style={styles.locationContent}>
              <Text style={styles.locationLabel}>WHERE TO?</Text>
              <Text 
                style={destination ? styles.locationValue : styles.locationPlaceholder}
                numberOfLines={1}
              >
                {destination?.address || "Tap to choose where you want to go"}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Book Button */}
          <TouchableOpacity
            style={[
              styles.bookButton,
              (!pickup || !destination) && styles.bookButtonDisabled,
            ]}
            onPress={handleBookRide}
            disabled={pickupLoading || !pickup || !destination}
            activeOpacity={0.8}
          >
            <Text style={styles.bookButtonText}>
              {pickupLoading
                ? "Getting Location..."
                : !pickup
                  ? "Set Pickup"
                  : !destination
                    ? "Choose Destination"
                    : "Find a Ride"}
            </Text>
            <Text style={styles.bookButtonArrow}>→</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoBanner}>
          <Text style={styles.infoText}>
            Agree the fare directly with your driver and pay after the trip.
          </Text>
        </View>

        {/* Bottom Padding */}
        <View style={{ height: 100 }} />
      </ScrollView>



    </SafeAreaView>
  );
}

function createStyles(theme: CustomerTheme) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  logoText: {
    fontSize: 22,
    fontWeight: "bold",
    color: theme.text,
  },
  logoAccent: {
    color: theme.primary,
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: theme.textInverse,
    fontSize: 16,
    fontWeight: "bold",
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: SPACING.xl,
  },

  // Hero Section
  heroSection: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  heroGreeting: {
    fontSize: 16,
    color: theme.textSecondary,
    marginBottom: SPACING.xs,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: theme.text,
    marginBottom: SPACING.xs,
  },
  heroSubtitle: {
    fontSize: 16,
    color: theme.textSecondary,
  },

  // Booking Card
  bookingCard: {
    marginHorizontal: SPACING.lg,
    backgroundColor: theme.surface,
    borderRadius: 24,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: theme.border,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 3,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.md,
  },
  locationDot: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  dotGreen: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: theme.primary,
  },
  dotPrimary: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: theme.primary,
  },
  dotDestination: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: theme.primaryDark,
  },
  locationContent: {
    flex: 1,
    marginLeft: SPACING.sm,
  },
  locationLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.textSecondary,
    letterSpacing: 1,
    marginBottom: 2,
  },
  locationValue: {
    fontSize: 16,
    color: theme.text,
    fontWeight: "500",
  },
  locationPlaceholder: {
    fontSize: 16,
    color: theme.textMuted || theme.textSecondary,
  },
  locationError: {
    fontSize: 12,
    color: theme.error,
    marginTop: 4,
  },
  connectorLine: {
    width: 2,
    height: 24,
    backgroundColor: theme.border,
    marginLeft: 15,
  },
  bookButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.primary,
    minHeight: 54,
    paddingVertical: SPACING.md,
    borderRadius: 16,
    marginTop: SPACING.lg,
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 4,
  },
  bookButtonDisabled: {
    backgroundColor: theme.disabled,
  },
  bookButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.textInverse,
  },
  bookButtonArrow: {
    fontSize: 20,
    color: theme.textInverse,
    marginLeft: SPACING.sm,
  },

  section: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.text,
    marginBottom: SPACING.md,
  },
  // Empty State
  emptyState: {
    alignItems: "center",
    paddingVertical: SPACING.xl,
    backgroundColor: theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: SPACING.md,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.text,
  },
  emptyDesc: {
    fontSize: 14,
    color: theme.textSecondary,
    marginTop: SPACING.xs,
  },

  // Info Banner
  infoBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
    backgroundColor: theme.primaryPale,
    borderRadius: 16,
    padding: SPACING.md,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: theme.text,
    lineHeight: 18,
  },



});
}
