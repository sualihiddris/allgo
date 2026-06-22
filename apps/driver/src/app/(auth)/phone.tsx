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
import { driverAuthService } from "../../services";
import { COLORS, SPACING } from "../../constants/config";
import { useDriverStore } from "../../store/driverStore";

export default function PhoneScreen() {
  const [phone, setPhone] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const login = useDriverStore((s) => s.login);

  const handleContinue = async () => {
    const cleanPhone = phone.replace(/\s/g, "");
    
    if (cleanPhone.length < 9) {
      Alert.alert("Invalid Phone", "Please enter a valid Ghana phone number");
      return;
    }

    setIsLoading(true);
    try {
      await driverAuthService.requestOtp(cleanPhone);
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
    const cleanPhone = phone.replace(/\s/g, "") || "251234567"; // slightly different default just in case
    
    setIsLoading(true);
    try {
      const result = await driverAuthService.devLogin(cleanPhone);
      login(result.data.user);
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
        <Text style={styles.title}>AllGo Rider</Text>
        <Text style={styles.subtitle}>
          Sign in to start earning
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
          By continuing, you agree to our Rider Terms and Privacy Policy
        </Text>
      </View>
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
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: COLORS.primary,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xl,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.xl,
  },
  prefix: {
    fontSize: 18,
    color: COLORS.text,
    marginRight: SPACING.sm,
  },
  input: {
    flex: 1,
    fontSize: 18,
    paddingVertical: SPACING.md,
    color: COLORS.text,
  },
  button: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  buttonDisabled: {
    backgroundColor: COLORS.disabled,
  },
  buttonText: {
    color: COLORS.textInverse,
    fontSize: 16,
    fontWeight: "600",
  },
  devButton: {
    backgroundColor: COLORS.deep,
    paddingVertical: SPACING.md,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: SPACING.lg,
  },
  devButtonText: {
    color: COLORS.textInverse,
    fontSize: 14,
    fontWeight: "500",
  },
  terms: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
});
