/**
 * AllGO MVP Socket.IO Service
 * 
 * Simplified: Trip dispatch only (no delivery)
 */

import { Server as HTTPServer } from "http";
import { Server, Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import { env } from "../config";
import { verifyToken } from "../services/jwt";
import {
  updateDriverLocation,
  findNearbyDrivers,
  isDriverAvailable,
  assignTripToDriver,
  getSearchRadii,
  getJobTimeout,
  isNightServiceHours,
  isVehicleAllowedAtNight,
} from "../services/dispatch";
import { getTripById } from "../services/trip";
import { startTripTracking, registerActiveTrip, unregisterActiveTrip, getActiveTripForDriver } from "../services/tracking";
import { sendPushNotification } from "../services/push";
import { VehicleType } from "@prisma/client";
import { prisma } from "../config/database";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  role?: string;
  // The Driver record's own id - distinct from userId (the User's id).
  // Dispatch (services/dispatch.ts) keys everything off Driver.id, so the
  // driver's socket must join/be matched on that id, not the User id.
  driverId?: string;
  // Resolves once the driver-room join (async DB lookup) below has
  // finished setting driverId - handlers that need driverId await this
  // instead of dropping events that arrive in the brief window right
  // after connect, before the lookup completes.
  driverRoomReady?: Promise<void>;
}

let ioInstance: Server | null = null;

// REST routes (e.g. tracking.ts) need to push events to a customer's room
// when a driver updates trip status outside of any socket event - there's
// only ever one Socket.IO server per process in this MVP, so a module-level
// singleton is enough.
export function getIO(): Server {
  if (!ioInstance) {
    throw new Error("Socket.IO server has not been initialized yet");
  }
  return ioInstance;
}

// Pending job-offer responses, keyed by tripId - not by any specific socket
// object. A driver's socket can disconnect/reconnect (new socket id) between
// an offer being sent and the response arriving (e.g. woken by a push
// notification after the app was backgrounded); resolution must work
// regardless of which physical connection delivers the accept/decline.
// Map.delete()'s return value (and the entry's absence) IS the "already
// resolved" state - no separate boolean needed.
const pendingResponses = new Map<
  string,
  { driverId: string; resolve: (response: "accept" | "decline") => void }
>();

