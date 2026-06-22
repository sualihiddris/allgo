import { Stack } from "expo-router";
import { useTheme } from "../../hooks/useTheme";

export default function AuthLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: theme.background },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: "600" },
      }}
    >
      <Stack.Screen
        name="phone"
        options={{
          title: "Sign In",
          headerBackVisible: false,
        }}
      />
      <Stack.Screen
        name="otp"
        options={{
          title: "Verify OTP",
        }}
      />
      <Stack.Screen
        name="profile-setup"
        options={{
          title: "Complete Profile",
          headerBackVisible: false,
        }}
      />
    </Stack>
  );
}
