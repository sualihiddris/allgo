import { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { SPACING, CustomerTheme } from "../../constants/config";
import { useTheme } from "../../hooks/useTheme";
import bookingService from "../../services/booking";

type TripHistoryItem = Awaited<ReturnType<typeof bookingService.getTrips>>[number];

const STATUS_LABELS: Record<string, string> = {
  REQUESTED: "Searching",
  ACCEPTED: "Accepted",
  ARRIVED: "Arrived",
  STARTED: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export default function RidesScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = createStyles(theme);
  const [trips, setTrips] = useState<TripHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadTrips = async () => {
      try {
        const data = await bookingService.getTrips();
        if (mounted) {
          setTrips(data);
        }
      } catch (error) {
        console.error("Failed to load trip history:", error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadTrips();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Trip History</Text>
        <Text style={styles.subtitle}>Your recent rides and deliveries</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : trips.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🛣️</Text>
          <Text style={styles.emptyTitle}>No trips yet</Text>
          <Text style={styles.emptyText}>Your ride history will appear here once you book.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.push("/home")}>
            <Text style={styles.primaryButtonText}>Book a Ride</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => router.push({ pathname: "/trip-detail", params: { tripId: item.id } })}
            >
              <View style={styles.cardTopRow}>
                <Text style={styles.tripTitle}>{item.pickupAddress}</Text>
                <View style={styles.statusPill}>
                  <Text style={styles.statusText}>{STATUS_LABELS[item.status] || item.status}</Text>
                </View>
              </View>
              <Text style={styles.tripRoute} numberOfLines={2}>
                {item.destAddress}
              </Text>
              <View style={styles.metaRow}>
                <Text style={styles.metaText}>{item.vehicleType}</Text>
                <Text style={styles.metaText}>{new Date(item.createdAt).toLocaleDateString()}</Text>
              </View>
              {item.driver?.user?.name && (
                <Text style={styles.driverText}>Driver: {item.driver.user.name}</Text>
              )}
              <Text style={styles.openText}>Tap for details</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function createStyles(theme: CustomerTheme) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.background },
  header: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.md },
  title: { fontSize: 24, fontWeight: "700", color: theme.text },
  subtitle: { marginTop: 4, fontSize: 14, color: theme.textSecondary },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xl,
  },
  emptyEmoji: { fontSize: 48, marginBottom: SPACING.md },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: theme.text },
  emptyText: { fontSize: 14, color: theme.textSecondary, textAlign: "center", marginTop: 8 },
  primaryButton: {
    marginTop: SPACING.lg,
    minHeight: 52,
    paddingHorizontal: SPACING.xl,
    borderRadius: 16,
    backgroundColor: theme.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 4,
  },
  primaryButtonText: { color: theme.textInverse, fontSize: 16, fontWeight: "600" },
  listContent: { padding: SPACING.lg, paddingTop: SPACING.sm, gap: SPACING.md },
  card: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 18,
    backgroundColor: theme.surface,
    padding: SPACING.md,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 1,
  },
  cardTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACING.sm },
  tripTitle: { flex: 1, fontSize: 16, fontWeight: "600", color: theme.text },
  statusPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: theme.primaryPale },
  statusText: { fontSize: 12, fontWeight: "600", color: theme.primaryDark },
  tripRoute: { marginTop: 10, fontSize: 14, color: theme.textSecondary },
  metaRow: { marginTop: 12, flexDirection: "row", justifyContent: "space-between" },
  metaText: { fontSize: 12, color: theme.textSecondary },
  driverText: { marginTop: 8, fontSize: 13, color: theme.text },
  openText: { marginTop: 10, fontSize: 12, color: theme.primaryDark, fontWeight: "600" },
});
}