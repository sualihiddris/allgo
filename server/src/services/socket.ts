/**
 * AllGO MVP Socket.IO Service
 * 
 * Simplified: Trip dispatch only (no delivery)
 */

import { Server as HTTPServer } from "http";
import { randomUUID } from "crypto";
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

const DISPATCH_CLAIM_LEASE_MS = 5 * 60 * 1000;

export type DispatchTripResult =
  | {
      status: "ACCEPTED";
      driver: {
        id: string;
        name: string | null;
        phone: string;
        vehicleType: VehicleType;
        licensePlate: string | null;
      };
    }
  | { status: "NO_DRIVERS"; message: string }
  | { status: "IN_PROGRESS"; reason: string }
  | { status: "FAILED"; reason: string };

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

type DriverOfferResponse = "accept" | "decline";

interface DriverOfferReplyPayload {
  tripId: string;
  offerId: string;
}

interface DistributedDriverResponse extends DriverOfferReplyPayload {
  driverId: string;
  response: DriverOfferResponse;
}

// The Promise remains local to the dispatch owner, while responses can arrive
// on any backend instance and are relayed through Socket.IO's Redis adapter.
// offerId prevents an old response from resolving a newer offer for the same
// trip and driver.
const pendingResponses = new Map<
  string,
  {
    tripId: string;
    driverId: string;
    resolve: (response: DriverOfferResponse) => void;
  }
>();

function resolvePendingDriverResponse(event: DistributedDriverResponse): boolean {
  const pending = pendingResponses.get(event.offerId);

  if (
    !pending ||
    pending.tripId !== event.tripId ||
    pending.driverId !== event.driverId
  ) {
    return false;
  }

  pending.resolve(event.response);
  return true;
}

function relayDriverResponse(io: Server, event: DistributedDriverResponse): boolean {
  const resolvedLocally = resolvePendingDriverResponse(event);

  if (env.REDIS_URL) {
    io.serverSideEmit("dispatch:driver-response", event);
  }

  return resolvedLocally;
}

