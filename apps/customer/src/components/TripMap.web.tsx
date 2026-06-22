/**
 * Web fallback for TripMap - react-native-maps has no web support, so this
 * file (resolved by Metro via the .web.tsx extension, never bundled for
 * native) renders the same animated, schematic visualization that used to
 * live inline in active-trip.tsx as "MapPlaceholder". See TripMap.native.tsx
 * for the real MapView used on iOS/Android.
 */

import { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import { CustomerTheme } from "../constants/config";
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

export default function TripMap({ driverLocation, pickup, destination }: TripMapProps) {
  const theme = useTheme();
  const styles = createStyles(theme);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (driverLocation) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [driverLocation]);

  return (
    <View style={styles.mapContainer}>
      <View style={styles.mapPlaceholder}>
        {/* Grid lines for visual effect */}
        <View style={styles.gridOverlay}>
          {[...Array(5)].map((_, i) => (
            <View key={`h-${i}`} style={[styles.gridLine, { top: `${(i + 1) * 16.6}%` }]} />
          ))}
          {[...Array(5)].map((_, i) => (
            <View key={`v-${i}`} style={[styles.gridLineVertical, { left: `${(i + 1) * 16.6}%` }]} />
          ))}
        </View>

        {/* Pickup marker */}
        {pickup && (
          <View style={[styles.marker, styles.pickupMarker, { top: "30%", left: "25%" }]}>
            <Text style={styles.markerText}>📍</Text>
            <Text style={styles.markerLabel}>Pickup</Text>
          </View>
        )}

        {/* Destination marker */}
        {destination && (
          <View style={[styles.marker, styles.destMarker, { top: "60%", left: "70%" }]}>
            <Text style={styles.markerText}>🎯</Text>
            <Text style={styles.markerLabel}>Drop-off</Text>
          </View>
        )}

        {/* Driver marker with pulse animation */}
        {driverLocation && (
          <Animated.View
            style={[
              styles.driverMarker,
              {
                top: "45%",
                left: "45%",
                transform: [{ scale: pulseAnim }],
              },
            ]}
          >
            <Text style={styles.driverIcon}>🚗</Text>
          </Animated.View>
        )}

        {/* Live indicator */}
        {driverLocation && (
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function createStyles(theme: CustomerTheme) {
  return StyleSheet.create({
    mapContainer: {
      flex: 1,
    },
    mapPlaceholder: {
      flex: 1,
      backgroundColor: theme.primaryPale,
      position: "relative",
      overflow: "hidden",
    },
    gridOverlay: {
      ...StyleSheet.absoluteFillObject,
    },
    gridLine: {
      position: "absolute",
      left: 0,
      right: 0,
      height: 1,
      backgroundColor: theme.mapTint,
    },
    gridLineVertical: {
      position: "absolute",
      top: 0,
      bottom: 0,
      width: 1,
      backgroundColor: theme.mapTint,
    },
    marker: {
      position: "absolute",
      alignItems: "center",
    },
    pickupMarker: {},
    destMarker: {},
    markerText: {
      fontSize: 28,
    },
    markerLabel: {
      fontSize: 10,
      color: theme.deep,
      fontWeight: "600",
      backgroundColor: theme.inverseStrong,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    driverMarker: {
      position: "absolute",
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: theme.primary,
      justifyContent: "center",
      alignItems: "center",
      shadowColor: theme.deep,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 8,
    },
    driverIcon: {
      fontSize: 24,
    },
    liveIndicator: {
      position: "absolute",
      top: 16,
      right: 16,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.overlayStrong,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 16,
    },
    liveDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.error,
      marginRight: 6,
    },
    liveText: {
      color: theme.textInverse,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1,
    },
  });
}
