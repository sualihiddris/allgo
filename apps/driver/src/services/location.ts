/**
 * AllGO Driver Location Service
 * 
 * Handles:
 * - Background location tracking
 * - Sending location updates to server via socket
 * - Location permissions
 */

import * as Location from "expo-location";
import { Platform } from "react-native";
import socketService from "./socket";

export interface LocationData {
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  accuracy?: number;
  timestamp: number;
}

class LocationService {
  private watchId: Location.LocationSubscription | null = null;
  private isTracking = false;
  private lastSentLocation: LocationData | null = null;
  private updateInterval = 5000; // Send updates every 5 seconds
  private minDistanceMeters = 10; // Only send if moved > 10 meters

  /**
   * Request location permissions
   */
  async requestPermissions(): Promise<boolean> {
    try {
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      
      if (foregroundStatus !== "granted") {
        console.warn("Foreground location permission denied");
        return false;
      }

      // For background tracking during trips (iOS requires this separately)
      if (Platform.OS !== "web") {
        const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
        if (backgroundStatus !== "granted") {
          console.warn("Background location permission denied - tracking will only work while app is open");
        }
      }

      return true;
    } catch (error) {
      console.error("Error requesting location permissions:", error);
      return false;
    }
  }

  /**
   * Get current location
   */
  async getCurrentLocation(): Promise<LocationData | null> {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) return null;

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      return {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        heading: location.coords.heading ?? undefined,
        speed: location.coords.speed ?? undefined,
        accuracy: location.coords.accuracy ?? undefined,
        timestamp: location.timestamp,
      };
    } catch (error) {
      console.error("Error getting current location:", error);
      return null;
    }
  }

  /**
   * Start watching location and sending updates
   */
  async startTracking(): Promise<boolean> {
    if (this.isTracking) {
      console.log("Already tracking location");
      return true;
    }

    const hasPermission = await this.requestPermissions();
    if (!hasPermission) return false;

    try {
      this.watchId = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: this.updateInterval,
          distanceInterval: this.minDistanceMeters,
        },
        (location) => {
          const locationData: LocationData = {
            lat: location.coords.latitude,
            lng: location.coords.longitude,
            heading: location.coords.heading ?? undefined,
            speed: location.coords.speed ?? undefined,
            accuracy: location.coords.accuracy ?? undefined,
            timestamp: location.timestamp,
          };

          this.sendLocationUpdate(locationData);
        }
      );

      this.isTracking = true;
      console.log("✅ Location tracking started");
      return true;
    } catch (error) {
      console.error("Error starting location tracking:", error);
      return false;
    }
  }

  /**
   * Stop watching location
   */
  stopTracking(): void {
    if (this.watchId) {
      this.watchId.remove();
      this.watchId = null;
    }
    this.isTracking = false;
    this.lastSentLocation = null;
    console.log("❌ Location tracking stopped");
  }

  /**
   * Send location update to server
   */
  private sendLocationUpdate(location: LocationData): void {
    // Throttle updates - don't send if too close to last update
    if (this.lastSentLocation) {
      const distance = this.calculateDistance(
        this.lastSentLocation.lat,
        this.lastSentLocation.lng,
        location.lat,
        location.lng
      );

      const timeSinceLastUpdate = location.timestamp - this.lastSentLocation.timestamp;

      // Skip if moved less than 10m and less than 5s since last update
      if (distance < this.minDistanceMeters && timeSinceLastUpdate < this.updateInterval) {
        return;
      }
    }

    // Send via socket
    socketService.sendLocation({
      lat: location.lat,
      lng: location.lng,
      heading: location.heading,
      speed: location.speed,
    });

    this.lastSentLocation = location;
    console.log(`📍 Location sent: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`);
  }

  /**
   * Calculate distance between two points in meters (Haversine)
   */
  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371e3; // Earth radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Check if currently tracking
   */
  isCurrentlyTracking(): boolean {
    return this.isTracking;
  }
}

export const locationService = new LocationService();
export default locationService;
