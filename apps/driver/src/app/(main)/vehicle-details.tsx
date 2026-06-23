import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { driverApiService } from "../../services/driver";
import { COLORS, SPACING } from "../../constants/config";

interface VehicleInfo {
  vehicleType: string;
  licensePlate: string | null;
  isApproved: boolean;
}

export default function VehicleDetailsScreen() {
  const router = useRouter();
  const [vehicle, setVehicle] = useState<VehicleInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    driverApiService.getProfile().then((profile) => {
      if (profile?.driver) {
        setVehicle({
          vehicleType: profile.driver.vehicleType,
          licensePlate: profile.driver.licensePlate,
          isApproved: profile.driver.isApproved,
        });
      }
      setIsLoading(false);
    });
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.headerAction}>Close</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Vehicle Details</Text>
        <View style={{ width: 50 }} />
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <View style={styles.content}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Vehicle Type</Text>
            <Text style={styles.rowValue}>{vehicle?.vehicleType || "—"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>License Plate</Text>
            <Text style={styles.rowValue}>{vehicle?.licensePlate || "Not set"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Verification Status</Text>
            <Text style={[styles.rowValue, { color: vehicle?.isApproved ? COLORS.online : COLORS.accent }]}>
              {vehicle?.isApproved ? "Verified" : "Pending Review"}
            </Text>
          </View>
          <Text style={styles.hint}>
            To update your vehicle type, license plate, or documents, contact support.
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerAction: {
    fontSize: 16,
    color: COLORS.textSecondary,
    width: 50,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.text,
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    padding: SPACING.lg,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  rowValue: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.text,
  },
  hint: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: SPACING.lg,
    lineHeight: 18,
  },
});
