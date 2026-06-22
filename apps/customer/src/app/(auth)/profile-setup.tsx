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
} from "react-native";
import { router } from "expo-router";
import { authService } from "../../services";
import { useAuthStore } from "../../store";
import { SPACING, CustomerTheme } from "../../constants/config";
import { useTheme } from "../../hooks/useTheme";

export default function ProfileSetupScreen() {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { updateProfile } = useAuthStore();

  const handleContinue = async () => {
    if (!name.trim()) {
      Alert.alert("Required", "Please enter your name");
      return;
    }

    setIsLoading(true);
    try {
      const success = await authService.updateProfile({ name: name.trim() });
      if (success) {
        updateProfile({ name: name.trim() });
        router.replace("/(main)/home");
      } else {
        Alert.alert("Error", "Failed to update profile");
      }
    } catch (error) {
      Alert.alert("Error", (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.content}>
        <Text style={styles.title}>What's your name?</Text>
        <Text style={styles.subtitle}>
          This helps drivers identify you during pickups
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Enter your name"
          value={name}
          onChangeText={setName}
          autoFocus
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={handleContinue}
        />

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>
            {isLoading ? "Saving..." : "Continue"}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: CustomerTheme) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  content: {
    flex: 1,
    padding: SPACING.lg,
    justifyContent: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: theme.text,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: 16,
    color: theme.textSecondary,
    marginBottom: SPACING.xl,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: 18,
    color: theme.text,
    marginBottom: SPACING.xl,
  },
  button: {
    backgroundColor: theme.primary,
    paddingVertical: SPACING.md,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonDisabled: {
    backgroundColor: theme.disabled,
  },
  buttonText: {
    color: theme.textInverse,
    fontSize: 16,
    fontWeight: "600",
  },
  });
}
