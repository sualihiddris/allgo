import { io, Socket } from "socket.io-client";
import { SOCKET_URL } from "../constants/config";
import { driverAuthService } from "./auth";

class SocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  async connect(): Promise<Socket> {
    if (this.socket?.connected) {
      console.log("Socket already connected");
      return this.socket;
    }

    const token = driverAuthService.getAccessToken();

    if (!token) {
      throw new Error("No auth token available");
    }

    // Convert http://localhost:3000 to ws://localhost:3000
    const socketUrl = SOCKET_URL.replace(/^http/, "ws");

    this.socket = io(socketUrl, {
      auth: { token },
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: this.maxReconnectAttempts,
    });

    this.setupListeners();

    // Wait for the handshake to actually complete - callers that emit
    // immediately after connect() (e.g. sending location) would otherwise
    // race the connection and silently fail.
    return new Promise((resolve, reject) => {
      this.socket!.once("connect", () => resolve(this.socket!));
      this.socket!.once("connect_error", (error) => reject(error));
    });
  }

  private setupListeners() {
    if (!this.socket) return;

    this.socket.on("connect", () => {
      console.log("✅ Socket connected:", this.socket?.id);
      this.reconnectAttempts = 0;
    });

    this.socket.on("disconnect", (reason) => {
      console.log("❌ Socket disconnected:", reason);
    });

    this.socket.on("connect_error", (error) => {
      console.error("Socket connection error:", error.message);
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error("Max reconnection attempts reached");
      }
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  emit(event: string, data?: any) {
    if (!this.socket?.connected) {
      console.warn("Socket not connected, cannot emit:", event);
      return;
    }
    this.socket.emit(event, data);
  }

  on(event: string, callback: (...args: any[]) => void) {
    if (!this.socket) {
      console.warn("Socket not initialized");
      return;
    }
    this.socket.on(event, callback);
  }

  off(event: string, callback?: (...args: any[]) => void) {
    if (!this.socket) return;
    this.socket.off(event, callback);
  }

  // Driver-specific methods
  sendLocation(location: { lat: number; lng: number; heading?: number; speed?: number }) {
    this.emit("driver:location", location);
  }

  acceptTrip(tripId: string) {
    this.emit("trip:accept", tripId);
  }

  declineTrip(tripId: string) {
    this.emit("trip:decline", tripId);
  }

  onTripOffer(callback: (offer: any) => void) {
    this.on("trip:offer", callback);
  }

  onTripConfirmed(callback: (data: any) => void) {
    this.on("trip:confirmed", callback);
  }

  onTripAcceptFailed(callback: (data: any) => void) {
    this.on("trip:accept:failed", callback);
  }
}

export const socketService = new SocketService();
export default socketService;
