import { Tabs } from "expo-router";
import { View, Text, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { COLORS, getDriverTheme } from "../../constants/config";
import { useDriverStore } from "../../store";

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    home: "🏠",
    profile: "👤",
  };

  return (
    <View style={styles.tabIcon}>
      <Text style={{ fontSize: 20 }}>{icons[name] || "•"}</Text>
    </View>
  );
}

export default function MainLayout() {
  const { nightMode } = useDriverStore();
  const theme = getDriverTheme(nightMode);

  return (
    <>
      <StatusBar style={nightMode ? "light" : "dark"} />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.primary,
          tabBarInactiveTintColor: theme.textSecondary,
          tabBarStyle: [styles.tabBar, { backgroundColor: theme.background, borderTopColor: theme.border }],
          tabBarLabelStyle: styles.tabLabel,
          sceneContainerStyle: { backgroundColor: theme.background },
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
          name="active-job"
          options={{
            href: null, // Hidden from tab bar — navigated to programmatically
          }}
        />
        <Tabs.Screen
          name="subscription"
          options={{
            href: null, // Hidden from tab bar — navigated to programmatically
          }}
        />
        <Tabs.Screen
          name="edit-profile"
          options={{
            href: null, // Hidden from tab bar — navigated to programmatically
          }}
        />
        <Tabs.Screen
          name="vehicle-details"
          options={{
            href: null, // Hidden from tab bar — navigated to programmatically
          }}
        />
        <Tabs.Screen
          name="terms-privacy"
          options={{
            href: null, // Hidden from tab bar — navigated to programmatically
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ focused }: { focused: boolean }) => <TabIcon name="profile" focused={focused} />,
          }}
        />
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    borderTopWidth: 1,
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
