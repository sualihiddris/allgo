import { useState, useRef, useEffect } from "react";
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
import { router, useLocalSearchParams } from "expo-router";
import { authService } from "../../services";
import { useAuthStore } from "../../store";
import { SPACING, CustomerTheme } from "../../constants/config";
import { useTheme } from "../../hooks/useTheme";

const OTP_LENGTH = 6;

export default function OtpScreen() {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [isLoading, setIsLoading] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const { login } = useAuthStore();

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleChange = (text: string, index: number) => {
    const newOtp = [...otp];
    newOtp[index] = text;
    setOtp(newOtp);

    // Auto-advance to next input
    if (text && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when complete
    if (newOtp.every((d) => d) && newOtp.join("").length === OTP_LENGTH) {
      handleVerify(newOtp.join(""));
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (code: string) => {
    if (!phone) return;
    
    setIsLoading(true);
    try {
      const result = await authService.verifyOtp(phone, code);
      login(result.data.user);

      if (result.data.user.isNewUser || !result.data.user.name) {
        router.replace("/(auth)/profile-setup");
      } else {
        router.replace("/(main)/home");
      }
    } catch (error) {
      Alert.alert("Error", (error as Error).message);
      setOtp(Array(OTP_LENGTH).fill(""));
      inputRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!phone || countdown > 0) return;
    
    try {
      await authService.requestOtp(phone);
      setCountdown(60);
      Alert.alert("Success", "New code sent!");
    } catch (error) {
      Alert.alert("Error", (error as Error).message);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.content}>
        <Text style={styles.title}>Verify your number</Text>
        <Text style={styles.subtitle}>
          Enter the 6-digit code sent to {phone}
        </Text>

        <View style={styles.otpContainer}>
          {otp.map((digit, index) => (
            <TextInput
              key={index}
              ref={(ref) => (inputRefs.current[index] = ref)}
              style={[styles.otpInput, digit ? styles.otpInputFilled : null]}
              value={digit}
              onChangeText={(text) => handleChange(text, index)}
              onKeyPress={({ nativeEvent }) =>
                handleKeyPress(nativeEvent.key, index)
              }
              keyboardType="number-pad"
              maxLength={1}
              selectTextOnFocus
              autoFocus={index === 0}
            />
          ))}
        </View>

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={() => handleVerify(otp.join(""))}
          disabled={isLoading || otp.join("").length !== OTP_LENGTH}
        >
          <Text style={styles.buttonText}>
            {isLoading ? "Verifying..." : "Verify"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleResend}
          disabled={countdown > 0}
          style={styles.resendButton}
        >
          <Text
            style={[styles.resendText, countdown > 0 && styles.resendDisabled]}
          >
            {countdown > 0
              ? `Resend code in ${countdown}s`
              : "Resend code"}
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
  otpContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: SPACING.xl,
  },
  otpInput: {
    width: 48,
    height: 56,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 16,
    fontSize: 24,
    textAlign: "center",
    color: theme.text,
    backgroundColor: theme.surface,
  },
  otpInputFilled: {
    borderColor: theme.primary,
    backgroundColor: theme.primaryPale,
  },
  button: {
    backgroundColor: theme.primary,
    paddingVertical: SPACING.md,
    minHeight: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.lg,
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
  resendButton: {
    alignItems: "center",
    padding: SPACING.sm,
  },
  resendText: {
    color: theme.primary,
    fontSize: 14,
  },
  resendDisabled: {
    color: theme.textSecondary,
  },
  });
}
