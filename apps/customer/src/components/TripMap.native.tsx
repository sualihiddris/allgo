/**
 * Real map for active-trip.tsx - iOS/Android only (resolved by Metro via
 * the .native.tsx extension). See TripMap.web.tsx for the web fallback.
 */

import { useEffect, useRef } from "react";
import { StyleSheet } from "react-native";
import MapView, { Marker, Polyline, Region } from "react-native-maps";
import { useTheme } from "../hooks/useTheme";

export interface TripMapPoint {
  lat: number;
  lng: number;
  address?: string;
}

export interface DriverLocation {
  lat: number;
  lng: number;
  heading?: number;
  timestamp?: number;
}

interface TripMapProps {
  driverLocation: DriverLocation | null;
  pickup: TripMapPoint | null;
  destination: TripMapPoint | null;
}

const PADDING_RATIO = 1.6;
const MIN_DELTA = 0.01;

function regionFromPoints(points: { lat: number; lng: number }[]): Region | null {
  if (points.length === 0) return null;

  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const latitude = (minLat + maxLat) / 2;
  const longitude = (minLng + maxLng) / 2;
  const latitudeDelta = Math.max((maxLat - minLat) * PADDING_RATIO, MIN_DELTA);
  const longitudeDelta = Math.max((maxLng - minLng) * PADDING_RATIO, MIN_DELTA);

  return { latitude, longitude, latitudeDelta, longitudeDelta };
}

export default function TripMap({ driverLocation, pickup, destination }: TripMapProps) {
  const theme = useTheme();
  const mapRef = useRef<MapView>(null);

  const points = [
    pickup && { lat: pickup.lat, lng: pickup.lng },
    destination && { lat: destination.lat, lng: destination.lng },
    driverLocation && { lat: driverLocation.lat, lng: driverLocation.lng },
  ].filter((p): p is { lat: number; lng: number } => !!p);

  const region = regionFromPoints(points);

  useEffect(() => {
    if (region) {
      mapRef.current?.animateToRegion(region, 500);
    }
  }, [JSON.stringify(region)]);

  return (
    <MapView
      ref={mapRef}
      style={styles.map}
      initialRegion={
        region ?? {
          latitude: pickup?.lat ?? 0,
          longitude: pickup?.lng ?? 0,
          latitudeDelta: MIN_DELTA,
          longitudeDelta: MIN_DELTA,
        }
      }
    >
      {pickup && destination && (
        <Polyline
          coordinates={[
            { latitude: pickup.lat, longitude: pickup.lng },
            { latitude: destination.lat, longitude: destination.lng },
          ]}
          strokeColor={theme.primary}
          strokeWidth={3}
          lineDashPattern={[8, 6]}
        />
      )}

      {pickup && (
        <Marker
          coordinate={{ latitude: pickup.lat, longitude: pickup.lng }}
          pinColor={theme.primary}
          title="Pickup"
          description={pickup.address}
        />
      )}

      {destination && (
        <Marker
          coordinate={{ latitude: destination.lat, longitude: destination.lng }}
          pinColor={theme.error}
          title="Drop-off"
          description={destination.address}
        />
      )}

      {driverLocation && (
        <Marker
          coordinate={{ latitude: driverLocation.lat, longitude: driverLocation.lng }}
          title="Driver"
          rotation={driverLocation.heading ?? 0}
          flat
        />
      )}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
});
