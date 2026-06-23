/**
 * AllGO Terms of Service & Privacy Policy (driver app)
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
 * real users. See apps/customer's identical screen for the same content.
 */

import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { driverAuthService } from "../../services/auth";
import { COLORS, SPACING } from "../../constants/config";

const LAST_UPDATED = "June 2026";

export default function TermsPrivacyScreen() {
  const router = useRouter();
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
            const result = await driverAuthService.submitDataRequest(type);
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
          Your phone number and name, to create your account. Your vehicle
          type, license plate, and the vehicle/ID photos you submit during
          approval, to verify your eligibility to drive on AllGO. While
          you're online, your live location, used to match you with nearby
          trip requests and shared with a customer only once you're matched
          to their trip.
        </Text>

        <Text style={styles.heading}>What we don't do</Text>
        <Text style={styles.paragraph}>
          AllGO has no involvement in payment, in any form. We don't process
          payments, store payment or mobile money details, or calculate
          fares. Fares are agreed and settled directly between you and the
          customer, outside the app. Subscription payments work the same way
          - you pay AllGO's business MoMo number directly, then submit proof
          for an admin to verify.
        </Text>

        <Text style={styles.heading}>Who sees your data</Text>
        <Text style={styles.paragraph}>
          Your name and phone number are shared with a customer once you're
          matched to their trip, so you can call each other to coordinate -
          that's the only sharing that happens. Your documents are reviewed
          by admins for approval purposes only. We don't sell your data or
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
              <ActivityIndicator size="small" color={COLORS.primary} />
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
              <ActivityIndicator size="small" color={COLORS.error} />
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
          AllGO connects you, as an independent driver, with customers
          requesting rides and deliveries. AllGO does not employ you - you
          operate independently and are responsible for your own vehicle,
          licensing, and conduct.
        </Text>

        <Text style={styles.heading}>Fares and payment</Text>
        <Text style={styles.paragraph}>
          You negotiate and collect your fare directly from the customer, in
          cash or by direct mobile money transfer. AllGO has no role in, and
          no responsibility for, the fare amount or any payment dispute.
        </Text>

        <Text style={styles.heading}>Your responsibilities</Text>
        <Text style={styles.paragraph}>
          Keep your vehicle documentation and identification valid and
          matching what you submitted for approval. Provide accurate
          information. Misuse of the platform may result in your account
          being suspended.
        </Text>

        <Text style={styles.heading}>Subscription</Text>
        <Text style={styles.paragraph}>
          Staying online to receive job offers requires an active
          subscription, paid directly to AllGO. If your subscription lapses
          while you're on an active trip, that trip is allowed to complete
          normally - the cutoff only applies to going online afterward.
        </Text>

        <Text style={styles.heading}>Safety</Text>
        <Text style={styles.paragraph}>
          Contact with customers happens by phone call. Use ordinary
          personal safety judgment when meeting a customer in person, as you
          would with any in-person transaction.
        </Text>

        <Text style={styles.heading}>Liability</Text>
        <Text style={styles.paragraph}>
          AllGO facilitates the introduction between you and the customer.
          The trip or delivery itself is an agreement between you and the
          customer - AllGO is not responsible for what happens during it.
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
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  lastUpdated: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  draftNotice: {
    backgroundColor: COLORS.accent + "20",
    borderRadius: 10,
    padding: SPACING.md,
    marginTop: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  draftNoticeText: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.text,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  heading: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.text,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  paragraph: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 21,
  },
  actionsRow: {
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
  actionButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: SPACING.md,
    alignItems: "center",
    backgroundColor: COLORS.surface,
  },
  actionButtonDanger: {
    borderColor: COLORS.error,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.text,
  },
  actionButtonTextDanger: {
    color: COLORS.error,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginTop: SPACING.xl,
    marginBottom: SPACING.sm,
  },
});
