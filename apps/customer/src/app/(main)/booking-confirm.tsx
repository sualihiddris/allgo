import { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { SPACING, CustomerTheme } from "../../constants/config";
import { useTheme } from "../../hooks/useTheme";
import { useBookingStore, VehicleType, ServiceType, DeliveryType } from "../../store/bookingStore";
import bookingService from "../../services/booking";

// Vehicle info for MVP
const VEHICLE_INFO: Record<VehicleType, { icon: string; label: string; description: string }> = {
  MOTO: { icon: "🏍️", label: "Motorbike", description: "Quick ride for 1 person, or small delivery" },
  KEKE: { icon: "🛺", label: "Keke / Pragya", description: "Comfortable for up to 3 people" },
  MOTOR_KING: { icon: "🛻", label: "Aboboya", description: "For goods & cargo" },
};

// MOTO service types
const SERVICE_TYPES: Record<ServiceType, { icon: string; label: string }> = {
  PASSENGER: { icon: "🧑", label: "Passenger" },
  DELIVERY: { icon: "📦", label: "Delivery" },
};

// Delivery types for MOTO
const DELIVERY_TYPES: Record<DeliveryType, { icon: string; label: string }> = {
  FOOD: { icon: "🍜", label: "Food" },
  GROCERIES: { icon: "🛒", label: "Groceries" },
  PARCELS: { icon: "📦", label: "Parcels" },
  OTHER: { icon: "❓", label: "Other" },
};

import { isNightServiceHours, isVehicleAllowedAtNight } from "@allgo/shared/constants/nightService";

export default function BookingConfirmScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = createStyles(theme);
  const {
    pickup,
    destination,
    vehicleType,
    serviceType,
    deliveryType,
    itemDescription,
    customerNote,
    isBooking,
    setVehicleType,
    setServiceType,
    setDeliveryType,
    setItemDescription,
    setCustomerNote,
    setIsBooking,
    setCurrentTrip,
  } = useBookingStore();

  // Section 20: Night service state
  const [isNightTime, setIsNightTime] = useState(isNightServiceHours());

  useEffect(() => {
    // Check night service every minute
    const interval = setInterval(() => {
      setIsNightTime(isNightServiceHours());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleConfirmBooking = async () => {
    if (!pickup || !destination) return;

    // Validate MOTO delivery has delivery type
    if (vehicleType === "MOTO" && serviceType === "DELIVERY") {
      if (!deliveryType) {
        Alert.alert("Error", "Please select what you're sending");
        return;
      }
      if (deliveryType === "OTHER" && !itemDescription.trim()) {
        Alert.alert("Error", "Please describe your item");
        return;
      }
    }

    setIsBooking(true);
    try {
      const result = await bookingService.createTrip({
        vehicleType,
        serviceType,
        deliveryType: vehicleType === "MOTO" && serviceType === "DELIVERY" ? deliveryType! : undefined,
        itemDescription: deliveryType === "OTHER" ? itemDescription : undefined,
        pickup,
        destination,
        customerNote,
      });
      
      setCurrentTrip(result.trip);
      router.push("/trip-tracking");
    } catch (error) {
      console.error("Failed to create trip:", error);
      Alert.alert("Error", "Failed to book trip. Please try again.");
    } finally {
      setIsBooking(false);
    }
  };

  const canConfirm = () => {
    if (!pickup || !destination) return false;
    // Section 20: Allow all vehicle types at night
    if (isNightTime && !isVehicleAllowedAtNight(vehicleType)) return false;
    if (vehicleType === "MOTO" && serviceType === "DELIVERY") {
      if (!deliveryType) return false;
      if (deliveryType === "OTHER" && !itemDescription.trim()) return false;
    }
    return true;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Confirm Booking</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* Section 20: Night Service Indicator */}
        {isNightTime && (
          <View style={styles.nightBanner}>
            <Text style={styles.nightIcon}>🌙</Text>
            <View style={styles.nightText}>
              <Text style={styles.nightTitle}>Night Service Active</Text>
              <Text style={styles.nightDescription}>
                Night rides may cost slightly more than daytime. Fare is agreed directly with your rider.
              </Text>
            </View>
          </View>
        )}

        {/* Route Info */}
        <View style={styles.section}>
          <View style={styles.routeItem}>
            <View style={styles.routeDot} />
            <Text style={styles.routeAddress}>{pickup?.address}</Text>
          </View>
          <View style={styles.routeLine} />
          <View style={styles.routeItem}>
            <View style={[styles.routeDot, styles.routeDotDestination]} />
            <Text style={styles.routeAddress}>{destination?.address}</Text>
          </View>
        </View>

        {/* Vehicle Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Vehicle</Text>
          <View style={styles.vehicleList}>
            {(Object.keys(VEHICLE_INFO) as VehicleType[]).map((type) => {
              const info = VEHICLE_INFO[type];
              const isSelected = vehicleType === type;
              // Section 20: Apply shared night-service availability rules
              const isDisabledAtNight = isNightTime && !isVehicleAllowedAtNight(type);
              
              return (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.vehicleButton, 
                    isSelected && styles.vehicleActive,
                    isDisabledAtNight && styles.vehicleDisabled,
                  ]}
                  onPress={() => !isDisabledAtNight && setVehicleType(type)}
                  disabled={isDisabledAtNight}
                >
                  <Text style={[styles.vehicleIcon, isDisabledAtNight && styles.iconDisabled]}>
                    {info.icon}
                  </Text>
                  <View style={styles.vehicleInfo}>
                    <Text style={[
                      styles.vehicleLabel, 
                      isSelected && styles.vehicleTextActive,
                      isDisabledAtNight && styles.textDisabled,
                    ]}>
                      {info.label}
                    </Text>
                    <Text style={[styles.vehicleDescription, isDisabledAtNight && styles.textDisabled]}>
                      {isDisabledAtNight ? "Not available at night" : info.description}
                    </Text>
                  </View>
                  {isSelected && !isDisabledAtNight && <Text style={styles.checkmark}>✓</Text>}
                  {isDisabledAtNight && <Text style={styles.nightOnly}>🌙</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* MOTO Service Type Selection (only for MOTO) */}
        {vehicleType === "MOTO" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Passenger or Delivery?</Text>
            <View style={styles.toggleRow}>
              {(Object.keys(SERVICE_TYPES) as ServiceType[]).map((type) => {
                const info = SERVICE_TYPES[type];
                const isSelected = serviceType === type;
                
                return (
                  <TouchableOpacity
                    key={type}
                    style={[styles.toggleButton, isSelected && styles.toggleActive]}
                    onPress={() => setServiceType(type)}
                  >
                    <Text style={styles.toggleIcon}>{info.icon}</Text>
                    <Text style={[styles.toggleLabel, isSelected && styles.toggleTextActive]}>
                      {info.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Delivery Type Selection (only for MOTO + DELIVERY) */}
        {vehicleType === "MOTO" && serviceType === "DELIVERY" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>What are you sending?</Text>
            <View style={styles.deliveryGrid}>
              {(Object.keys(DELIVERY_TYPES) as DeliveryType[]).map((type) => {
                const info = DELIVERY_TYPES[type];
                const isSelected = deliveryType === type;
                
                return (
                  <TouchableOpacity
                    key={type}
                    style={[styles.deliveryButton, isSelected && styles.deliveryActive]}
                    onPress={() => setDeliveryType(type)}
                  >
                    <Text style={styles.deliveryIcon}>{info.icon}</Text>
                    <Text style={[styles.deliveryLabel, isSelected && styles.deliveryTextActive]}>
                      {info.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            
            {/* Item description for OTHER */}
            {deliveryType === "OTHER" && (
              <TextInput
                style={styles.itemInput}
                placeholder="Describe your item (e.g., small electronics)"
                placeholderTextColor={theme.textSecondary}
                value={itemDescription}
                onChangeText={setItemDescription}
                maxLength={200}
              />
            )}
          </View>
        )}

        {/* Note for Driver */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Note for Driver (Optional)</Text>
          <TextInput
            style={styles.noteInput}
            placeholder="e.g., Landmark near pickup, special instructions..."
            placeholderTextColor={theme.textSecondary}
            value={customerNote}
            onChangeText={setCustomerNote}
            multiline
            maxLength={200}
          />
          <Text style={styles.charCount}>{customerNote.length}/200</Text>
        </View>

        {/* Payment Note */}
        <View style={styles.section}>
          <View style={styles.paymentNote}>
            <Text style={styles.paymentIcon}>💬</Text>
            <View style={styles.paymentText}>
              <Text style={styles.paymentTitle}>Negotiate fare with driver</Text>
              <Text style={styles.paymentDescription}>
                Payment is handled directly between you and the driver after the trip
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Confirm Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.confirmButton, (!canConfirm() || isBooking) && styles.confirmDisabled]}
          onPress={handleConfirmBooking}
          disabled={!canConfirm() || isBooking}
        >
          {isBooking ? (
            <ActivityIndicator color={theme.textInverse} />
          ) : (
            <Text style={styles.confirmText}>Find Rider</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function createStyles(theme: CustomerTheme) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  backButton: {
    padding: SPACING.xs,
  },
  backIcon: {
    fontSize: 24,
    color: theme.text,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.text,
    marginLeft: SPACING.md,
  },
  content: {
    flex: 1,
  },
  section: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.text,
    marginBottom: SPACING.md,
  },
  routeItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  routeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.primary,
    marginRight: SPACING.md,
  },
  routeDotDestination: {
    backgroundColor: theme.success,
  },
  routeAddress: {
    flex: 1,
    fontSize: 14,
    color: theme.text,
  },
  routeLine: {
    width: 2,
    height: 20,
    backgroundColor: theme.border,
    marginLeft: 5,
    marginVertical: 4,
  },
  vehicleList: {
    gap: SPACING.md,
  },
  vehicleButton: {
    flexDirection: "row",
    padding: SPACING.md,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.border,
    alignItems: "center",
    backgroundColor: theme.surface,
  },
  vehicleActive: {
    borderColor: theme.primary,
    backgroundColor: theme.primaryLight,
  },
  vehicleIcon: {
    fontSize: 32,
    marginRight: SPACING.md,
  },
  vehicleInfo: {
    flex: 1,
  },
  vehicleLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.text,
  },
  vehicleTextActive: {
    color: theme.primary,
  },
  vehicleDescription: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 2,
  },
  checkmark: {
    fontSize: 24,
    color: theme.primary,
    fontWeight: "bold",
  },
  toggleRow: {
    flexDirection: "row",
    gap: SPACING.md,
  },
  toggleButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.md,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    gap: SPACING.sm,
  },
  toggleActive: {
    borderColor: theme.primary,
    backgroundColor: theme.primaryLight,
  },
  toggleIcon: {
    fontSize: 24,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.text,
  },
  toggleTextActive: {
    color: theme.primary,
  },
  deliveryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  deliveryButton: {
    width: "48%",
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.md,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    gap: SPACING.sm,
  },
  deliveryActive: {
    borderColor: theme.primary,
    backgroundColor: theme.primaryLight,
  },
  deliveryIcon: {
    fontSize: 24,
  },
  deliveryLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.text,
  },
  deliveryTextActive: {
    color: theme.primary,
  },
  itemInput: {
    marginTop: SPACING.md,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: SPACING.md,
    fontSize: 14,
    color: theme.text,
  },
  noteInput: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: SPACING.md,
    fontSize: 14,
    color: theme.text,
    minHeight: 80,
    textAlignVertical: "top",
  },
  charCount: {
    fontSize: 12,
    color: theme.textSecondary,
    textAlign: "right",
    marginTop: 4,
  },
  paymentNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: theme.surface,
    padding: SPACING.md,
    borderRadius: 12,
    gap: SPACING.md,
  },
  paymentIcon: {
    fontSize: 24,
  },
  paymentText: {
    flex: 1,
  },
  paymentTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.text,
  },
  paymentDescription: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 4,
  },
  footer: {
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  confirmButton: {
    backgroundColor: theme.primary,
    padding: SPACING.md,
    borderRadius: 12,
    alignItems: "center",
  },
  confirmDisabled: {
    backgroundColor: theme.textSecondary,
  },
  confirmText: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.textInverse,
  },
  // Section 20: Night service styles
  nightBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: theme.deep,
    padding: SPACING.md,
    margin: SPACING.md,
    borderRadius: 12,
    gap: SPACING.md,
  },
  nightIcon: {
    fontSize: 28,
  },
  nightText: {
    flex: 1,
  },
  nightTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.textInverse,
  },
  nightDescription: {
    fontSize: 12,
    color: theme.inverseMuted,
    marginTop: 4,
  },
  vehicleDisabled: {
    opacity: 0.5,
    borderColor: theme.border,
    backgroundColor: theme.surface,
  },
  iconDisabled: {
    opacity: 0.5,
  },
  textDisabled: {
    color: theme.textSecondary,
  },
  nightOnly: {
    fontSize: 20,
    color: theme.textSecondary,
  },
});
}
