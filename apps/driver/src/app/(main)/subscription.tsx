/**
 * AllGO Driver Subscription Screen (Section 4A)
 *
 * Shows current subscription status + payment instructions, and lets the
 * driver submit proof of payment (MoMo transaction reference) for admin
 * review. No automated payment verification in MVP.
 */

import { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { COLORS, SPACING, getDriverTheme } from "../../constants/config";
import { useDriverStore } from "../../store";
import { driverApiService } from "../../services/driver";

export default function SubscriptionScreen() {
  const router = useRouter();
  const { nightMode } = useDriverStore();
  const theme = getDriverTheme(nightMode);
  const styles = createStyles(theme);

  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reference, setReference] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    const result = await driverApiService.getSubscription();
    setData(result);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async () => {
    if (!reference.trim()) return;
    setIsSubmitting(true);
    const result = await driverApiService.submitPayment(reference.trim());
    setIsSubmitting(false);
    if (result.success) {
      setReference("");
      Alert.alert("Submitted", result.message);
      load();
    } else {
      Alert.alert("Error", result.message);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const isActive = data?.subscriptionStatus === "ACTIVE";

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Subscription</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={[styles.statusCard, isActive ? styles.statusActive : styles.statusExpired]}>
          <Text style={styles.statusEmoji}>{isActive ? "✅" : "⚠️"}</Text>
          <Text style={styles.statusTitle}>{isActive ? "Active" : "Expired"}</Text>
          {data?.subscriptionPeriodEnd && (
            <Text style={styles.statusSubtitle}>
              {isActive ? "Active until " : "Expired on "}
              {new Date(data.subscriptionPeriodEnd).toLocaleDateString()}
            </Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>How to pay</Text>
          <Text style={styles.cardText}>{data?.paymentInstructions?.note}</Text>
          <View style={styles.momoBox}>
            <Text style={styles.momoLabel}>AllGO MoMo Number</Text>
            <Text style={styles.momoNumber}>{data?.paymentInstructions?.momoNumber}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Submit Payment Proof</Text>
          <TextInput
            style={styles.input}
            placeholder="MoMo transaction reference"
            placeholderTextColor={theme.textSecondary}
            value={reference}
            onChangeText={setReference}
          />
          <TouchableOpacity
            style={[styles.submitButton, (!reference.trim() || isSubmitting) && styles.submitDisabled]}
            onPress={handleSubmit}
            disabled={!reference.trim() || isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color={theme.textInverse} />
            ) : (
              <Text style={styles.submitText}>Submit for Review</Text>
            )}
          </TouchableOpacity>
        </View>

        {data?.submissions?.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Submission History</Text>
            {data.submissions.map((s: any) => (
              <View key={s.id} style={styles.submissionRow}>
                <Text style={styles.submissionRef}>{s.reference}</Text>
                <Text
                  style={[
                    styles.submissionStatus,
                    s.status === "APPROVED" && styles.statusApprovedText,
                    s.status === "REJECTED" && styles.statusRejectedText,
                  ]}
                >
                  {s.status}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(theme: ReturnType<typeof getDriverTheme>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    backButton: { padding: SPACING.xs },
    backIcon: { fontSize: 24, color: theme.text },
    headerTitle: { fontSize: 18, fontWeight: "600", color: theme.text, marginLeft: SPACING.md },
    content: { flex: 1, padding: SPACING.lg },
    statusCard: {
      alignItems: "center",
      padding: SPACING.lg,
      borderRadius: 16,
      marginBottom: SPACING.md,
    },
    statusActive: { backgroundColor: theme.successSoft },
    statusExpired: { backgroundColor: theme.warningSoft },
    statusEmoji: { fontSize: 40, marginBottom: SPACING.sm },
    statusTitle: { fontSize: 20, fontWeight: "700", color: theme.text },
    statusSubtitle: { fontSize: 14, color: theme.textSecondary, marginTop: 4 },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      padding: SPACING.lg,
      marginBottom: SPACING.md,
      borderWidth: 1,
      borderColor: theme.border,
    },
    cardTitle: { fontSize: 16, fontWeight: "600", color: theme.text, marginBottom: SPACING.sm },
    cardText: { fontSize: 14, color: theme.textSecondary, lineHeight: 20 },
    momoBox: {
      marginTop: SPACING.md,
      padding: SPACING.md,
      backgroundColor: theme.primaryLight,
      borderRadius: 12,
      alignItems: "center",
    },
    momoLabel: { fontSize: 12, fontWeight: "600", color: theme.primaryDark },
    momoNumber: { fontSize: 20, fontWeight: "700", color: theme.primaryDark, marginTop: 4 },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: SPACING.md,
      fontSize: 14,
      color: theme.text,
      marginBottom: SPACING.md,
    },
    submitButton: {
      backgroundColor: theme.primary,
      paddingVertical: SPACING.md,
      borderRadius: 12,
      alignItems: "center",
    },
    submitDisabled: { backgroundColor: theme.disabled || theme.border },
    submitText: { fontSize: 16, fontWeight: "600", color: theme.textInverse },
    submissionRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: SPACING.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    submissionRef: { fontSize: 14, color: theme.text },
    submissionStatus: { fontSize: 12, fontWeight: "600", color: theme.textSecondary },
    statusApprovedText: { color: COLORS.success },
    statusRejectedText: { color: COLORS.error },
  });
}
