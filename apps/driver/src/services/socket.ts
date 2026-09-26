import { io, Socket } from "socket.io-client";
import { API_BASE_URL, SOCKET_URL } from "../constants/config";
import { isNightServiceHours, isVehicleAllowedAtNight } from "@allgo/shared/constants/nightService";
import { driverAuthService } from "./auth";
import { useConnectionStore } from "../store/connectionStore";

class SocketService {
  private socket: Socket | null = null;
  private pendingConnection: Promise<Socket> | null = null;
  private pendingConnectionReject: ((error: Error) => void) | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private presenceTimer: ReturnType<typeof setTimeout> | null = null;
  private presenceSequence = 0;
  private presenceRequest: { controller: AbortController } | null = null;
  private retrying: Socket | null = null;
  private refreshedForConnection = false;

  async connect(): Promise<Socket> {
    if (this.socket?.connected) return this.socket;
    if (this.pendingConnection) return this.pendingConnection;
    if (!driverAuthService.getAccessToken()) {
      this.requireSignIn();
      throw new Error("No auth token available");
    }

    // Reuse the socket so offer/cancellation listeners survive transport recovery.
    const socket = this.socket ?? io(SOCKET_URL.replace(/^http/, "ws"), {
      auth: (callback) => callback({ token: driverAuthService.getAccessToken() }),
      transports: ["websocket"],
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      timeout: 10000,
    });
    if (!this.socket) {
      this.socket = socket;
      this.setupListeners(socket);
    }

    const connection = new Promise<Socket>((resolve, reject) => {
      const connected = () => {
        this.pendingConnection = null;
        this.pendingConnectionReject = null;
        resolve(socket);
      };
      this.pendingConnectionReject = (error) => {
        socket.off("connect", connected);
        reject(error);
      };
      socket.once("connect", connected);
    });
    this.pendingConnection = connection;
    // Initial transport failures keep retrying too; cancellation rejects the waiter.
    socket.connect();
    return connection;
  }

  private scheduleRetry(socket: Socket, refreshToken: boolean) {
    if (this.retryTimer || this.retrying === socket) return;
    this.retryTimer = setTimeout(async () => {
      this.retryTimer = null;
      if (this.socket !== socket) return;
      this.retrying = socket;
      try {
        if (refreshToken) {
          const refreshed = await driverAuthService.refreshTokens();
          if (this.socket !== socket) return;
          if (!driverAuthService.getAccessToken()) { this.requireSignIn(); return; }
          this.refreshedForConnection = refreshed;
        }
        if (this.socket === socket) socket.connect();
      } finally {
        if (this.retrying === socket) this.retrying = null;
      }
    }, 5000);
  }

  private requireSignIn() {
    this.disconnect();
    useConnectionStore.setState({ authentication: "required" });
  }

  private setupListeners(socket: Socket) {
    socket.on("connect", () => {
      if (this.socket !== socket) return;
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.retryTimer = null;
      this.refreshedForConnection = false;
      this.invalidatePresence();
      useConnectionStore.setState({ connected: true, authentication: "authenticated", presence: "checking" });
    });
    socket.on("disconnect", (reason) => {
      if (this.socket !== socket) return;
      this.invalidatePresence();
      this.presenceRequest = null;
      useConnectionStore.setState({ connected: false, authentication: "checking" });
      if (reason === "io server disconnect") this.scheduleRetry(socket, false);
    });
    socket.on("connect_error", (error) => {
      if (this.socket !== socket) return;
      this.invalidatePresence();
      useConnectionStore.setState({ connected: false, authentication: "checking" });
      // Middleware rejection does not trigger Socket.IO's transport retries.
      if (!socket.active) {
        if (error.message === "Authentication required" || error.message === "User not found or inactive" ||
          (error.message === "Invalid token" && this.refreshedForConnection)) {
          this.requireSignIn();
        } else this.scheduleRetry(socket, error.message === "Invalid token");
      }
    });
  }

  invalidatePresence() {
    this.presenceSequence++;
    this.presenceRequest?.controller.abort();
    if (this.presenceTimer) clearTimeout(this.presenceTimer);
    this.presenceTimer = null;
    useConnectionStore.setState({ presence: "unavailable" });
  }

