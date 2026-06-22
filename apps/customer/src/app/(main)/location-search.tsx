import { useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SPACING, CustomerTheme } from "../../constants/config";
import { useTheme } from "../../hooks/useTheme";
import { useBookingStore } from "../../store/bookingStore";

// Mock location suggestions (in production, use Google Places API)
const MOCK_LOCATIONS = [
  { id: "1", address: "Accra Mall, Spintex Road", lat: 5.6037, lng: -0.1870 },
  { id: "2", address: "Kotoka International Airport", lat: 5.6052, lng: -0.1718 },
  { id: "3", address: "Osu Oxford Street", lat: 5.5560, lng: -0.1781 },
  { id: "4", address: "Legon University Campus", lat: 5.6511, lng: -0.1876 },
  { id: "5", address: "Tema Harbour", lat: 5.6667, lng: -0.0167 },
];

export default function LocationSearchScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = createStyles(theme);
  const params = useLocalSearchParams<{ type: "pickup" | "destination" }>();
  const { type } = params;

  const { setPickup, setDestination } = useBookingStore();
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState(MOCK_LOCATIONS);

  const handleSearch = (text: string) => {
    setSearch(text);
    // In production, call Google Places API
    const filtered = MOCK_LOCATIONS.filter((loc) =>
      loc.address.toLowerCase().includes(text.toLowerCase())
    );
    setSuggestions(filtered);
  };

  const handleSelectLocation = (location: typeof MOCK_LOCATIONS[0]) => {
    if (type === "pickup") {
      setPickup({ lat: location.lat, lng: location.lng, address: location.address });
    } else {
      setDestination({ lat: location.lat, lng: location.lng, address: location.address });
    }
    router.back();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {type === "pickup" ? "Current Location" : "Where to?"}
        </Text>
      </View>

      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder={type === "pickup" ? "Search current location..." : "Search where to go..."}
          value={search}
          onChangeText={handleSearch}
          autoFocus
        />
      </View>

      <FlatList
        data={suggestions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.suggestion}
            onPress={() => handleSelectLocation(item)}
          >
            <Text style={styles.suggestionIcon}>📍</Text>
            <Text style={styles.suggestionText}>{item.address}</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
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
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  backButton: {
    padding: SPACING.xs,
  },
  backIcon: {
    fontSize: 24,
    color: theme.text,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: theme.text,
    marginLeft: SPACING.md,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.surface,
    marginHorizontal: SPACING.lg,
    marginVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 12,
  },
  searchIcon: {
    fontSize: 20,
    marginRight: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: theme.text,
  },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  suggestionIcon: {
    fontSize: 20,
    marginRight: SPACING.md,
  },
  suggestionText: {
    flex: 1,
    fontSize: 16,
    color: theme.text,
  },
  chevron: {
    fontSize: 24,
    color: theme.textSecondary,
  },
  separator: {
    height: 1,
    backgroundColor: theme.border,
    marginHorizontal: SPACING.lg,
  },
});
}