export async function setupSocketIO(httpServer: HTTPServer): Promise<Server> {
  const io = new Server(httpServer, {
    cors: {
      origin: env.NODE_ENV === "production" ? ["https://allgo.com"] : "*",
      credentials: true,
    },
  });
  ioInstance = io;

  // Section 4D: required for Socket.io to work correctly once this runs as
  // multiple backend instances - a no-op single-instance setup otherwise.
  // Skipped entirely when REDIS_URL isn't set (e.g. local/pilot use), since
  // the adapter needs real Redis pub/sub, not the in-memory fallback store.
  if (env.REDIS_URL) {
    const pubClient = new Redis(env.REDIS_URL);
    const subClient = pubClient.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
    console.log("✅ Socket.io Redis adapter attached");
  }

  // Authentication middleware
  //
  // Section 13/15/24: Socket.io must follow the SAME access-token standard
  // as REST. This means:
  //   1. require a token,
  //   2. verify it as type ACCESS (not refresh, not totp_pending) via the
  //      shared verifyToken service - not a raw jsonwebtoken verify that
  //      would accept any signature type,
  //   3. reload the current user from MySQL,
  //   4. reject missing/inactive users,
  //   5. use the CURRENT database role, never the (possibly stale) role
  //      claim baked into the JWT.
  // Driver.id is still resolved separately from User.id on connection
  // (see driverRoomReady below).
  io.use(async (socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error("Authentication required"));
    }

    try {
      const payload = verifyToken(token, "access");

      if (!payload) {
        return next(new Error("Invalid token"));
      }

      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, role: true, isActive: true },
      });

      if (!user || !user.isActive) {
        return next(new Error("User not found or inactive"));
      }

      socket.userId = user.id;
      // Trust the CURRENT database role, not the JWT's role claim.
      socket.role = user.role;
      next();
    } catch (error) {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket: AuthenticatedSocket) => {
    console.log(`✅ Socket connected: ${socket.id} (User: ${socket.userId})`);

    // Driver joins their room - keyed by Driver.id, matching how dispatch
    // addresses drivers everywhere else (see services/dispatch.ts). This
    // is fired (not awaited) here, and all socket.on(...) listeners below
    // are registered synchronously regardless of when it resolves - a
    // location ping sent immediately on connect was previously dropped
    // with no listener to receive it at all, because this lookup used to
    // be awaited inline before any listener got registered. Handlers that
    // depend on socket.driverId (e.g. driver:location below) await
    // driverRoomReady instead, so a ping arriving in this brief window is
    // processed once the lookup resolves rather than silently dropped.
    socket.driverRoomReady = (async () => {
      if (socket.role === "DRIVER") {
        const driver = await prisma.driver.findUnique({ where: { userId: socket.userId } });
        if (driver) {
          socket.driverId = driver.id;
          socket.join(`driver:${driver.id}`);
        }
      }

      // Customer joins their room
      if (socket.role === "CUSTOMER") {
        socket.join(`customer:${socket.userId}`);
      }
    })();

    /**
     * Driver updates their location
     */
    socket.on("driver:location", async (data: { lat: number; lng: number; heading?: number; speed?: number }) => {
      if (socket.role !== "DRIVER") return;
      await socket.driverRoomReady;
      if (!socket.driverId) return;

      try {
        await updateDriverLocation(socket.driverId!, data.lat, data.lng);

        // Broadcast to customers tracking this driver directly
        socket.broadcast.to(`tracking:driver:${socket.driverId}`).emit("driver:location:update", {
          driverId: socket.driverId,
          lat: data.lat,
          lng: data.lng,
          heading: data.heading,
          timestamp: Date.now(),
        });

        // Also broadcast to the active trip room if driver has an active trip
        const activeTripId = await getActiveTripForDriver(socket.driverId!);
        if (activeTripId) {
          socket.broadcast.to(`tracking:trip:${activeTripId}`).emit("driver:location:update", {
            driverId: socket.driverId,
            lat: data.lat,
            lng: data.lng,
            heading: data.heading,
            timestamp: Date.now(),
          });
        }

        console.log(`📍 Driver ${socket.driverId} location: ${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}`);
      } catch (error) {
        console.error("Error updating driver location:", error);
      }
    });

    /**
     * Dispatch a trip — strictly sequential, nearest-driver-first.
     * One driver is offered the job at a time; on decline/timeout the
     * next-nearest driver is tried, expanding the search radius once the
     * current tier is exhausted. See AllGO_Master_Plan.md Section 3.
     */
    socket.on("trip:dispatch", async (tripId: string) => {
      try {
        const trip = await getTripById(tripId);

        if (!trip || trip.status !== "REQUESTED") {
          return socket.emit("trip:dispatch:failed", { tripId, reason: "Invalid trip" });
        }

        const isNight = isNightServiceHours();

        if (isNight && !isVehicleAllowedAtNight(trip.vehicleType)) {
          return socket.emit("trip:dispatch:no_drivers", {
            tripId,
            message: `${trip.vehicleType} service is not available during night hours (9pm-5am). Please try MOTO or KEKE.`,
          });
        }

        const jobTimeoutSeconds = getJobTimeout();
        const triedDriverIds = new Set<string>();

        for (const radius of getSearchRadii()) {
          const candidates = await findNearbyDrivers(
            trip.pickupLat,
            trip.pickupLng,
            trip.vehicleType,
            radius,
            isNight
          );

          for (const candidate of candidates) {
            if (triedDriverIds.has(candidate.driverId)) continue;
            triedDriverIds.add(candidate.driverId);

            const available = await isDriverAvailable(candidate.driverId);
            if (!available) continue;

            console.log(`[Dispatch] Trip ${tripId}: offering to driver ${candidate.driverId} (radius ${radius}m)`);

            // Send job offer to driver - includes MOTO service type info
            io.to(`driver:${candidate.driverId}`).emit("trip:offer", {
              tripId: trip.id,
              vehicleType: trip.vehicleType,
              serviceType: trip.serviceType,
              deliveryType: trip.deliveryType,
              itemDescription: trip.itemDescription,
              pickup: {
                lat: trip.pickupLat,
                lng: trip.pickupLng,
                address: trip.pickupAddress,
              },
              destination: {
                lat: trip.destLat,
                lng: trip.destLng,
                address: trip.destAddress,
              },
              distance: trip.distanceMeters,
              customerName: trip.customer?.user?.name || "Customer",
              customerPhone: trip.customer?.user?.phone || "",
              customerNote: trip.customerNote,
              timeoutSeconds: jobTimeoutSeconds,
            });

            // Wait for this driver's response before trying the next one.
            // Called immediately after the offer emit, with no await in
            // between, so the pendingResponses registry entry exists the
            // instant the driver could possibly respond - any await here
            // (e.g. a pushToken lookup) would open a real race where a
            // fast accept/decline arrives before there's anything to
            // resolve, and silently falls through to a full timeout.
            const responsePromise = waitForDriverResponse(
              candidate.driverId,
              tripId,
              jobTimeoutSeconds
            );

            // Fire-and-forget wake-up push, fully decoupled from the
            // response wait above - unconditional, not gated on "no socket
            // found", since the goal is to wake a backgrounded app before
            // we know whether its socket is still alive (checking first
            // would just reintroduce that race). Never awaited: a slow
            // Expo API call (or the pushToken lookup itself) must not
            // delay - or race - the response registry above.
            prisma.driver
              .findUnique({ where: { id: candidate.driverId }, select: { pushToken: true } })
              .then((candidateDriver) => {
                if (candidateDriver?.pushToken) {
                  return sendPushNotification(
                    candidateDriver.pushToken,
                    "New ride request nearby!",
                    "Open the app to view and respond.",
                    { tripId: trip.id }
                  );
                }
              })
              .catch((error) => console.error("[Push] Failed to send job offer push:", error));

            const response = await responsePromise;

            console.log(`[Dispatch] Trip ${tripId}: driver ${candidate.driverId} responded "${response}"`);

            if (response === "accept") {
              const updatedTrip = await assignTripToDriver(tripId, candidate.driverId);

              // Register trip for location tracking
              await registerActiveTrip(candidate.driverId, tripId);

              socket.emit("trip:accepted", {
                tripId,
                driver: {
                  id: updatedTrip.driver!.id,
                  name: updatedTrip.driver!.user.name,
                  phone: updatedTrip.driver!.user.phone,
                  vehicleType: updatedTrip.driver!.vehicleType,
                  licensePlate: updatedTrip.driver!.licensePlate,
                },
              });

              io.to(`driver:${candidate.driverId}`).emit("trip:confirmed", { tripId });
              return;
            }

            // Declined or timed out — move on to the next-nearest driver
          }
        }

        // All radius tiers exhausted with no acceptance
        const nightMessage = isNight
          ? "No night service drivers available right now. Please try again in a few minutes."
          : "No drivers available nearby. Please try again in a few minutes.";

        socket.emit("trip:dispatch:no_drivers", { tripId, message: nightMessage });
      } catch (error) {
        console.error("Error dispatching trip:", error);
        socket.emit("trip:dispatch:failed", { tripId, reason: "Server error" });
      }
    });

    /**
     * Driver accepts a trip - resolved via the tripId-keyed pendingResponses
     * registry (not a per-socket listener), so this works correctly even if
     * this socket is a reconnect (new id) that woke from a push notification
     * after the original socket that received the offer had already died.
     */
    socket.on("trip:accept", async (tripId: string) => {
      if (socket.role !== "DRIVER") return;

      try {
        const pending = pendingResponses.get(tripId);
        if (!pending || pending.driverId !== socket.driverId) {
          return socket.emit("trip:accept:failed", {
            tripId,
            reason: "Offer expired or no longer available",
          });
        }

        const available = await isDriverAvailable(socket.driverId!);

        if (!available) {
          return socket.emit("trip:accept:failed", { tripId, reason: "Not available" });
        }

        pending.resolve("accept");
        socket.emit("trip:accept:received", { tripId });
      } catch (error) {
        console.error("Error accepting trip:", error);
      }
    });

    /**
     * Driver declines a trip
     */
    socket.on("trip:decline", (tripId: string) => {
      if (socket.role !== "DRIVER") return;

      const pending = pendingResponses.get(tripId);
      if (pending && pending.driverId === socket.driverId) {
        pending.resolve("decline");
      }
      socket.emit("trip:decline:received", { tripId });
    });

    /**
     * Customer tracks trip
     */
    socket.on("trip:track", async (tripId: string) => {
      if (socket.role !== "CUSTOMER") return;

      try {
        const tracking = await startTripTracking(io, tripId, socket.userId!);
        socket.join(tracking.trackingRoom);
        socket.emit("trip:tracking:started", {
          tripId,
          driverId: tracking.driverId,
          currentLocation: tracking.currentLocation,
        });
      } catch (error) {
        console.error("Error starting trip tracking:", error);
        socket.emit("trip:tracking:failed", { tripId, reason: (error as Error).message });
      }
    });

    /**
     * Customer stops tracking trip
     */
    socket.on("trip:track:stop", (tripId: string) => {
      if (socket.role !== "CUSTOMER") return;
      socket.leave(`tracking:trip:${tripId}`);
    });

    socket.on("disconnect", () => {
      console.log(`❌ Socket disconnected: ${socket.id}`);
    });
  });

  return io;
}

/**
 * Wait for driver to accept or decline with timeout.
 *
 * Resolution is keyed by tripId via the module-level pendingResponses map,
 * not by a specific socket object - the driver's "trip:accept"/"trip:decline"
 * handlers (above, in the connection block) resolve whichever entry matches
 * their tripId, regardless of which physical socket connection delivers it.
 * This is what makes the push-notification wake-up path actually work: a
 * driver who reconnects under a brand new socket id after being woken by a
 * push can still have their accept/decline reach this promise.
 */
function waitForDriverResponse(
  driverId: string,
  tripId: string,
  timeoutSeconds: number
): Promise<"accept" | "decline" | "timeout"> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (pendingResponses.delete(tripId)) {
        resolve("timeout");
      }
    }, timeoutSeconds * 1000);

    pendingResponses.set(tripId, {
      driverId,
      resolve: (response) => {
        clearTimeout(timeout);
        pendingResponses.delete(tripId);
        resolve(response);
      },
    });
  });
}
