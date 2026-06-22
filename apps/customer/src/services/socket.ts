/**
 * AllGO Customer Socket Service
 * 
 * Real-time connection for:
 * - Trip status updates
 * - Driver location tracking
 * - Trip dispatch
 */

import { io, Socket } from "socket.io-client";
import { API_URL } from "../constants/config";
import { authService } from "./auth";

export interface DriverLocation {
  lat: number;
  lng: number;
  heading?: number;
  timestamp?: number;
}

export interface TripAcceptedData {
  tripId: string;
  driver: {
    id: string;
    name: string;
    phone: string;
    vehicleType: string;
    licensePlate: string;
  };
}

export interface TripStatusData {
  tripId: string;
  status: string;
  [key: string]: any;
}

class SocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private locationCallbacks: ((location: DriverLocation) => void)[] = [];
  private statusCallbacks: ((data: TripStatusData) => void)[] = [];

  async connect(): Promise<Socket | null> {
    if (this.socket?.connected) {
      console.log("Socket already connected");
      return this.socket;
    }

    const token = authService.getAccessToken();
    
    if (!token) {
      console.warn("No auth token, cannot connect socket");
      return null;
    }

    const socketUrl = API_URL.replace("/api/v1", "").replace(/^http/, "ws");

    this.socket = io(socketUrl, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: this.maxReconnectAttempts,
    });

    this.setupListeners();
    
    return new Promise((resolve) => {
      if (!this.socket) return resolve(null);
      
      this.socket.on("connect", () => {
        resolve(this.socket);
      });

      this.socket.on("connect_error", () => {
        resolve(null);
      });

      // Timeout after 5 seconds
      setTimeout(() => resolve(this.socket), 5000);
    });
  }

  private setupListeners() {
    if (!this.socket) return;

    this.socket.on("connect", () => {
      console.log("✅ Customer socket connected:", this.socket?.id);
      this.reconnectAttempts = 0;
    });

    this.socket.on("disconnect", (reason) => {
      console.log("❌ Socket disconnected:", reason);
    });

    this.socket.on("connect_error", (error) => {
      console.error("Socket connection error:", error.message);
      this.reconnectAttempts++;
    });

    // Driver location updates
    this.socket.on("driver:location:update", (data: DriverLocation & { driverId?: string }) => {
      this.locationCallbacks.forEach(cb => cb({
        lat: data.lat,
        lng: data.lng,
        heading: data.heading,
        timestamp: Date.now(),
      }));
    });

    // Trip status updates
    this.socket.on("trip:status", (data: TripStatusData) => {
      this.statusCallbacks.forEach(cb => cb(data));
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.locationCallbacks = [];
    this.statusCallbacks = [];
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  // Dispatch a trip to find drivers
  dispatchTrip(tripId: string) {
    this.socket?.emit("trip:dispatch", tripId);
  }

  // Start tracking a trip's driver
  startTracking(tripId: string) {
    this.socket?.emit("trip:track", tripId);
  }

  // Stop tracking
  stopTracking(tripId: string) {
    this.socket?.emit("trip:track:stop", tripId);
  }

  // Event listeners
  onTripAccepted(callback: (data: TripAcceptedData) => void) {
    this.socket?.on("trip:accepted", callback);
    return () => this.socket?.off("trip:accepted", callback);
  }

  onTripNoDrivers(callback: (data: { tripId: string; message?: string }) => void) {
    this.socket?.on("trip:dispatch:no_drivers", callback);
    return () => this.socket?.off("trip:dispatch:no_drivers", callback);
  }

  onTripFailed(callback: (data: { tripId: string; reason: string }) => void) {
    this.socket?.on("trip:dispatch:failed", callback);
    return () => this.socket?.off("trip:dispatch:failed", callback);
  }

  onDriverLocation(callback: (location: DriverLocation) => void) {
    this.locationCallbacks.push(callback);
    return () => {
      this.locationCallbacks = this.locationCallbacks.filter(cb => cb !== callback);
    };
  }

  onTripStatus(callback: (data: TripStatusData) => void) {
    this.statusCallbacks.push(callback);
    return () => {
      this.statusCallbacks = this.statusCallbacks.filter(cb => cb !== callback);
    };
  }

  onTrackingStarted(callback: (data: { tripId: string; driverId: string; currentLocation: DriverLocation | null }) => void) {
    this.socket?.on("trip:tracking:started", callback);
    return () => this.socket?.off("trip:tracking:started", callback);
  }

  onTrackingFailed(callback: (data: { tripId: string; reason: string }) => void) {
    this.socket?.on("trip:tracking:failed", callback);
    return () => this.socket?.off("trip:tracking:failed", callback);
  }
}

export const socketService = new SocketService();
export default socketService;
