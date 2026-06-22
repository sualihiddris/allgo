import * as Location from "expo-location";
import { Platform } from "react-native";
import { API_BASE_URL } from "../constants/config";
import { authService } from "./auth";

export interface CurrentPickupLocation {
  lat: number;
  lng: number;
  address: string;
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

export async function getCurrentPickupLocation(): Promise<CurrentPickupLocation> {
  const { status } = await Location.requestForegroundPermissionsAsync();

  if (status !== "granted") {
    throw new Error("Location permission is required to detect your pickup point.");
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  const { latitude, longitude } = position.coords;

  const address = Platform.OS === "web"
    ? await reverseGeocodeWeb(latitude, longitude).catch(() => "Current location")
    : await Location.reverseGeocodeAsync({ latitude, longitude })
        .then(([result]) => (result ? formatAddress(result, { lat: latitude, lng: longitude }) : "Current location"))
        .catch(() => "Current location");

  return { lat: latitude, lng: longitude, address };
}