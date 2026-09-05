import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SPACING, CustomerTheme } from "../../constants/config";
import { useIsDarkMode, useTheme } from "../../hooks/useTheme";
import { useBookingStore } from "../../store/bookingStore";
import { resolvePlace, searchPlaces, PlaceSuggestion } from "../../services/location";

export default function LocationSearchScreen() {
  const router = useRouter();
  const theme = useTheme();
  const isDark = useIsDarkMode();
  const styles = createStyles(theme);
  const params = useLocalSearchParams<{ type: "pickup" | "destination" }>();
  const { type } = params;

  const { pickup, setPickup, setDestination } = useBookingStore();
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const [resolvingPlaceId, setResolvingPlaceId] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const handleSearchChange = (text: string) => {
    setSearch(text);
    setResolutionError(null);
  };

  useEffect(() => {
    const query = search.trim();
    const sequence = ++requestSequence.current;
    if (query.length < 2) {
      setSuggestions([]);
      setIsSearching(false);
      setHasSearched(false);
      return;
    }
    setSuggestions([]);
    setHasSearched(false);
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchPlaces(query, pickup ?? undefined);
        if (sequence === requestSequence.current) setSuggestions(results);
      } catch (error) {
        if (sequence === requestSequence.current) {
          console.error("Failed to search places:", error);
          setSuggestions([]);
        }
      } finally {
        if (sequence === requestSequence.current) {
          setIsSearching(false);
          setHasSearched(true);
        }
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [search, pickup]);

  const handleSelectLocation = async (suggestion: PlaceSuggestion) => {
    if (resolvingPlaceId) return;
    setResolutionError(null);
    setResolvingPlaceId(suggestion.placeId);
    try {
      const place = await resolvePlace(suggestion.placeId);
      if (type === "pickup") {
        setPickup({ lat: place.lat, lng: place.lng, address: place.address });
      } else {
        setDestination({ lat: place.lat, lng: place.lng, address: place.address });
      }
      router.back();
    } catch (error) {
      console.error("Failed to resolve place:", error);
      setResolutionError("Could not load that place. Please try again.");
    } finally {
      setResolvingPlaceId(null);
    }
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
          placeholderTextColor={theme.textSecondary}
          value={search}
          onChangeText={handleSearchChange}
          autoFocus
        />
      </View>

      {isSearching && <ActivityIndicator color={theme.primary} style={styles.loading} />}
      {!isSearching && hasSearched && suggestions.length === 0 && (
        <Text style={styles.emptyState}>No places found</Text>
      )}
      {resolutionError && <Text style={styles.errorState}>{resolutionError}</Text>}
      <FlatList
        data={suggestions}
        keyExtractor={(item) => item.placeId}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.suggestion}
            onPress={() => handleSelectLocation(item)}
          >
            <Text style={styles.suggestionIcon}>📍</Text>
            <Text style={styles.suggestionText}>{item.text}</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListFooterComponent={
          suggestions.length > 0 ? (
            <Text style={[styles.attribution, { color: isDark ? "#FFFFFF" : "#5E5E5E" }]}>
              Google Maps
            </Text>
          ) : null
        }
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
    paddingVertical: SPACING.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.border,
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
  loading: {
    marginVertical: SPACING.md,
  },
  emptyState: {
    textAlign: "center",
    color: theme.textSecondary,
    padding: SPACING.lg,
  },
  attribution: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: "normal",
    padding: SPACING.sm,
  },
  errorState: {
    textAlign: "center",
    color: theme.error,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
});
}
