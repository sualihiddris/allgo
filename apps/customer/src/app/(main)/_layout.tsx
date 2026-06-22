import { Tabs } from "expo-router";
import { View, Text, StyleSheet } from "react-native";
import { CustomerTheme } from "../../constants/config";
import { useTheme } from "../../hooks/useTheme";

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const icons: Record<string, string> = {
    home: "🏠",
    rides: "🛵",
    profile: "👤",
  };

  return (
    <View style={styles.tabIcon}>
      <Text style={{ fontSize: 20 }}>{icons[name] || "•"}</Text>
    </View>
  );
}

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
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon name="home" focused={focused} />,
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
          tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon name="rides" focused={focused} />,
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
          tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon name="profile" focused={focused} />,
        }}
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
      height: 60,
    },
    tabLabel: {
      fontSize: 12,
      fontWeight: "500",
    },
    tabIcon: {
      alignItems: "center",
      justifyContent: "center",
    },
  });
}
