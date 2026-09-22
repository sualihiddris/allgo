import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAuthStore, useThemeStore, AppearanceMode } from "../../store";
import { SPACING, CustomerTheme } from "../../constants/config";
import { useTheme } from "../../hooks/useTheme";

const APPEARANCE_OPTIONS: { value: AppearanceMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export default function ProfileScreen() {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { user, logout } = useAuthStore();
  const appearanceMode = useThemeStore((s) => s.mode);
  const setAppearanceMode = useThemeStore((s) => s.setMode);

  const handleLogout = () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to logout?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Logout",
          style: "destructive",
          onPress: async () => {
            await logout();
            router.replace("/(auth)/phone");
          },
        },
      ]
    );
  };

  const menuItems = [
    { label: "Edit profile", onPress: () => router.push("/(main)/edit-profile") },
    { label: "Terms & privacy", onPress: () => router.push("/(main)/terms-privacy") },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        {/* Profile Header */}
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.name?.charAt(0).toUpperCase() || "?"}
            </Text>
          </View>
          <Text style={styles.name}>{user?.name || "Customer"}</Text>
          <Text style={styles.phone}>{user?.phone}</Text>
        </View>

        {/* Appearance */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Appearance</Text>
          <View style={styles.appearanceRow}>
            {APPEARANCE_OPTIONS.map((opt) => {
              const active = appearanceMode === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.appearanceOption, active && styles.appearanceOptionActive]}
                  onPress={() => setAppearanceMode(opt.value)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.appearanceLabel, active && styles.appearanceLabelActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Menu Items */}
        <View style={styles.menu}>
          {menuItems.map((item) => (
            <TouchableOpacity
              key={item.label}
              style={styles.menuItem}
              onPress={item.onPress}
            >
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Text style={styles.menuChevron}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        <Text style={styles.version}>AllGo v0.1.0</Text>
      </ScrollView>
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
    alignItems: "center",
    padding: SPACING.xl,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: "bold",
    color: theme.textInverse,
  },
  name: {
    fontSize: 24,
    fontWeight: "bold",
    color: theme.text,
  },
  phone: {
    fontSize: 14,
    color: theme.textSecondary,
    marginTop: 4,
  },
  section: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.textSecondary,
    marginBottom: SPACING.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  appearanceRow: {
    flexDirection: "row",
    backgroundColor: theme.surface,
    borderRadius: 14,
    padding: SPACING.xs,
    borderWidth: 1,
    borderColor: theme.border,
  },
  appearanceOption: {
    flex: 1,
    alignItems: "center",
    paddingVertical: SPACING.sm,
    borderRadius: 10,
  },
  appearanceOptionActive: {
    backgroundColor: theme.primary,
  },
  appearanceLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.textSecondary,
  },
  appearanceLabelActive: {
    color: theme.textInverse,
  },
  menu: {
    padding: SPACING.md,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    color: theme.text,
  },
  menuChevron: {
    fontSize: 24,
    color: theme.textSecondary,
  },
  logoutButton: {
    margin: SPACING.lg,
    padding: SPACING.md,
    backgroundColor: theme.surface,
    borderRadius: 12,
    alignItems: "center",
  },
  logoutText: {
    fontSize: 16,
    color: theme.error,
    fontWeight: "600",
  },
  version: {
    textAlign: "center",
    fontSize: 12,
    color: theme.textSecondary,
    marginBottom: SPACING.xl,
  },
});
}
