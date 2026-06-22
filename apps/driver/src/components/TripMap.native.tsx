/**
 * Real map for active-job.tsx - iOS/Android only. No .web.tsx counterpart
 * exists for this one: active-job.tsx already guards its usage behind
 * Platform.OS !== "web" and falls back to the existing text-based route
 * card on web, exactly as it did before this map was added.
 */

import { useEffect, useRef } from "react";
import { View, StyleSheet } from "react-native";
import MapView, { Marker, Polyline, Region } from "react-native-maps";
import { DriverTheme, SPACING } from "../constants/config";

export interface TripMapPoint {
  lat: number;
  lng: number;
  address?: string;
}

interface TripMapProps {
  pickup: TripMapPoint;
  destination: TripMapPoint;
  theme: DriverTheme;
}

const PADDING_RATIO = 1.6;
const MIN_DELTA = 0.01;

function regionFromPoints(points: { lat: number; lng: number }[]): Region {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * PADDING_RATIO, MIN_DELTA),
    longitudeDelta: Math.max((maxLng - minLng) * PADDING_RATIO, MIN_DELTA),
  };
}

export default function TripMap({ pickup, destination, theme }: TripMapProps) {
  const mapRef = useRef<MapView>(null);
  const region = regionFromPoints([pickup, destination]);

  useEffect(() => {
    mapRef.current?.animateToRegion(region, 500);
  }, [JSON.stringify(region)]);

  return (
    <View style={styles.mapWrapper}>
      <MapView ref={mapRef} style={styles.map} initialRegion={region}>
        <Polyline
          coordinates={[
            { latitude: pickup.lat, longitude: pickup.lng },
            { latitude: destination.lat, longitude: destination.lng },
          ]}
          strokeColor={theme.primary}
          strokeWidth={3}
          lineDashPattern={[8, 6]}
        />
        <Marker
          coordinate={{ latitude: pickup.lat, longitude: pickup.lng }}
          pinColor={theme.primary}
          title="Pickup"
          description={pickup.address}
        />
        <Marker
          coordinate={{ latitude: destination.lat, longitude: destination.lng }}
          pinColor={theme.error}
          title="Destination"
          description={destination.address}
        />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  mapWrapper: {
    height: 220,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: SPACING.md,
  },
  map: {
    flex: 1,
  },
});
