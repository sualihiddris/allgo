import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SPACING, CustomerTheme } from "../constants/config";
import { useTheme } from "../hooks/useTheme";
import bookingService from "../services/booking";

type TripDetails = Awaited<ReturnType<typeof bookingService.getTrip>>;

const STATUS_LABELS: Record<string, string> = {
  REQUESTED: "Searching",
  ACCEPTED: "Accepted",
  ARRIVED: "Arrived",
  STARTED: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export default function TripDetailScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = createStyles(theme);
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  const [trip, setTrip] = useState<TripDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadTrip = async () => {
      if (!tripId || Array.isArray(tripId)) {
        setError("Missing trip identifier.");
        setLoading(false);
        return;
      }

      try {
        const data = await bookingService.getTrip(tripId);
        if (mounted) {
          setTrip(data);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load trip details.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadTrip();

    return () => {
      mounted = false;
    };
  }, [tripId]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.pageTitle}>Trip Details</Text>
        <View style={styles.backButtonSpacer} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Could not load trip</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : trip ? (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionLabel}>Status</Text>
              <View style={styles.statusPill}>
                <Text style={styles.statusText}>{STATUS_LABELS[trip.status] || trip.status}</Text>
              </View>
            </View>

            <Text style={styles.routeLabel}>From</Text>
            <Text style={styles.routeText}>{trip.pickupAddress}</Text>

            <Text style={styles.routeLabel}>To</Text>
            <Text style={styles.routeText}>{trip.destAddress}</Text>

            <View style={styles.infoGrid}>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Vehicle</Text>
                <Text style={styles.infoValue}>{trip.vehicleType}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Service</Text>
                <Text style={styles.infoValue}>{trip.serviceType}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Booked</Text>
                <Text style={styles.infoValue}>{new Date(trip.createdAt).toLocaleString()}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Source</Text>
                <Text style={styles.infoValue}>{trip.source}</Text>
              </View>
            </View>

            {trip.driver?.user?.name ? (
              <View style={styles.sectionBlock}>
                <Text style={styles.sectionLabel}>Driver</Text>
                <Text style={styles.detailText}>{trip.driver.user.name}</Text>
                {trip.driver.user.phone ? <Text style={styles.subDetailText}>{trip.driver.user.phone}</Text> : null}
              </View>
            ) : null}

            {trip.customerNote ? (
              <View style={styles.sectionBlock}>
                <Text style={styles.sectionLabel}>Note</Text>
                <Text style={styles.detailText}>{trip.customerNote}</Text>
              </View>
            ) : null}

            {trip.feedback ? (
              <View style={styles.sectionBlock}>
                <Text style={styles.sectionLabel}>Feedback</Text>
                <Text style={styles.detailText}>Rating: {trip.feedback.rating}/5</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

function createStyles(theme: CustomerTheme) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  backButton: {
    minWidth: 64,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
  },
  backButtonText: { color: theme.text, fontSize: 14, fontWeight: "600" },
  backButtonSpacer: { minWidth: 64 },
  pageTitle: { fontSize: 18, fontWeight: "700", color: theme.text },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: SPACING.xl },
  errorTitle: { fontSize: 18, fontWeight: "700", color: theme.text, marginBottom: 8 },
  errorText: { fontSize: 14, color: theme.textSecondary, textAlign: "center" },
  content: { padding: SPACING.lg },
  card: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 20,
    backgroundColor: theme.surface,
    padding: SPACING.lg,
  },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionLabel: { fontSize: 13, fontWeight: "700", color: theme.textSecondary, textTransform: "uppercase" },
  statusPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: theme.primaryPale },
  statusText: { color: theme.primaryDark, fontSize: 12, fontWeight: "700" },
  routeLabel: { marginTop: SPACING.lg, fontSize: 12, color: theme.textSecondary, textTransform: "uppercase" },
  routeText: { marginTop: 6, fontSize: 16, color: theme.text, fontWeight: "600" },
  infoGrid: {
    marginTop: SPACING.lg,
    gap: SPACING.md,
  },
  infoItem: {
    padding: SPACING.md,
    borderRadius: 16,
    backgroundColor: theme.background,
    borderWidth: 1,
    borderColor: theme.border,
  },
  infoLabel: { fontSize: 12, color: theme.textSecondary, marginBottom: 6 },
  infoValue: { fontSize: 15, color: theme.text, fontWeight: "600" },
  sectionBlock: { marginTop: SPACING.lg },
  detailText: { marginTop: 6, fontSize: 15, color: theme.text, fontWeight: "600" },
  subDetailText: { marginTop: 4, fontSize: 13, color: theme.textSecondary },
  });
}
