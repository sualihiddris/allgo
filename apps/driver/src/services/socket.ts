import { io, Socket } from "socket.io-client";
import { SOCKET_URL } from "../constants/config";
import { driverAuthService } from "./auth";

class SocketService {
  private socket: Socket | null = null;
  private pendingConnection: Promise<Socket> | null = null;
  private pendingConnectionReject: ((error: Error) => void) | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  async connect(): Promise<Socket> {
    if (this.socket?.connected) {
      console.log("Socket already connected");
      return this.socket;
    }

    if (this.pendingConnection) {
      return this.pendingConnection;
    }

    const token = driverAuthService.getAccessToken();

    if (!token) {
      throw new Error("No auth token available");
    }

    // Convert http://localhost:3000 to ws://localhost:3000
    const socketUrl = SOCKET_URL.replace(/^http/, "ws");

    const socket = io(socketUrl, {
      auth: { token },
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: this.maxReconnectAttempts,
    });

    this.socket = socket;
    this.setupListeners(socket);

    // Wait for the handshake to actually complete - callers that emit
    // immediately after connect() (e.g. sending location) would otherwise
    // race the connection and silently fail.
    const connection = new Promise<Socket>((resolve, reject) => {
      this.pendingConnectionReject = (error) => reject(error);
      socket.once("connect", () => resolve(socket));
      socket.once("connect_error", (error) => reject(error));
    });

    this.pendingConnection = connection;

    connection.catch(() => {
      if (this.socket === socket) {
        socket.disconnect();
        this.socket = null;
      }
    }).finally(() => {
      if (this.pendingConnection === connection) {
        this.pendingConnection = null;
        this.pendingConnectionReject = null;
      }
    });

    return connection;
  }

  private setupListeners(socket: Socket) {

    socket.on("connect", () => {
      console.log("✅ Socket connected:", socket.id);
      this.reconnectAttempts = 0;
    });

    socket.on("disconnect", (reason) => {
      console.log("❌ Socket disconnected:", reason);
    });

    socket.on("connect_error", (error) => {
      console.error("Socket connection error:", error.message);
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error("Max reconnection attempts reached");
      }
    });
  }

  disconnect() {
    if (this.pendingConnectionReject) {
      this.pendingConnectionReject(new Error("Socket disconnected"));
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.pendingConnection = null;
    this.pendingConnectionReject = null;
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

  onTripOffer(callback: (offer: any) => void): () => void {
    this.on("trip:offer", callback);
    return () => this.off("trip:offer", callback);
  }

  onTripConfirmed(callback: (data: any) => void): () => void {
    this.on("trip:confirmed", callback);
    return () => this.off("trip:confirmed", callback);
  }

  onTripAcceptFailed(callback: (data: any) => void): () => void {
    this.on("trip:accept:failed", callback);
    return () => this.off("trip:accept:failed", callback);
  }
}

export const socketService = new SocketService();
export default socketService;
