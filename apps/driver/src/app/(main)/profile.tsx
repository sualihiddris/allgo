import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useDriverStore } from "../../store";
import { COLORS, SPACING } from "../../constants/config";

export default function ProfileScreen() {
  const { user, logout } = useDriverStore();

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

  const showComingSoon = (feature: string) => {
    Alert.alert(feature, "This is coming in a future update.");
  };

  const menuItems = [
    { icon: "👤", label: "Edit Profile", onPress: () => router.push("/(main)/edit-profile") },
    { icon: "🏍️", label: "Vehicle Details", onPress: () => router.push("/(main)/vehicle-details") },
    { icon: "📄", label: "Documents", onPress: () => showComingSoon("Documents") },
    { icon: "💳", label: "Subscription", onPress: () => router.push("/(main)/subscription") },
    { icon: "📞", label: "Support", onPress: () => showComingSoon("Support") },
    { icon: "📋", label: "Terms & Privacy", onPress: () => showComingSoon("Terms & Privacy") },
  ];

  const getVerificationBadge = () => {
    return user?.driver?.isApproved
      ? { text: "Verified ✓", color: COLORS.online }
      : { text: "Pending Review", color: COLORS.accent };
  };

  const badge = getVerificationBadge();

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
          <Text style={styles.name}>{user?.name || "Rider"}</Text>
          <Text style={styles.phone}>{user?.phone}</Text>
          
          <View style={[styles.badge, { backgroundColor: badge.color + "20" }]}>
            <Text style={[styles.badgeText, { color: badge.color }]}>
              {badge.text}
            </Text>
          </View>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>
                ⭐ {user?.driver?.rating?.toFixed(1) || "5.0"}
              </Text>
              <Text style={styles.statLabel}>Rating</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{user?.driver?.totalTrips || 0}</Text>
              <Text style={styles.statLabel}>Trips</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{user?.driver?.totalDeliveries || 0}</Text>
              <Text style={styles.statLabel}>Deliveries</Text>
            </View>
          </View>
        </View>

        {/* Menu Items */}
        <View style={styles.menu}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.menuItem}
              onPress={item.onPress}
            >
              <Text style={styles.menuIcon}>{item.icon}</Text>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Text style={styles.menuChevron}>›</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        <Text style={styles.version}>AllGo Rider v0.1.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    alignItems: "center",
    padding: SPACING.xl,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: "bold",
    color: COLORS.textInverse,
  },
  name: {
    fontSize: 24,
    fontWeight: "bold",
    color: COLORS.text,
  },
  phone: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  badge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: 20,
    marginTop: SPACING.md,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  statsRow: {
    flexDirection: "row",
    marginTop: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    width: "100%",
  },
  stat: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.text,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: COLORS.border,
  },
  menu: {
    padding: SPACING.md,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  menuIcon: {
    fontSize: 24,
    marginRight: SPACING.md,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
  },
  menuChevron: {
    fontSize: 24,
    color: COLORS.textSecondary,
  },
  logoutButton: {
    margin: SPACING.lg,
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    alignItems: "center",
  },
  logoutText: {
    fontSize: 16,
    color: COLORS.error,
    fontWeight: "600",
  },
  version: {
    textAlign: "center",
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xl,
  },
});
