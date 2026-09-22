import { Tabs } from "expo-router";
import { StyleSheet } from "react-native";
import { CustomerTheme } from "../../constants/config";
import { useTheme } from "../../hooks/useTheme";

export default function MainLayout() {
  const theme = useTheme();
  const styles = createStyles(theme);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
        }}
      />
      <Tabs.Screen
        name="booking-confirm"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="location-search"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="rides"
        options={{
          title: "Rides",
        }}
      />
      <Tabs.Screen
        name="trip-tracking"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="active-trip"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="feedback"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Account",
        }}
      />
      <Tabs.Screen
        name="edit-profile"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="terms-privacy"
        options={{ href: null }}
      />
    </Tabs>
  );
}

function createStyles(theme: CustomerTheme) {
  return StyleSheet.create({
    tabBar: {
      backgroundColor: theme.background,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      paddingTop: 8,
      paddingBottom: 8,
      height: 64,
    },
    tabLabel: {
      fontSize: 13,
      fontWeight: "600",
    },
  });
}