const inFlightDispatches = new Map<string, Promise<DispatchTripResult>>();

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

  io.on("dispatch:driver-response", (event: DistributedDriverResponse) => {
    resolvePendingDriverResponse(event);
  });

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
      const result = await dispatchTrip(tripId);
      if (result.status === "ACCEPTED") {
        socket.emit("trip:accepted", { tripId, driver: result.driver });
      } else if (result.status === "NO_DRIVERS") {
        socket.emit("trip:dispatch:no_drivers", { tripId, message: result.message });
      } else if (result.status === "FAILED") {
        socket.emit("trip:dispatch:failed", { tripId, reason: result.reason });
      }
    });

    /**
     * Driver accepts a specific offer.
     */
    socket.on("trip:accept", async (payload: DriverOfferReplyPayload) => {
      if (socket.role !== "DRIVER") return;

      await socket.driverRoomReady;

      const tripId = payload?.tripId;
      const offerId = payload?.offerId;

      if (
        !socket.driverId ||
        typeof tripId !== "string" ||
        typeof offerId !== "string" ||
        !tripId ||
        !offerId
      ) {
        return socket.emit("trip:accept:failed", {
          tripId,
          offerId,
          reason: "Offer expired or no longer available",
        });
      }

      try {
        const available = await isDriverAvailable(socket.driverId);

        if (!available) {
          return socket.emit("trip:accept:failed", {
            tripId,
            offerId,
            reason: "Not available",
          });
        }

        const resolvedLocally = relayDriverResponse(io, {
          tripId,
          offerId,
          driverId: socket.driverId,
          response: "accept",
        });

        if (!env.REDIS_URL && !resolvedLocally) {
          return socket.emit("trip:accept:failed", {
            tripId,
            offerId,
            reason: "Offer expired or no longer available",
          });
        }

        socket.emit("trip:accept:received", { tripId, offerId });
      } catch (error) {
        console.error("Error accepting trip:", error);
        socket.emit("trip:accept:failed", {
          tripId,
          offerId,
          reason: "Unable to process response",
        });
      }
    });

    /**
     * Driver declines a specific offer.
     */
    socket.on("trip:decline", async (payload: DriverOfferReplyPayload) => {
      if (socket.role !== "DRIVER") return;

      await socket.driverRoomReady;

      const tripId = payload?.tripId;
      const offerId = payload?.offerId;

      if (
        !socket.driverId ||
        typeof tripId !== "string" ||
        typeof offerId !== "string" ||
        !tripId ||
        !offerId
      ) {
        return;
      }

      try {
        relayDriverResponse(io, {
          tripId,
          offerId,
          driverId: socket.driverId,
          response: "decline",
        });
        socket.emit("trip:decline:received", { tripId, offerId });
      } catch (error) {
        console.error("Error declining trip:", error);
      }
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

export function dispatchTrip(tripId: string): Promise<DispatchTripResult> {
  const existingDispatch = inFlightDispatches.get(tripId);
  if (existingDispatch) {
    return existingDispatch;
  }

  const currentDispatch = dispatchTripInternal(tripId);
  inFlightDispatches.set(tripId, currentDispatch);
  void currentDispatch.then(
    () => {
      if (inFlightDispatches.get(tripId) === currentDispatch) {
        inFlightDispatches.delete(tripId);
      }
    },
    () => {
      if (inFlightDispatches.get(tripId) === currentDispatch) {
        inFlightDispatches.delete(tripId);
      }
    }
  );
  return currentDispatch;
}

async function resolveDispatchOwnershipLoss(
  tripId: string,
  inProgressReason: string,
  failedReason: string
): Promise<DispatchTripResult> {
  try {
    const currentTrip = await getTripById(tripId);

    if (
      currentTrip?.status === "REQUESTED" &&
      currentTrip.driverId === null &&
      currentTrip.dispatchStatus === "SEARCHING"
    ) {
      return {
        status: "IN_PROGRESS",
        reason: inProgressReason,
      };
    }
  } catch (error) {
    console.error(
      `[Dispatch] Failed to re-read trip ${tripId} after ownership loss:`,
      error
    );
  }

  return {
    status: "FAILED",
    reason: failedReason,
  };
}

async function dispatchTripInternal(tripId: string): Promise<DispatchTripResult> {
  let dispatchClaimToken: string | null = null;

  try {
    const io = getIO();
    const trip = await getTripById(tripId);

    if (!trip || trip.status !== "REQUESTED") {
      return { status: "FAILED", reason: "Invalid trip" };
    }

    const claimToken = randomUUID();
    const claimedAt = new Date();
    const staleBefore = new Date(
      claimedAt.getTime() - DISPATCH_CLAIM_LEASE_MS
    );

    const dispatchClaim = await prisma.trip.updateMany({
      where: {
        id: tripId,
        status: "REQUESTED",
        driverId: null,
        OR: [
          { dispatchStatus: null },
          { dispatchStatus: "NO_DRIVER_FOUND" },
          { dispatchStatus: "FAILED" },
          {
            dispatchStatus: "SEARCHING",
            OR: [
              { dispatchClaimToken: null },
              { dispatchClaimedAt: null },
              { dispatchClaimedAt: { lt: staleBefore } },
            ],
          },
        ],
      },
      data: {
        dispatchStatus: "SEARCHING",
        dispatchClaimToken: claimToken,
        dispatchClaimedAt: claimedAt,
      },
    });

    if (dispatchClaim.count === 0) {
      return resolveDispatchOwnershipLoss(
        tripId,
        "Trip dispatch is already in progress",
        "Trip is no longer available for dispatch"
      );
    }

    dispatchClaimToken = claimToken;

    const persistNoDrivers = async (
      message: string
    ): Promise<DispatchTripResult> => {
      const noDriverPersist = await prisma.trip.updateMany({
        where: {
          id: tripId,
          status: "REQUESTED",
          driverId: null,
          dispatchStatus: "SEARCHING",
          dispatchClaimToken: claimToken,
        },
        data: {
          dispatchStatus: "NO_DRIVER_FOUND",
          dispatchClaimToken: null,
          dispatchClaimedAt: null,
        },
      });

      if (noDriverPersist.count === 0) {
        return resolveDispatchOwnershipLoss(
          tripId,
          "Trip dispatch ownership changed",
          "Trip is no longer available for dispatch"
        );
      }

      return { status: "NO_DRIVERS", message };
    };

    const isNight = isNightServiceHours();

    if (isNight && !isVehicleAllowedAtNight(trip.vehicleType)) {
      return persistNoDrivers(
        `${trip.vehicleType} service is not available during night hours (9pm-5am). Please try MOTO or KEKE.`
      );
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

        // Heartbeat immediately before an externally-visible offer.
        // If another process reclaimed the lease while this dispatcher was
        // paused, the token mismatch stops the stale owner here.
        const heartbeat = await prisma.trip.updateMany({
          where: {
            id: tripId,
            status: "REQUESTED",
            driverId: null,
            dispatchStatus: "SEARCHING",
            dispatchClaimToken: claimToken,
          },
          data: {
            dispatchClaimedAt: new Date(),
          },
        });

        if (heartbeat.count === 0) {
          return {
            status: "IN_PROGRESS",
            reason: "Trip dispatch ownership changed",
          };
        }

        const offerId = randomUUID();

        const responsePromise = waitForDriverResponse(
          candidate.driverId,
          tripId,
          offerId,
          jobTimeoutSeconds
        );

        console.log(
          `[Dispatch] Trip ${tripId}: offering to driver ${candidate.driverId} (radius ${radius}m)`
        );

        io.to(`driver:${candidate.driverId}`).emit("trip:offer", {
          offerId,
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
          customerName:
            trip.customer?.user?.name || trip.callerName || "Customer",
          customerPhone:
            trip.customer?.user?.phone || trip.callerPhone || "",
          customerNote: trip.customerNote,
          timeoutSeconds: jobTimeoutSeconds,
        });

        prisma.driver
          .findUnique({
            where: { id: candidate.driverId },
            select: { pushToken: true },
          })
          .then((candidateDriver) => {
            if (candidateDriver?.pushToken) {
              return sendPushNotification(
                candidateDriver.pushToken,
                "New ride request nearby!",
                "Open the app to view and respond.",
                { tripId: trip.id, offerId }
              );
            }
          })
          .catch((error) =>
            console.error("[Push] Failed to send job offer push:", error)
          );

        const response = await responsePromise;

        console.log(
          `[Dispatch] Trip ${tripId}: driver ${candidate.driverId} responded "${response}"`
        );

        if (response === "accept") {
          const updatedTrip = await assignTripToDriver(
            tripId,
            candidate.driverId,
            claimToken
          );

          await registerActiveTrip(candidate.driverId, tripId);

          io.to(`driver:${candidate.driverId}`).emit("trip:confirmed", {
            tripId,
            offerId,
          });

          return {
            status: "ACCEPTED",
            driver: {
              id: updatedTrip.driver!.id,
              name: updatedTrip.driver!.user.name,
              phone: updatedTrip.driver!.user.phone,
              vehicleType: updatedTrip.driver!.vehicleType,
              licensePlate: updatedTrip.driver!.licensePlate,
            },
          };
        }
      }
    }

    const message = isNight
      ? "No night service drivers available right now. Please try again in a few minutes."
      : "No drivers available nearby. Please try again in a few minutes.";

    return persistNoDrivers(message);
  } catch (error) {
    console.error("Error dispatching trip:", error);

    if (dispatchClaimToken) {
      try {
        const failedPersist = await prisma.trip.updateMany({
          where: {
            id: tripId,
            status: "REQUESTED",
            driverId: null,
            dispatchStatus: "SEARCHING",
            dispatchClaimToken,
          },
          data: {
            dispatchStatus: "FAILED",
            dispatchClaimToken: null,
            dispatchClaimedAt: null,
          },
        });

        if (failedPersist.count === 0) {
          return resolveDispatchOwnershipLoss(
            tripId,
            "Trip dispatch ownership changed",
            "Server error"
          );
        }
      } catch (persistError) {
        console.error(
          "Error persisting failed dispatch status:",
          persistError
        );
      }
    }

    return { status: "FAILED", reason: "Server error" };
  }
}

/**
 * Wait for one specific driver offer to resolve.
 *
 * offerId is globally unique for each candidate attempt. The dispatcher that
 * owns this Promise may be on a different backend instance from the socket
 * connection that receives the driver's response.
 */
function waitForDriverResponse(
  driverId: string,
  tripId: string,
  offerId: string,
  timeoutSeconds: number
): Promise<"accept" | "decline" | "timeout"> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (pendingResponses.delete(offerId)) {
        resolve("timeout");
      }
    }, timeoutSeconds * 1000);

    pendingResponses.set(offerId, {
      tripId,
      driverId,
      resolve: (response) => {
        clearTimeout(timeout);
        pendingResponses.delete(offerId);
        resolve(response);
      },
    });
  });
}
