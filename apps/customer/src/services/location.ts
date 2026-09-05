import * as Location from "expo-location";
import { Platform } from "react-native";
import { API_BASE_URL } from "../constants/config";
import { authService } from "./auth";

export interface CurrentPickupLocation {
  lat: number;
  lng: number;
  address: string;
}

export interface PlaceSuggestion {
  placeId: string;
  text: string;
}

export interface ResolvedPlace {
  placeId: string;
  address: string;
  lat: number;
  lng: number;
}

function formatAddress(address: Location.LocationGeocodedAddress, fallbackCoordinates: { lat: number; lng: number }) {
  const parts = [
    address.name,
    address.street,
    address.city,
    address.region,
  ].filter(Boolean);

  if (parts.length > 0) {
    return parts.join(", ");
  }

  return "Current location";
}

// expo-location's reverseGeocodeAsync has no working web implementation
// (Google deprecated the legacy endpoint it used) - on web, ask our own
// server instead, which proxies to Google's Geocoding API server-side.
// Native iOS/Android keep using the OS-level geocoder directly below,
// unaffected and with no server round-trip needed.
async function reverseGeocodeWeb(lat: number, lng: number): Promise<string> {
  const response = await authService.authenticatedFetch(
    `${API_BASE_URL}/maps/reverse-geocode?lat=${lat}&lng=${lng}`
  );

  if (!response.ok) {
    return "Current location";
  }

  const data = await response.json();
  return data.data?.address || "Current location";
}

function getDevelopmentTestLocation(): { lat: number; lng: number } | null {
  if (!__DEV__ || Platform.OS !== "web") return null;

  const latValue = process.env.EXPO_PUBLIC_CUSTOMER_TEST_LAT?.trim();
  const lngValue = process.env.EXPO_PUBLIC_CUSTOMER_TEST_LNG?.trim();
  if (!latValue || !lngValue) return null;

  const lat = Number(latValue);
  const lng = Number(lngValue);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }

  return { lat, lng };
}

export async function getCurrentPickupLocation(): Promise<CurrentPickupLocation> {
  const testLocation = getDevelopmentTestLocation();
  let latitude: number;
  let longitude: number;

  if (testLocation) {
    ({ lat: latitude, lng: longitude } = testLocation);
  } else {
    const { status } = await Location.requestForegroundPermissionsAsync();

    if (status !== "granted") {
      throw new Error("Location permission is required to detect your pickup point.");
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    ({ latitude, longitude } = position.coords);
  }

  const address = Platform.OS === "web"
    ? await reverseGeocodeWeb(latitude, longitude).catch(() => "Current location")
    : await Location.reverseGeocodeAsync({ latitude, longitude })
        .then(([result]) => (result ? formatAddress(result, { lat: latitude, lng: longitude }) : "Current location"))
        .catch(() => "Current location");

  return { lat: latitude, lng: longitude, address };
}

export async function searchPlaces(query: string, bias?: { lat: number; lng: number }): Promise<PlaceSuggestion[]> {
  const params = new URLSearchParams({ q: query });
  if (bias) {
    params.set("lat", String(bias.lat));
    params.set("lng", String(bias.lng));
  }
  const response = await authService.authenticatedFetch(`${API_BASE_URL}/maps/places/autocomplete?${params}`);
  if (!response.ok) throw new Error("Failed to search places");
  const data = await response.json();
  return data.data?.suggestions ?? [];
}

export async function resolvePlace(placeId: string): Promise<ResolvedPlace> {
  const response = await authService.authenticatedFetch(
    `${API_BASE_URL}/maps/places/${encodeURIComponent(placeId)}`
  );
  if (!response.ok) throw new Error("Failed to resolve place");
  const data = await response.json();
  return data.data.place;
}