/**
 * AllGO Active Trip Screen
 * 
 * Shows:
 * - Live driver location on map
 * - Trip status (arriving, in_progress, etc.)
 * - Driver info with call button
 * - Trip details
 */

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
  ActivityIndicator,
  Share,
  Alert,
} from "react-native";
import { useRouter, Redirect } from "expo-router";
import { useBookingStore } from "../../store/bookingStore";
import bookingService from "../../services/booking";
import { socketService, DriverLocation } from "../../services/socket";
import { CustomerTheme } from "../../constants/config";
import { useTheme } from "../../hooks/useTheme";
import TripMap from "../../components/TripMap";

function getStatusLabels(theme: CustomerTheme): Record<string, { label: string; color: string }> {
  return {
    REQUESTED: { label: "Finding driver...", color: theme.warning },
    ACCEPTED: { label: "Driver assigned", color: theme.primary },
    ARRIVING: { label: "Driver is on the way", color: theme.primary },
    ACTIVE: { label: "Trip in progress", color: theme.success },
    IN_PROGRESS: { label: "Trip in progress", color: theme.success },
    COMPLETED: { label: "Trip completed", color: theme.success },
    CANCELLED: { label: "Trip cancelled", color: theme.danger },
  };
}

export default function ActiveTripScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = createStyles(theme);
  const STATUS_LABELS = getStatusLabels(theme);
  const { currentTrip, reset, setCurrentTrip } = useBookingStore();
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    // No currentTrip is handled declaratively via <Redirect> in the render
    // body below - navigating imperatively here (router.replace) raced
    // against the Root Layout's own mount, intermittently crashing with
    // "Attempted to navigate before mounting the Root Layout component."
    if (!currentTrip) {
      return;
    }

    let isUnmounted = false;
    let cleanupListeners: (() => void) | undefined;

    initializeTracking().then((cleanup) => {
      if (isUnmounted) {
        cleanup?.();
      } else {
        cleanupListeners = cleanup;
      }
    });

    return () => {
      isUnmounted = true;
      cleanupListeners?.();
      socketService.stopTracking(currentTrip.id);
    };
  }, [currentTrip?.id]);

  const initializeTracking = async (): Promise<(() => void) | undefined> => {
    if (!currentTrip) return undefined;

    setIsConnecting(true);
    
    try {
      await socketService.connect();

      // Start tracking
      socketService.startTracking(currentTrip.id);

      // Listen for driver location updates
      const unsubLocation = socketService.onDriverLocation((location) => {
        setDriverLocation(location);
        setLastUpdate(new Date());
        setIsConnecting(false);
      });

      // Listen for trip status updates
      const unsubStatus = socketService.onTripStatus((data) => {
        if (data.tripId === currentTrip.id) {
          setCurrentTrip({
            ...currentTrip,
            status: data.status,
          });

          // Navigate to feedback on completion
          if (data.status === "COMPLETED") {
            router.replace("/(main)/feedback");
          }
        }
      });

      // Listen for tracking started
      const unsubTrackingStarted = socketService.onTrackingStarted((data) => {
        if (data.currentLocation) {
          setDriverLocation(data.currentLocation);
        }
        setIsConnecting(false);
      });

      // Timeout for connecting
      setTimeout(() => setIsConnecting(false), 5000);

      return () => {
        unsubLocation();
        unsubStatus();
        unsubTrackingStarted();
      };
    } catch (error) {
      console.error("Error initializing tracking:", error);
      setIsConnecting(false);
      return undefined;
    }
  };

  const handleCallDriver = () => {
    if (currentTrip?.driver?.phone) {
      const phoneUrl = Platform.OS === "ios" 
        ? `tel:${currentTrip.driver.phone}`
        : `tel:${currentTrip.driver.phone}`;
      Linking.openURL(phoneUrl);
    }
  };

  const handleCancelTrip = async () => {
    if (!currentTrip || currentTrip.status === "ACTIVE") {
      return;
    }

    try {
      await bookingService.cancelTrip(currentTrip.id, "Customer cancelled");
      reset();
      router.replace("/(main)/home");
    } catch (error) {
      console.error("Failed to cancel trip:", error);
      Alert.alert("Error", "Failed to cancel trip. Please try again.");
    }
  };

  // Section 20: Share Trip for safety
  const handleShareTrip = async () => {
    if (!currentTrip || !currentTrip.driver) {
      Alert.alert("Cannot Share", "Driver information not available yet.");
      return;
    }

    const message = `I'm on a AllGo trip!\n\n` +
      `Driver: ${currentTrip.driver.name}\n` +
      `Phone: ${currentTrip.driver.phone}\n` +
      `Vehicle: ${currentTrip.vehicleType}\n` +
      `Plate: ${currentTrip.driver.vehiclePlate || "N/A"}\n\n` +
      `From: ${currentTrip.pickup?.address || "N/A"}\n` +
      `To: ${currentTrip.destination?.address || "N/A"}\n\n` +
      `Shared via AllGo App`;

    try {
      await Share.share({
        message,
        title: "My AllGo Trip",
      });
    } catch (error) {
      console.error("Failed to share trip:", error);
      Alert.alert("Share Failed", "Could not share trip details.");
    }
  };

  if (!currentTrip) {
    return <Redirect href="/(main)/home" />;
  }

  const statusInfo = STATUS_LABELS[currentTrip.status] || STATUS_LABELS.REQUESTED;

  return (
    <View style={styles.container}>
      {/* Map */}
      <TripMap
        driverLocation={driverLocation}
        pickup={currentTrip.pickup ? { lat: currentTrip.pickup.lat, lng: currentTrip.pickup.lng, address: currentTrip.pickup.address } : null}
        destination={currentTrip.destination ? { lat: currentTrip.destination.lat, lng: currentTrip.destination.lng, address: currentTrip.destination.address } : null}
      />

      {/* Trip Info Card */}
      <View style={styles.infoCard}>
        {/* Status */}
        <View style={[styles.statusBadge, { backgroundColor: statusInfo.color }]}>
          <Text style={styles.statusText}>{statusInfo.label}</Text>
        </View>

        {/* Connection status */}
        {isConnecting && (
          <View style={styles.connectingRow}>
            <ActivityIndicator size="small" color={theme.primary} />
            <Text style={styles.connectingText}>Connecting to live tracking...</Text>
          </View>
        )}

        {/* Last update time */}
        {lastUpdate && !isConnecting && (
          <Text style={styles.lastUpdate}>
            📍 Last update: {lastUpdate.toLocaleTimeString()}
          </Text>
        )}

        {/* Driver info */}
        {currentTrip.driver && (
          <View style={styles.driverCard}>
            <View style={styles.driverAvatar}>
              <Text style={styles.driverAvatarText}>
                {currentTrip.driver.name?.[0]?.toUpperCase() || "D"}
              </Text>
            </View>
            <View style={styles.driverInfo}>
              <Text style={styles.driverName}>{currentTrip.driver.name}</Text>
              <Text style={styles.vehiclePlate}>{currentTrip.driver.vehiclePlate}</Text>
            </View>
            <TouchableOpacity style={styles.callButton} onPress={handleCallDriver}>
              <Text style={styles.callButtonText}>📞 Call</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Section 20: Share Trip Button for Safety */}
        {currentTrip.driver && (
          <TouchableOpacity style={styles.shareButton} onPress={handleShareTrip}>
            <Text style={styles.shareButtonIcon}>📤</Text>
            <Text style={styles.shareButtonText}>Share Trip Details</Text>
            <Text style={styles.shareButtonHint}>Send to a trusted contact</Text>
          </TouchableOpacity>
        )}

        {/* Trip details */}
        <View style={styles.tripDetails}>
          <View style={styles.locationRow}>
            <View style={[styles.locationDot, { backgroundColor: theme.success }]} />
            <Text style={styles.locationText} numberOfLines={1}>
              {currentTrip.pickup?.address || "Pickup location"}
            </Text>
          </View>
          <View style={styles.locationLine} />
          <View style={styles.locationRow}>
            <View style={[styles.locationDot, { backgroundColor: theme.danger }]} />
            <Text style={styles.locationText} numberOfLines={1}>
              {currentTrip.destination?.address || "Destination"}
            </Text>
          </View>
        </View>

        {/* Vehicle & Service type */}
        <View style={styles.typeRow}>
          <View style={styles.typeBadge}>
            <Text style={styles.typeText}>{currentTrip.vehicleType}</Text>
          </View>
          {currentTrip.serviceType === "DELIVERY" && (
            <View style={[styles.typeBadge, { backgroundColor: theme.warning }]}>
              <Text style={styles.typeText}>📦 {currentTrip.deliveryType}</Text>
            </View>
          )}
        </View>

        {/* Payment reminder */}
        <View style={styles.paymentReminder}>
          <Text style={styles.paymentReminderText}>
            💵 Remember to negotiate fare with driver
          </Text>
        </View>

        {/* Cancel button (only show if not in progress) */}
        {currentTrip.status !== "ACTIVE" && currentTrip.status !== "IN_PROGRESS" && currentTrip.status !== "COMPLETED" && (
          <TouchableOpacity style={styles.cancelButton} onPress={handleCancelTrip}>
            <Text style={styles.cancelButtonText}>Cancel Trip</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function createStyles(theme: CustomerTheme) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  infoCard: {
    backgroundColor: theme.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    shadowColor: theme.deep,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
    marginTop: -20,
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 16,
  },
  statusText: {
    color: theme.textInverse,
    fontWeight: "600",
    fontSize: 14,
  },
  connectingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  connectingText: {
    marginLeft: 8,
    color: theme.textSecondary,
    fontSize: 13,
  },
  lastUpdate: {
    color: theme.textSecondary,
    fontSize: 12,
    marginBottom: 12,
  },
  driverCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.surfaceMuted,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  driverAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  driverAvatarText: {
    color: theme.textInverse,
    fontSize: 20,
    fontWeight: "700",
  },
  driverInfo: {
    flex: 1,
    marginLeft: 12,
  },
  driverName: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.text,
  },
  vehiclePlate: {
    fontSize: 13,
    color: theme.textSecondary,
    marginTop: 2,
  },
  callButton: {
    backgroundColor: theme.success,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  callButtonText: {
    color: theme.textInverse,
    fontWeight: "600",
    fontSize: 14,
  },
  tripDetails: {
    marginBottom: 16,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  locationDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  locationText: {
    flex: 1,
    fontSize: 14,
    color: theme.text,
  },
  locationLine: {
    width: 2,
    height: 20,
    backgroundColor: theme.border,
    marginLeft: 5,
    marginVertical: 4,
  },
  typeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  typeBadge: {
    backgroundColor: theme.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  typeText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.text,
  },
  paymentReminder: {
    backgroundColor: theme.warningSoft,
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  paymentReminderText: {
    color: theme.primaryDark,
    fontSize: 13,
    textAlign: "center",
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: theme.error,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelButtonText: {
    color: theme.error,
    fontWeight: "600",
    fontSize: 15,
  },
  // Section 20: Share Trip button styles
  shareButton: {
    backgroundColor: theme.primaryPale,
    borderWidth: 1,
    borderColor: theme.primary,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  shareButtonIcon: {
    fontSize: 20,
  },
  shareButtonText: {
    color: theme.primaryDark,
    fontWeight: "600",
    fontSize: 15,
  },
  shareButtonHint: {
    color: theme.primaryDark,
    fontSize: 11,
    opacity: 0.7,
  },
});
}
