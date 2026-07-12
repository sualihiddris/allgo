/**
 * AllGO Post-Trip Feedback Screen
 * 
 * Shows after trip completes:
 * - 1-5 star rating for driver
 * - Optional issue text
 * 
 * NOTE: No fare feedback — payment is between customer and driver
 */

import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SPACING, CustomerTheme } from "../../constants/config";
import { useTheme } from "../../hooks/useTheme";
import bookingService from "../../services/booking";
import { useBookingStore } from "../../store/bookingStore";

export default function FeedbackScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = createStyles(theme);
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const { reset } = useBookingStore();

  const [rating, setRating] = useState(0);
  const [fareRating, setFareRating] = useState<"fair" | "too_high" | "too_low" | null>(null);
  const [issue, setIssue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0 || !fareRating || !tripId) return;

    setIsSubmitting(true);
    try {
      await bookingService.submitFeedback({
        tripId,
        rating,
        fareRating,
        issue: issue.trim() || undefined,
      });
      
      // Reset booking state and go home
      reset();
      router.replace("/home");
    } catch (error) {
      console.error("Failed to submit feedback:", error);
      Alert.alert("Error", "Failed to submit feedback. Going home...");
      reset();
      router.replace("/home");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => {
    reset();
    router.replace("/home");
  };

  const canSubmit = rating > 0 && fareRating !== null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Trip Complete! 🎉</Text>
      </View>

      <View style={styles.content}>
        {/* Driver Rating */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How was your driver?</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity
                key={star}
                style={styles.starButton}
                onPress={() => setRating(star)}
              >
                <Text style={[styles.star, star <= rating && styles.starActive]}>
                  ★
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {rating > 0 && (
            <Text style={styles.ratingLabel}>
              {rating === 5 ? "Excellent!" : rating >= 4 ? "Good" : rating >= 3 ? "Okay" : rating >= 2 ? "Not great" : "Poor"}
            </Text>
          )}
        </View>

        {/* Fare Rating */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Was the fare fair?</Text>
          <View style={styles.buttonRow}>
            {[
              { value: "fair" as const, label: "Fair" },
              { value: "too_high" as const, label: "Too High" },
              { value: "too_low" as const, label: "Too Low" },
            ].map(({ value, label }) => (
              <TouchableOpacity
                key={value}
                style={[
                  styles.fareButton,
                  fareRating === value && styles.fareButtonSelected,
                ]}
                onPress={() => setFareRating(value)}
              >
                <Text
                  style={[
                    styles.fareButtonText,
                    fareRating === value && styles.fareButtonTextSelected,
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Issue Text */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Any issues? (Optional)</Text>
          <TextInput
            style={styles.issueInput}
            placeholder="Tell us what went wrong..."
            placeholderTextColor={theme.textSecondary}
            value={issue}
            onChangeText={setIssue}
            multiline
            maxLength={500}
          />
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.skipButton}
          onPress={handleSkip}
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.submitButton, !canSubmit && styles.submitDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit || isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color={theme.textInverse} />
          ) : (
            <Text style={styles.submitText}>Submit</Text>
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
    alignItems: "center",
    paddingVertical: SPACING.xl,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: theme.text,
  },
  content: {
    flex: 1,
    padding: SPACING.lg,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.text,
    marginBottom: SPACING.md,
    textAlign: "center",
  },
  starsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: SPACING.md,
  },
  starButton: {
    padding: SPACING.sm,
  },
  star: {
    fontSize: 40,
    color: theme.border,
  },
  starActive: {
    color: theme.warning,
  },
  ratingLabel: {
    fontSize: 16,
    color: theme.primary,
    textAlign: "center",
    marginTop: SPACING.sm,
    fontWeight: "600",
  },
  buttonRow: {
    flexDirection: "row",
    gap: SPACING.md,
    justifyContent: "space-between",
  },
  fareButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 16,
    alignItems: "center",
  },
  fareButtonSelected: {
    borderColor: theme.primary,
    backgroundColor: theme.primary,
  },
  fareButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.text,
  },
  fareButtonTextSelected: {
    color: theme.textInverse,
  },
  issueInput: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: SPACING.md,
    fontSize: 14,
    color: theme.text,
    minHeight: 100,
    textAlignVertical: "top",
  },
  footer: {
    flexDirection: "row",
    padding: SPACING.lg,
    gap: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  skipButton: {
    flex: 1,
    padding: SPACING.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  skipText: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.textSecondary,
  },
  submitButton: {
    flex: 2,
    backgroundColor: theme.primary,
    padding: SPACING.md,
    minHeight: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 4,
  },
  submitDisabled: {
    backgroundColor: theme.disabled,
    shadowOpacity: 0,
    elevation: 0,
  },
  submitText: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.textInverse,
  },
});
}
