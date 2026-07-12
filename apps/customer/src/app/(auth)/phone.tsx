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
import { useAuthStore } from "../../store/authStore";
import { SPACING, CustomerTheme } from "../../constants/config";
import { useTheme } from "../../hooks/useTheme";

export default function PhoneScreen() {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [phone, setPhone] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const setUser = useAuthStore((s) => s.setUser);

  const handleContinue = async () => {
    const cleanPhone = phone.replace(/\s/g, "");
    
    if (cleanPhone.length < 9) {
      Alert.alert("Invalid Phone", "Please enter a valid Ghana phone number");
      return;
    }

    setIsLoading(true);
    try {
      await authService.requestOtp(cleanPhone);
      router.push({
        pathname: "/(auth)/otp",
        params: { phone: cleanPhone },
      });
    } catch (error) {
      Alert.alert("Error", (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  // Dev login - bypasses OTP
  const handleDevLogin = async () => {
    const cleanPhone = phone.replace(/\s/g, "") || "241234567";
    
    setIsLoading(true);
    try {
      const result = await authService.devLogin(cleanPhone);
      setUser(result.data.user);
      router.replace("/(main)/home");
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
        <Text style={styles.title}>Welcome to AllGo</Text>
        <Text style={styles.subtitle}>
          Enter your phone number to get started
        </Text>

        <View style={styles.inputContainer}>
          <Text style={styles.prefix}>+233</Text>
          <TextInput
            style={styles.input}
            placeholder="XX XXX XXXX"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            maxLength={12}
            autoFocus
          />
        </View>

        <Text style={styles.hint}>
          We'll send you a verification code via SMS
        </Text>

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>
            {isLoading ? "Sending..." : "Continue"}
          </Text>
        </TouchableOpacity>

        {/* Dev Login Button */}
        <TouchableOpacity
          style={[styles.devButton]}
          onPress={handleDevLogin}
          disabled={isLoading}
        >
          <Text style={styles.devButtonText}>
            🔧 Dev Login (Skip OTP)
          </Text>
        </TouchableOpacity>

        <Text style={styles.terms}>
          By continuing, you agree to our Terms of Service and Privacy Policy
        </Text>
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
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 16,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    backgroundColor: theme.surface,
  },
  prefix: {
    fontSize: 18,
    color: theme.text,
    marginRight: SPACING.sm,
  },
  input: {
    flex: 1,
    fontSize: 18,
    paddingVertical: SPACING.md,
    color: theme.text,
  },
  hint: {
    fontSize: 14,
    color: theme.textSecondary,
    marginBottom: SPACING.xl,
  },
  button: {
    backgroundColor: theme.primary,
    paddingVertical: SPACING.md,
    minHeight: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.md,
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 4,
  },
  buttonDisabled: {
    backgroundColor: theme.disabled,
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonText: {
    color: theme.textInverse,
    fontSize: 16,
    fontWeight: "600",
  },
  devButton: {
    backgroundColor: theme.deep,
    paddingVertical: SPACING.md,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: SPACING.lg,
  },
  devButtonText: {
    color: theme.textInverse,
    fontSize: 14,
    fontWeight: "500",
  },
  terms: {
    fontSize: 12,
    color: theme.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
  });
}
