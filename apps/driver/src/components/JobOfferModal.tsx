import { useState, useEffect, useRef } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { COLORS, SPACING } from "../constants/config";
import { useJobStore } from "../store/jobStore";

interface JobOfferModalProps {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

import { isNightServiceHours } from "@allgo/shared/constants/nightService";

// Icons for service types and delivery types
const SERVICE_ICONS = {
  PASSENGER: "🧑",
  DELIVERY: "📦",
};

const DELIVERY_ICONS = {
  FOOD: "🍜",
  GROCERIES: "🛒",
  PARCELS: "📦",
  OTHER: "❓",
};

const VEHICLE_ICONS = {
  MOTO: "🏍️",
  KEKE: "🛺",
  MOTOR_KING: "🛻",
};

export default function JobOfferModal({ visible, onAccept, onDecline }: JobOfferModalProps) {
  const { currentOffer, isAccepting, isDeclining } = useJobStore();
  
  // Section 20: Dynamic timeout - 45s for night, 30s for day
  const countdownDuration = isNightServiceHours() ? 45 : 30;
  const [countdown, setCountdown] = useState(countdownDuration);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef(countdownDuration);
  const autoDeclinedRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const duration = isNightServiceHours() ? 45 : 30;
    countdownRef.current = duration;
    autoDeclinedRef.current = false;
    setCountdown(duration);

    intervalRef.current = setInterval(() => {
      countdownRef.current = Math.max(0, countdownRef.current - 1);
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [visible]);

  useEffect(() => {
    if (visible && countdown === 0 && !autoDeclinedRef.current) {
      autoDeclinedRef.current = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      onDecline();
    }
  }, [countdown, visible, onDecline]);

  if (!currentOffer) return null;

  const formatDistance = (meters: number) => {
    const km = (meters / 1000).toFixed(1);
    return `${km} km`;
  };

  // Determine if this is a delivery
  const isDelivery = currentOffer.serviceType === "DELIVERY";
  const vehicleIcon = VEHICLE_ICONS[currentOffer.vehicleType as keyof typeof VEHICLE_ICONS] || "🚗";
  const serviceIcon = SERVICE_ICONS[currentOffer.serviceType as keyof typeof SERVICE_ICONS] || "🧑";
  const deliveryIcon = currentOffer.deliveryType 
    ? DELIVERY_ICONS[currentOffer.deliveryType as keyof typeof DELIVERY_ICONS] 
    : null;

  // Build title
  const getTitle = () => {
    if (isDelivery) {
      return `Delivery Request ${deliveryIcon}`;
    }
    return "Ride Request";
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDecline}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Text style={styles.vehicleIcon}>{vehicleIcon}</Text>
              <Text style={styles.title}>{getTitle()}</Text>
            </View>
            <View style={styles.timer}>
              <Text style={styles.timerText}>{countdown}s</Text>
            </View>
          </View>

          {/* Service Type Badge (for MOTO) */}
          {currentOffer.vehicleType === "MOTO" && (
            <View style={[styles.badge, isDelivery ? styles.badgeDelivery : styles.badgePassenger]}>
              <Text style={styles.badgeIcon}>{serviceIcon}</Text>
              <Text style={styles.badgeText}>
                {isDelivery ? "Delivery" : "Passenger"}
              </Text>
            </View>
          )}

          {/* Delivery Details (for MOTO DELIVERY) */}
          {isDelivery && (
            <View style={styles.deliverySection}>
              <Text style={styles.deliveryLabel}>Delivering:</Text>
              <View style={styles.deliveryType}>
                <Text style={styles.deliveryIcon}>{deliveryIcon}</Text>
                <Text style={styles.deliveryText}>
                  {currentOffer.deliveryType === "OTHER" && currentOffer.itemDescription
                    ? currentOffer.itemDescription
                    : currentOffer.deliveryType}
                </Text>
              </View>
            </View>
          )}

          {/* Customer Info */}
          <View style={styles.section}>
            <Text style={styles.label}>Customer</Text>
            <Text style={styles.customerName}>{currentOffer.customerName}</Text>
          </View>

          {/* Route Info */}
          <View style={styles.section}>
            <View style={styles.routeItem}>
              <View style={styles.routeDot} />
              <View style={styles.routeInfo}>
                <Text style={styles.routeLabel}>Pickup</Text>
                <Text style={styles.routeAddress}>{currentOffer.pickup.address}</Text>
              </View>
            </View>
            
            <View style={styles.routeLine} />
            
            <View style={styles.routeItem}>
              <View style={[styles.routeDot, styles.routeDotDestination]} />
              <View style={styles.routeInfo}>
                <Text style={styles.routeLabel}>Destination</Text>
                <Text style={styles.routeAddress}>{currentOffer.destination.address}</Text>
              </View>
            </View>
          </View>

          {/* Distance (no fare displayed) */}
          <View style={styles.distanceCard}>
            <Text style={styles.distanceIcon}>📍</Text>
            <Text style={styles.distanceValue}>{formatDistance(currentOffer.distance)}</Text>
            <Text style={styles.distanceLabel}>Distance</Text>
          </View>

          {/* Customer Note */}
          {currentOffer.customerNote && (
            <View style={styles.noteSection}>
              <Text style={styles.noteLabel}>📝 Customer Note:</Text>
              <Text style={styles.noteText}>{currentOffer.customerNote}</Text>
            </View>
          )}

          {/* Payment Note */}
          <View style={styles.paymentNote}>
            <Text style={styles.paymentText}>💬 Negotiate fare directly with customer</Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.declineButton]}
              onPress={onDecline}
              disabled={isAccepting || isDeclining}
            >
              {isDeclining ? (
                <ActivityIndicator color={COLORS.error} />
              ) : (
                <Text style={styles.declineText}>Decline</Text>
              )}
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.button, styles.acceptButton]}
              onPress={onAccept}
              disabled={isAccepting || isDeclining}
            >
              {isAccepting ? (
                <ActivityIndicator color={COLORS.textInverse} />
              ) : (
                <Text style={styles.acceptText}>Accept</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlayStrong,
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: SPACING.lg,
    paddingBottom: SPACING.xl,
    maxHeight: Dimensions.get("window").height * 0.85,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  vehicleIcon: {
    fontSize: 28,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: COLORS.text,
  },
  timer: {
    backgroundColor: COLORS.error + "20",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 20,
  },
  timerText: {
    fontSize: 16,
    fontWeight: "bold",
    color: COLORS.error,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: 20,
    marginBottom: SPACING.md,
    gap: SPACING.xs,
  },
  badgePassenger: {
    backgroundColor: COLORS.primary + "20",
  },
  badgeDelivery: {
    backgroundColor: COLORS.warningSoft,
  },
  badgeIcon: {
    fontSize: 18,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
  },
  deliverySection: {
    backgroundColor: COLORS.surfaceLight,
    padding: SPACING.md,
    borderRadius: 16,
    marginBottom: SPACING.md,
  },
  deliveryLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  deliveryType: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  deliveryIcon: {
    fontSize: 24,
  },
  deliveryText: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.text,
  },
  section: {
    marginBottom: SPACING.md,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  customerName: {
    fontSize: 20,
    fontWeight: "600",
    color: COLORS.text,
  },
  routeItem: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  routeDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    marginRight: SPACING.md,
    marginTop: 4,
  },
  routeDotDestination: {
    backgroundColor: COLORS.success,
  },
  routeInfo: {
    flex: 1,
  },
  routeLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  routeAddress: {
    fontSize: 16,
    color: COLORS.text,
  },
  routeLine: {
    width: 2,
    height: 24,
    backgroundColor: COLORS.border,
    marginLeft: 7,
    marginVertical: SPACING.xs,
  },
  distanceCard: {
    backgroundColor: COLORS.surfaceLight,
    padding: SPACING.md,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  distanceIcon: {
    fontSize: 24,
    marginBottom: SPACING.xs,
  },
  distanceValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.text,
  },
  distanceLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  noteSection: {
    backgroundColor: COLORS.primaryPale,
    padding: SPACING.md,
    borderRadius: 16,
    marginBottom: SPACING.md,
  },
  noteLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  noteText: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
  },
  paymentNote: {
    backgroundColor: COLORS.surface,
    padding: SPACING.sm,
    borderRadius: 8,
    marginBottom: SPACING.md,
    alignItems: "center",
  },
  paymentText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontStyle: "italic",
  },
  actions: {
    flexDirection: "row",
    gap: SPACING.md,
  },
  button: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 54,
  },
  declineButton: {
    backgroundColor: COLORS.errorSoft,
  },
  acceptButton: {
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 4,
  },
  declineText: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.error,
  },
  acceptText: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textInverse,
  },
});
