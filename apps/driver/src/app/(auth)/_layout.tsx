import { Stack } from "expo-router";
import { COLORS } from "../../constants/config";

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: COLORS.background },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: "600" },
      }}
    >
      <Stack.Screen
        name="phone"
        options={{
          title: "Rider Sign In",
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
