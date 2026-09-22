import { useState, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS, SPACING } from "../constants/config";
import { useJobStore } from "../store/jobStore";
import { isNightServiceHours } from "@allgo/shared/constants/nightService";

interface JobOfferModalProps {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

function formatDistance(meters: number): string {
  const km = (meters / 1000).toFixed(1);
  return `${km} km away`;
}

function formatDeliveryType(value?: string | null): string {
  if (!value) return "Delivery";

  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function JobOfferModal({
  visible,
  onAccept,
  onDecline,
}: JobOfferModalProps) {
  const { currentOffer, isAccepting, isDeclining } = useJobStore();

  // Section 20: Dynamic timeout - 45s for night, 30s for day.
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

  const isDelivery = currentOffer.serviceType === "DELIVERY";
  const isBusy = isAccepting || isDeclining;

  const deliveryDescription =
    currentOffer.deliveryType === "OTHER" && currentOffer.itemDescription
      ? currentOffer.itemDescription
      : formatDeliveryType(currentOffer.deliveryType);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDecline}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>
                  {isDelivery ? "NEW DELIVERY REQUEST" : "NEW RIDE REQUEST"}
                </Text>
                <Text style={styles.distance}>
                  {formatDistance(currentOffer.distance)}
                </Text>
              </View>

              <View
                style={[
                  styles.timer,
                  countdown <= 10 && styles.timerUrgent,
                ]}
              >
                <Text
                  style={[
                    styles.timerText,
                    countdown <= 10 && styles.timerTextUrgent,
                  ]}
                >
                  {countdown}s
                </Text>
              </View>
            </View>

            {isDelivery && (
              <View style={styles.deliverySection}>
                <Text style={styles.metaLabel}>Delivery</Text>
                <Text style={styles.deliveryText}>
                  {deliveryDescription}
                </Text>
              </View>
            )}

            <View style={styles.routeSection}>
              <View style={styles.routeItem}>
                <View style={styles.pickupDot} />
                <View style={styles.routeCopy}>
                  <Text style={styles.routeLabel}>Pickup</Text>
                  <Text style={styles.routeAddress}>
                    {currentOffer.pickup.address}
                  </Text>
                </View>
              </View>

              <View style={styles.routeConnector} />

              <View style={styles.routeItem}>
                <View style={styles.destinationDot} />
                <View style={styles.routeCopy}>
                  <Text style={styles.routeLabel}>Destination</Text>
                  <Text style={styles.routeAddress}>
                    {currentOffer.destination.address}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.customerSection}>
              <Text style={styles.metaLabel}>Customer</Text>
              <Text style={styles.customerName}>
                {currentOffer.customerName || "Customer"}
              </Text>
            </View>

            {!!currentOffer.customerNote && (
              <View style={styles.noteSection}>
                <Text style={styles.metaLabel}>Customer note</Text>
                <Text style={styles.noteText}>
                  {currentOffer.customerNote}
                </Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[
                styles.acceptButton,
                isBusy && styles.buttonDisabled,
              ]}
              onPress={onAccept}
              disabled={isBusy}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={
                isDelivery ? "Accept delivery" : "Accept ride"
              }
            >
              {isAccepting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.acceptText}>
                  {isDelivery ? "Accept Delivery" : "Accept Ride"}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.declineButton,
                isBusy && styles.secondaryDisabled,
              ]}
              onPress={onDecline}
              disabled={isBusy}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Decline request"
            >
              {isDeclining ? (
                <ActivityIndicator color={COLORS.error} />
              ) : (
                <Text style={styles.declineText}>Decline</Text>
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
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: Dimensions.get("window").height * 0.88,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  scrollView: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: SPACING.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: SPACING.md,
    marginBottom: 24,
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    letterSpacing: 0.7,
    color: COLORS.textSecondary,
    marginBottom: 5,
  },
  distance: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "700",
    color: COLORS.text,
  },
  timer: {
    minWidth: 52,
    minHeight: 40,
    paddingHorizontal: SPACING.md,
    borderRadius: 10,
    backgroundColor: COLORS.errorSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  timerUrgent: {
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  timerText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    color: COLORS.error,
  },
  timerTextUrgent: {
    color: "#B91C1C",
  },
  deliverySection: {
    padding: SPACING.md,
    marginBottom: 20,
    borderRadius: 10,
    backgroundColor: COLORS.warningSoft,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  metaLabel: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  deliveryText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
    color: COLORS.text,
  },
  routeSection: {
    marginBottom: 22,
  },
  routeItem: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  pickupDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.primary,
    marginTop: 5,
    marginRight: SPACING.md,
  },
  destinationDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.success,
    marginTop: 5,
    marginRight: SPACING.md,
  },
  routeCopy: {
    flex: 1,
    minWidth: 0,
  },
  routeLabel: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginBottom: 3,
  },
  routeAddress: {
    fontSize: 16,
    lineHeight: 23,
    color: COLORS.text,
    flexShrink: 1,
  },
  routeConnector: {
    width: 2,
    height: 24,
    backgroundColor: COLORS.border,
    marginLeft: 5,
    marginVertical: SPACING.xs,
  },
  customerSection: {
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginBottom: 20,
  },
  customerName: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "600",
    color: COLORS.text,
  },
  noteSection: {
    padding: SPACING.md,
    borderRadius: 10,
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  noteText: {
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.text,
  },
  actions: {
    paddingHorizontal: 20,
    paddingTop: SPACING.md,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
    gap: SPACING.sm,
  },
  acceptButton: {
    minHeight: 54,
    borderRadius: 10,
    backgroundColor: COLORS.primaryDark,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.lg,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  acceptText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  declineButton: {
    minHeight: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.background,
  },
  secondaryDisabled: {
    opacity: 0.55,
  },
  declineText: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
    color: COLORS.error,
  },
});
