/**
 * AllGO Terms of Service & Privacy Policy
 *
 * IMPORTANT: this content is a substantive draft reflecting what the app
 * actually does today, written so it's accurate rather than generic
 * boilerplate - but it is NOT a substitute for review by a lawyer familiar
 * with Ghana's Data Protection Act, 2012 (Act 843). Two things this screen
 * does NOT do on its own:
 *   1. Satisfy AllGO's obligation to register as a data controller with
 *      Ghana's Data Protection Commission - that's a separate legal/
 *      business filing, not a code task.
 *   2. Replace legal sign-off before public launch.
 * Have a lawyer review and approve this text before it's relied on for
 * real users.
 */

import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { authService } from "../../services/auth";
import { SPACING, CustomerTheme } from "../../constants/config";
import { useTheme } from "../../hooks/useTheme";

const LAST_UPDATED = "June 2026";

export default function TermsPrivacyScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = createStyles(theme);
  const [pendingRequest, setPendingRequest] = useState<"ACCESS" | "DELETION" | null>(null);

  const handleDataRequest = (type: "ACCESS" | "DELETION") => {
    const isDelete = type === "DELETION";
    Alert.alert(
      isDelete ? "Delete my data" : "Request a copy of my data",
      isDelete
        ? "This submits a request to permanently delete your account and data. An admin will review and process it - this isn't instant. Continue?"
        : "This submits a request for a copy of your data. An admin will review it and respond. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Submit Request",
          style: isDelete ? "destructive" : "default",
          onPress: async () => {
            setPendingRequest(type);
            const result = await authService.submitDataRequest(type);
            setPendingRequest(null);
            Alert.alert(result.success ? "Request submitted" : "Couldn't submit request", result.message);
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.headerAction}>Close</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms & Privacy</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.lastUpdated}>Last updated: {LAST_UPDATED}</Text>
        <View style={styles.draftNotice}>
          <Text style={styles.draftNoticeText}>
            Draft pending legal review - not yet finalized.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Privacy Policy</Text>

        <Text style={styles.heading}>What we collect</Text>
        <Text style={styles.paragraph}>
          Your phone number and name, to create your account and let drivers
          identify you. For each trip, your pickup and destination locations.
          While a trip is active, your live location, shared only with the
          driver assigned to that trip - we don't track your location at any
          other time. If you submit feedback after a trip, your rating and
          comments.
        </Text>

        <Text style={styles.heading}>What we don't do</Text>
        <Text style={styles.paragraph}>
          AllGO has no involvement in payment, in any form. We don't process
          payments, store payment or mobile money details, or calculate
          fares. Fares are agreed and settled directly between you and your
          driver, outside the app.
        </Text>

        <Text style={styles.heading}>Who sees your data</Text>
        <Text style={styles.paragraph}>
          Your name and phone number are shared with the driver matched to
          your trip (and vice versa) so you can call each other to coordinate
          - that's the only sharing that happens. We don't sell your data or
          share it with third parties for marketing.
        </Text>

        <Text style={styles.heading}>How long we keep it</Text>
        <Text style={styles.paragraph}>
          We keep your account and trip data for as long as your account is
          active, or as required by law. You can request deletion at any
          time using the button below.
        </Text>

        <Text style={styles.heading}>Your rights</Text>
        <Text style={styles.paragraph}>
          You can request a copy of the data we hold about you, or request
          that it be deleted, at any time using the buttons below. Requests
          are reviewed and processed by an administrator - this is a manual
          process for now, not an instant action, so it may take a few days.
        </Text>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleDataRequest("ACCESS")}
            disabled={pendingRequest !== null}
          >
            {pendingRequest === "ACCESS" ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Text style={styles.actionButtonText}>Request my data</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonDanger]}
            onPress={() => handleDataRequest("DELETION")}
            disabled={pendingRequest !== null}
          >
            {pendingRequest === "DELETION" ? (
              <ActivityIndicator size="small" color={theme.error} />
            ) : (
              <Text style={[styles.actionButtonText, styles.actionButtonTextDanger]}>
                Delete my account & data
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.heading}>Contact</Text>
        <Text style={styles.paragraph}>
          Questions about your data: privacy@allgo.app (placeholder - set to
          a real, monitored address before launch).
        </Text>

        <View style={styles.divider} />

        <Text style={styles.sectionTitle}>Terms of Service</Text>

        <Text style={styles.heading}>What AllGO is</Text>
        <Text style={styles.paragraph}>
          AllGO connects customers with independent drivers for rides and
          deliveries. AllGO is not a transport company and does not employ
          drivers - drivers operate independently.
        </Text>

        <Text style={styles.heading}>Fares and payment</Text>
        <Text style={styles.paragraph}>
          Fares are negotiated and paid directly between you and your driver,
          in cash or by direct mobile money transfer. AllGO has no role in,
          and no responsibility for, the fare amount or any payment dispute.
        </Text>

        <Text style={styles.heading}>Your responsibilities</Text>
        <Text style={styles.paragraph}>
          Provide accurate information. Drivers must hold a valid vehicle and
          identification matching what they submitted for approval. Misuse of
          the platform may result in your account being suspended.
        </Text>

        <Text style={styles.heading}>Safety</Text>
        <Text style={styles.paragraph}>
          Contact between customer and driver happens by phone call. Use
          ordinary personal safety judgment when meeting a driver or
          customer in person, as you would with any in-person transaction.
        </Text>

        <Text style={styles.heading}>Liability</Text>
        <Text style={styles.paragraph}>
          AllGO facilitates the introduction between customer and driver. The
          trip or delivery itself is an agreement between you and the other
          party - AllGO is not responsible for what happens during it.
        </Text>

        <Text style={styles.heading}>Changes</Text>
        <Text style={styles.paragraph}>
          We may update these terms from time to time. Continuing to use
          AllGO after a change means you accept the updated terms.
        </Text>

        <Text style={styles.heading}>Governing law</Text>
        <Text style={styles.paragraph}>
          These terms are governed by the laws of Ghana.
        </Text>
      </ScrollView>
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
      justifyContent: "space-between",
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    headerAction: {
      fontSize: 16,
      color: theme.textSecondary,
      width: 50,
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.text,
    },
    content: {
      padding: SPACING.lg,
      paddingBottom: SPACING.xl,
    },
    lastUpdated: {
      fontSize: 12,
      color: theme.textMuted,
    },
    draftNotice: {
      backgroundColor: theme.warningSoft,
      borderRadius: 10,
      padding: SPACING.md,
      marginTop: SPACING.sm,
      marginBottom: SPACING.lg,
    },
    draftNoticeText: {
      fontSize: 13,
      color: theme.text,
      fontWeight: "600",
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: "bold",
      color: theme.text,
      marginTop: SPACING.lg,
      marginBottom: SPACING.sm,
    },
    heading: {
      fontSize: 15,
      fontWeight: "600",
      color: theme.text,
      marginTop: SPACING.md,
      marginBottom: SPACING.xs,
    },
    paragraph: {
      fontSize: 14,
      color: theme.textSecondary,
      lineHeight: 21,
    },
    actionsRow: {
      marginTop: SPACING.lg,
      gap: SPACING.sm,
    },
    actionButton: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingVertical: SPACING.md,
      alignItems: "center",
      backgroundColor: theme.surface,
    },
    actionButtonDanger: {
      borderColor: theme.error,
    },
    actionButtonText: {
      fontSize: 15,
      fontWeight: "600",
      color: theme.text,
    },
    actionButtonTextDanger: {
      color: theme.error,
    },
    divider: {
      height: 1,
      backgroundColor: theme.border,
      marginTop: SPACING.xl,
      marginBottom: SPACING.sm,
    },
  });
}
