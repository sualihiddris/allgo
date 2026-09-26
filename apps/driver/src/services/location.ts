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
  private trackingHeartbeat: ReturnType<typeof setInterval> | null = null;
  private isTracking = false;
  private lastSentLocation: LocationData | null = null;
  private updateInterval = 5000; // Send updates every 5 seconds
  private minDistanceMeters = 10; // Only send if moved > 10 meters
  private heartbeatInterval = 30000;
  private trackingGeneration = 0;
  private pendingStart: Promise<boolean> | null = null;
  private refreshing = false;
  private pendingLocation: Promise<LocationData | null> | null = null;

  private getDevelopmentTestLocation(): LocationData | null {
    if (!__DEV__ || Platform.OS !== "web") return null;

    const latValue = process.env.EXPO_PUBLIC_DRIVER_TEST_LAT?.trim();
    const lngValue = process.env.EXPO_PUBLIC_DRIVER_TEST_LNG?.trim();
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

    return { lat, lng, timestamp: Date.now() };
  }

  private startTrackingHeartbeat(): void {
    if (this.trackingHeartbeat) return;

    this.trackingHeartbeat = setInterval(() => {
      if (this.isTracking) void this.refreshLocation();
    }, this.heartbeatInterval);
  }

  // A heartbeat must sample GPS, not make old coordinates look newly observed.
  async refreshLocation(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    const generation = this.trackingGeneration;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const location = await Promise.race([
        this.getCurrentLocation(),
        new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 10000); }),
      ]);
      if (generation !== this.trackingGeneration) return;
      if (location) this.sendLocationUpdate(location);
      else socketService.invalidatePresence();
    } finally {
      if (timer) clearTimeout(timer);
      this.refreshing = false;
    }
  }

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
    const testLocation = this.getDevelopmentTestLocation();
    if (testLocation) {
      console.log("Development web test-location mode active");
      return testLocation;
    }

    // Expo's native GPS request cannot be aborted. Reuse an outstanding request
    // rather than accumulating native requests if location services stall.
    if (this.pendingLocation) return this.pendingLocation;
    const request = this.readCurrentLocation();
    this.pendingLocation = request;
    try { return await request; }
    finally { if (this.pendingLocation === request) this.pendingLocation = null; }
  }

  private async readCurrentLocation(): Promise<LocationData | null> {
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
    if (this.pendingStart) return this.pendingStart;
    const start = this.startTrackingInternal();
    this.pendingStart = start;
    try {
      return await start;
    } finally {
      if (this.pendingStart === start) this.pendingStart = null;
    }
  }

  private async startTrackingInternal(): Promise<boolean> {
    const generation = this.trackingGeneration;
    if (this.isTracking) {
      console.log("Already tracking location");
      return true;
    }

    const testLocation = this.getDevelopmentTestLocation();
    if (testLocation) {
      console.log("Development web test-location mode active");
      this.isTracking = true;
      this.sendLocationUpdate(testLocation);
      this.startTrackingHeartbeat();
      console.log("✅ Location tracking started");
      return true;
    }

    const hasPermission = await this.requestPermissions();
    if (generation !== this.trackingGeneration) return false;
    if (!hasPermission) {
      socketService.invalidatePresence();
      return false;
    }

    try {
      const watch = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: this.updateInterval,
          distanceInterval: this.minDistanceMeters,
        },
        (location) => {
          if (generation !== this.trackingGeneration) return;
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

      if (generation !== this.trackingGeneration) {
        watch.remove();
        return false;
      }
      this.watchId = watch;

      this.isTracking = true;
      this.startTrackingHeartbeat();
      void this.refreshLocation();
      console.log("✅ Location tracking started");
      return true;
    } catch (error) {
      if (generation === this.trackingGeneration) socketService.invalidatePresence();
      console.error("Error starting location tracking:", error);
      return false;
    }
  }

  /**
   * Stop watching location
   */
  stopTracking(): void {
    this.trackingGeneration++;
    this.pendingStart = null;
    socketService.invalidatePresence();
    if (this.trackingHeartbeat) {
      clearInterval(this.trackingHeartbeat);
      this.trackingHeartbeat = null;
    }

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
    if (!Number.isFinite(location.timestamp) || Date.now() - location.timestamp > 60000 || location.timestamp > Date.now() + 30000) {
      socketService.invalidatePresence();
      return;
    }
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
    const sent = socketService.sendLocation({
      lat: location.lat,
      lng: location.lng,
      heading: location.heading,
      speed: location.speed,
    }, location.timestamp);

    if (!sent) return;

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
