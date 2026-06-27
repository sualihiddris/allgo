/**
 * AllGO MVP Driver Profile Setup
 * 
 * Simplified onboarding: name + vehicle type selection
 * Approval flow handled by admin
 */

import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { driverAuthService } from "../../services";
import { useDriverStore } from "../../store";
import { COLORS, SPACING } from "../../constants/config";

type VehicleType = "MOTO" | "KEKE" | "MOTOR_KING";

const VEHICLE_OPTIONS: Array<{ type: VehicleType; icon: string; label: string; description: string }> = [
  { type: "MOTO", icon: "🏍️", label: "Motorbike", description: "For 1 passenger" },
  { type: "KEKE", icon: "🛺", label: "Keke / Pragya", description: "For up to 3 passengers" },
  { type: "MOTOR_KING", icon: "🛻", label: "Aboboya", description: "For goods & cargo" },
];

export default function ProfileSetupScreen() {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType | null>(null);
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { updateProfile } = useDriverStore();

  const handleNameContinue = () => {
    if (!name.trim()) {
      Alert.alert("Required", "Please enter your name");
      return;
    }
    setStep(2);
  };

  const handleSubmit = async () => {
    if (!vehicleType) {
      Alert.alert("Required", "Please select your vehicle type");
      return;
    }
    if (!vehiclePlate.trim()) {
      Alert.alert("Required", "Please enter your vehicle plate number");
      return;
    }

    setIsLoading(true);
    try {
      const success = await driverAuthService.updateProfile({
        name: name.trim(),
        vehicleType,
        vehiclePlate: vehiclePlate.trim().toUpperCase(),
      });

      if (success) {
        updateProfile({
          name: name.trim(),
        });
        
        Alert.alert(
          "Profile Submitted",
          "Your profile has been submitted for approval. You'll be notified when approved.",
          [{ text: "OK", onPress: () => router.replace("/(main)/home") }]
        );
      } else {
        Alert.alert("Error", "Failed to update profile");
      }
    } catch (error) {
      Alert.alert("Error", (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  if (step === 1) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.content}>
          <Text style={styles.title}>What's your name?</Text>
          <Text style={styles.subtitle}>
            Customers will see this name when booking rides
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Enter your full name"
            placeholderTextColor={COLORS.textSecondary}
            value={name}
            onChangeText={setName}
            autoFocus
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={handleNameContinue}
          />

          <TouchableOpacity
            style={styles.button}
            onPress={handleNameContinue}
          >
            <Text style={styles.buttonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollInner}>
        <Text style={styles.title}>Vehicle Information</Text>
        <Text style={styles.subtitle}>
          Select your vehicle type and enter details
        </Text>

        {/* Vehicle Type Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Select Vehicle Type</Text>
          {VEHICLE_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.type}
              style={[
                styles.vehicleCard,
                vehicleType === option.type && styles.vehicleCardSelected,
              ]}
              onPress={() => setVehicleType(option.type)}
            >
              <Text style={styles.vehicleIcon}>{option.icon}</Text>
              <View style={styles.vehicleInfo}>
                <Text style={[
                  styles.vehicleLabel,
                  vehicleType === option.type && styles.vehicleLabelSelected
                ]}>
                  {option.label}
                </Text>
                <Text style={styles.vehicleDescription}>{option.description}</Text>
              </View>
              {vehicleType === option.type && (
                <Text style={styles.checkmark}>✓</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Vehicle Plate */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Vehicle Plate Number</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., GR 1234-20"
            placeholderTextColor={COLORS.textSecondary}
            value={vehiclePlate}
            onChangeText={setVehiclePlate}
            autoCapitalize="characters"
            returnKeyType="done"
          />
        </View>

        {/* Info Note */}
        <View style={styles.infoBox}>
          <Text style={styles.infoIcon}>ℹ️</Text>
          <Text style={styles.infoText}>
            Your profile will be reviewed by our admin team. You'll be notified when approved and can start accepting rides.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>
            {isLoading ? "Submitting..." : "Submit for Approval"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => setStep(1)}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    padding: SPACING.lg,
    justifyContent: "center",
  },
  scrollContent: {
    flex: 1,
  },
  scrollInner: {
    padding: SPACING.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xl,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  vehicleCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.md,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    marginBottom: SPACING.md,
  },
  vehicleCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
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
    color: COLORS.text,
  },
  vehicleLabelSelected: {
    color: COLORS.primary,
  },
  vehicleDescription: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  checkmark: {
    fontSize: 24,
    color: COLORS.primary,
    fontWeight: "bold",
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: 16,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
  },
  infoBox: {
    flexDirection: "row",
    backgroundColor: COLORS.primaryLight,
    padding: SPACING.md,
    borderRadius: 12,
    marginBottom: SPACING.xl,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  infoIcon: {
    fontSize: 20,
    marginRight: SPACING.sm,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 18,
  },
  button: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textInverse,
  },
  backButton: {
    paddingVertical: SPACING.sm,
    alignItems: "center",
  },
  backText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
});
