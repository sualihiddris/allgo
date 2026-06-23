import { useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuthStore } from "../../store";
import { authService } from "../../services/auth";
import { SPACING, CustomerTheme } from "../../constants/config";
import { useTheme } from "../../hooks/useTheme";

export default function EditProfileScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = createStyles(theme);
  const { user, updateProfile } = useAuthStore();
  const [name, setName] = useState(user?.name || "");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert("Name required", "Please enter your name.");
      return;
    }

    setIsSaving(true);
    const success = await authService.updateProfile({ name: trimmed });
    setIsSaving(false);

    if (success) {
      updateProfile({ name: trimmed });
      router.back();
    } else {
      Alert.alert("Couldn't save", "Please check your connection and try again.");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.headerAction}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <TouchableOpacity onPress={handleSave} disabled={isSaving}>
          {isSaving ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : (
            <Text style={[styles.headerAction, styles.headerActionPrimary]}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor={theme.textMuted}
          autoFocus
        />

        <Text style={styles.label}>Phone Number</Text>
        <View style={styles.readOnlyField}>
          <Text style={styles.readOnlyText}>{user?.phone}</Text>
        </View>
        <Text style={styles.hint}>Phone number can't be changed here.</Text>
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
      justifyContent: "space-between",
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    headerAction: {
      fontSize: 16,
      color: theme.textSecondary,
    },
    headerActionPrimary: {
      color: theme.primary,
      fontWeight: "600",
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.text,
    },
    form: {
      padding: SPACING.lg,
    },
    label: {
      fontSize: 13,
      fontWeight: "600",
      color: theme.textSecondary,
      marginBottom: SPACING.xs,
      marginTop: SPACING.lg,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      fontSize: 16,
      color: theme.text,
      backgroundColor: theme.surface,
    },
    readOnlyField: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      backgroundColor: theme.surfaceMuted,
    },
    readOnlyText: {
      fontSize: 16,
      color: theme.textSecondary,
    },
    hint: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: SPACING.xs,
    },
  });
}