  disconnect() {
    this.pendingConnectionReject?.(new Error("Socket disconnected"));
    this.pendingConnection = null;
    this.pendingConnectionReject = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.retrying = null;
    this.refreshedForConnection = false;
    this.socket?.disconnect();
    this.socket = null;
    this.invalidatePresence();
    this.presenceRequest = null;
    useConnectionStore.setState({ connected: false, authentication: "checking" });
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
  sendLocation(location: { lat: number; lng: number; heading?: number; speed?: number }, sampledAt = Date.now()): boolean {
    const socket = this.socket;
    if (!socket?.connected) {
      this.invalidatePresence();
      return false;
    }
    if (this.presenceRequest) return false;
    const sequence = ++this.presenceSequence;
    const request = { controller: new AbortController() };
    this.presenceRequest = request;
    const sentAt = Date.now();
    socket.timeout(10000).emit("driver:location", location, async (
      error: Error | null,
      result?: { success: boolean; readyForDispatch?: boolean }
    ) => {
      try {
        // Ignore late responses from a disconnected session or invalidated GPS.
        if (sequence !== this.presenceSequence || this.socket !== socket || !socket.connected) return;
        let validFor = Math.min(45000, sampledAt + 60000 - Date.now());
        if (error) {
          // Old servers consume driver:location but never acknowledge it. Verify
          // their durable presence and eligibility instead of guessing readiness.
          const legacy = await this.confirmLegacyPresence(location, sentAt, request.controller);
          result = legacy.result;
          validFor = Math.min(validFor, legacy.validUntil - Date.now());
        }
        if (sequence !== this.presenceSequence || this.socket !== socket || !socket.connected) return;
        validFor = Math.min(validFor, sampledAt + 60000 - Date.now());
        if (!result?.success || typeof result.readyForDispatch !== "boolean" || validFor <= 0) {
          this.invalidatePresence();
          return;
        }
        if (this.presenceTimer) clearTimeout(this.presenceTimer);
        useConnectionStore.setState({ presence: result.readyForDispatch ? "ready" : "ineligible" });
        // Expiry clears the previous evidence without rejecting a fresh in-flight sample.
        this.presenceTimer = setTimeout(() => {
          this.presenceTimer = null;
          useConnectionStore.setState({ presence: "unavailable" });
        }, validFor);
      } catch {
        if (sequence === this.presenceSequence) this.invalidatePresence();
      } finally {
        if (this.presenceRequest === request) this.presenceRequest = null;
      }
    });
    return true;
  }

  private async confirmLegacyPresence(
    location: { lat: number; lng: number }, sentAt: number, controller: AbortController
  ): Promise<{ result: { success: boolean; readyForDispatch: boolean }; validUntil: number }> {
    let rejectCancelled!: (error: Error) => void;
    const cancelled = new Promise<never>((_, reject) => { rejectCancelled = reject; });
    const abort = () => rejectCancelled(new Error("Presence verification timed out or cancelled"));
    controller.signal.addEventListener("abort", abort);
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      if (controller.signal.aborted) { abort(); return await cancelled; }
      const verify = async () => {
        const read = async (path: string) => {
          if (controller.signal.aborted) throw new Error("Presence verification cancelled");
          const response = await driverAuthService.authenticatedFetch(`${API_BASE_URL}${path}`, { signal: controller.signal });
          if (!response.ok) throw new Error("Presence verification unavailable");
          return (await response.json()).data;
        };
        const profile = await read("/auth/me");
        const driver = profile?.driver;
        const stored = JSON.parse(driver?.lastLocation ?? "null");
        const timestamp = typeof stored?.timestamp === "number" ? stored.timestamp : Date.parse(stored?.timestamp);
        const now = Date.now();
        // The old API exposes the driver's own durable snapshot. Require matching
        // coordinates and a recent publication; tolerate at most 30s clock skew.
        if (!stored || !Number.isFinite(timestamp) || timestamp < sentAt - 30000 || timestamp > now + 30000 ||
          Math.abs(stored.lat - location.lat) > 0.000001 || Math.abs(stored.lng - location.lng) > 0.000001 ||
          !Number.isFinite(stored.lat) || !Number.isFinite(stored.lng)) throw new Error("Presence not confirmed");
        const active = await read("/driver/trips/active");
        if (!Array.isArray(active?.trips)) throw new Error("Trip availability not confirmed");
        const periodEnd = Date.parse(driver.subscriptionPeriodEnd);
        const readyForDispatch = driver.isOnline === true && driver.isApproved === true &&
          driver.subscriptionStatus === "ACTIVE" && periodEnd > Date.now() && active.trips.length === 0 &&
          (!isNightServiceHours() || (driver.nightMode === true && isVehicleAllowedAtNight(driver.vehicleType)));
        return { result: { success: true, readyForDispatch }, validUntil: readyForDispatch
          ? Math.min(timestamp + 45000, periodEnd) : timestamp + 45000 };
      };
      return await Promise.race([verify(), cancelled]);
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener("abort", abort);
    }
  }

  acceptTrip(tripId: string, offerId: string) {
    this.emit("trip:accept", { tripId, offerId });
  }

  declineTrip(tripId: string, offerId: string) {
    this.emit("trip:decline", { tripId, offerId });
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
  onTripCancelled(
    callback: (data: {
      tripId: string;
      reason?: string;
    }) => void
  ): () => void {
    this.on("trip:cancelled", callback);
    return () =>
      this.off("trip:cancelled", callback);
  }
}

export const socketService = new SocketService();
export default socketService;
