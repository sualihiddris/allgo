import http from "http";
import path from "path";
import { AddressInfo } from "net";

import dotenv from "dotenv";
import request from "supertest";
import { io as createSocketClient, Socket } from "socket.io-client";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

const CUSTOMER_USER_ID = "e2e-customer-user";
const CUSTOMER_ID = "e2e-customer";

const DRIVER_USER_ID = "e2e-driver-user";
const DRIVER_ID = "e2e-driver";

const CUSTOMER_PHONE = "0509000001";
const DRIVER_PHONE = "0509000002";

const PICKUP = {
  lat: 5.301832,
  lng: -1.9930466,
  address: "E2E Tarkwa Pickup",
};

const DESTINATION = {
  lat: 5.31,
  lng: -1.98,
  address: "E2E Tarkwa Destination",
};

let prisma: import("@prisma/client").PrismaClient;
let ioServer: import("socket.io").Server;
let httpServer: http.Server;

let customerSocket: Socket;
let driverSocket: Socket;

let customerToken: string;
let driverToken: string;

function waitForEvent<T>(
  socket: Socket,
  event: string,
  timeoutMs = 5_000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for Socket.IO event "${event}"`));
    }, timeoutMs);

    const handler = (payload: T) => {
      clearTimeout(timeout);
      socket.off(event, handler);
      resolve(payload);
    };

    socket.once(event, handler);
  });
}

async function waitUntil(
  predicate: () => boolean | Promise<boolean>,
  message: string,
  timeoutMs = 5_000
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`Timed out: ${message}`);
}

async function connectSocket(
  baseUrl: string,
  accessToken: string
): Promise<Socket> {
  const socket = createSocketClient(baseUrl, {
    auth: {
      token: accessToken,
    },
    transports: ["websocket"],
    reconnection: false,
    forceNew: true,
    autoConnect: false,
  });

  const connected = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out connecting Socket.IO client"));
    }, 5_000);

    socket.once("connect", () => {
      clearTimeout(timeout);
      resolve();
    });

    socket.once("connect_error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  socket.connect();
  await connected;

  return socket;
}

async function resetTripState(): Promise<void> {
  await prisma.trip.deleteMany({
    where: {
      OR: [
        { customerId: CUSTOMER_ID },
        { driverId: DRIVER_ID },
      ],
    },
  });

  await prisma.driver.update({
    where: { id: DRIVER_ID },
    data: {
      isOnline: true,
      totalTrips: 0,
      lastLocation: JSON.stringify({
        lat: PICKUP.lat,
        lng: PICKUP.lng,
        timestamp: new Date().toISOString(),
      }),
    },
  });

  const trackingModule = await import("../services/tracking");
  await trackingModule.unregisterActiveTrip(DRIVER_ID);
}
async function cleanFixture(): Promise<void> {
  await prisma.trip.deleteMany({
    where: {
      OR: [
        { customerId: CUSTOMER_ID },
        { driverId: DRIVER_ID },
      ],
    },
  });

  await prisma.driver.deleteMany({
    where: { id: DRIVER_ID },
  });

  await prisma.customer.deleteMany({
    where: { id: CUSTOMER_ID },
  });

  await prisma.user.deleteMany({
    where: {
      id: {
        in: [CUSTOMER_USER_ID, DRIVER_USER_ID],
      },
    },
  });
}

describe("Trip lifecycle E2E", () => {
  beforeAll(async () => {
    const envPath =
      path.basename(process.cwd()).toLowerCase() === "server"
        ? path.resolve(process.cwd(), ".env.e2e")
        : path.resolve(process.cwd(), "server", ".env.e2e");

    const envResult = dotenv.config({
      path: envPath,
      override: true,
    });

    if (envResult.error) {
      throw new Error(
        `Unable to load E2E environment: ${envResult.error.message}`
      );
    }

    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error("E2E DATABASE_URL is missing");
    }

    const databaseName = new URL(databaseUrl)
      .pathname
      .replace(/^\/+/, "");

    if (databaseName !== "allgo_e2e") {
      throw new Error(
        `REFUSING E2E RUN: expected allgo_e2e, got "${databaseName}"`
      );
    }

    if (process.env.NODE_ENV !== "test") {
      throw new Error(
        `REFUSING E2E RUN: NODE_ENV must be test, got "${process.env.NODE_ENV}"`
      );
    }

    if (process.env.REDIS_URL) {
      throw new Error(
        "REFUSING E2E RUN: REDIS_URL must be empty so this test cannot touch shared Redis"
      );
    }

    const [
      databaseModule,
      redisModule,
      appModule,
      socketModule,
      jwtModule,
    ] = await Promise.all([
      import("../config/database"),
      import("../config/redis"),
      import("../app"),
      import("../services/socket"),
      import("../services/jwt"),
    ]);

    prisma = databaseModule.prisma;

    await prisma.$connect();
    await redisModule.redis.connect();

    await cleanFixture();

    await prisma.user.create({
      data: {
        id: CUSTOMER_USER_ID,
        phone: CUSTOMER_PHONE,
        name: "E2E Customer",
        role: "CUSTOMER",
        isActive: true,
      },
    });

    await prisma.customer.create({
      data: {
        id: CUSTOMER_ID,
        userId: CUSTOMER_USER_ID,
      },
    });

    await prisma.user.create({
      data: {
        id: DRIVER_USER_ID,
        phone: DRIVER_PHONE,
        name: "E2E Driver",
        role: "DRIVER",
        isActive: true,
      },
    });

    await prisma.driver.create({
      data: {
        id: DRIVER_ID,
        userId: DRIVER_USER_ID,
        vehicleType: "MOTO",
        licensePlate: "E2E-0001",
        isApproved: true,
        isOnline: true,

        // Makes the fixture valid whether the test runs during
        // AllGo day or night service hours.
        nightMode: true,

        subscriptionStatus: "ACTIVE",
        subscriptionPeriodEnd: new Date(
          Date.now() + 24 * 60 * 60 * 1000
        ),

        // Dispatch may use DB fallback when Redis has no location.
        lastLocation: JSON.stringify({
          lat: PICKUP.lat,
          lng: PICKUP.lng,
          timestamp: new Date().toISOString(),
        }),
      },
    });

    customerToken = jwtModule.generateTokens(
      CUSTOMER_USER_ID,
      CUSTOMER_PHONE,
      "CUSTOMER"
    ).accessToken;

    driverToken = jwtModule.generateTokens(
      DRIVER_USER_ID,
      DRIVER_PHONE,
      "DRIVER"
    ).accessToken;

    const app = appModule.createApp();

    httpServer = http.createServer(app);

    ioServer = await socketModule.setupSocketIO(httpServer);

    app.set("io", ioServer);

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        httpServer.off("listening", onListening);
        reject(error);
      };

      const onListening = () => {
        httpServer.off("error", onError);
        resolve();
      };

      httpServer.once("error", onError);
      httpServer.once("listening", onListening);

      httpServer.listen(0, "127.0.0.1");
    });

    const address = httpServer.address();

    if (!address || typeof address === "string") {
      throw new Error("E2E HTTP server did not expose a TCP address");
    }

    const port = (address as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    customerSocket = await connectSocket(
      baseUrl,
      customerToken
    );

    driverSocket = await connectSocket(
      baseUrl,
      driverToken
    );

    // The socket's "connect" event happens before the driver's
    // asynchronous Driver.id lookup is necessarily finished.
    // Wait until the real Socket.IO room membership exists.
    await waitUntil(
      () =>
        (ioServer.sockets.adapter.rooms.get(
          `driver:${DRIVER_ID}`
        )?.size ?? 0) > 0,
      "driver socket did not join its Driver.id room"
    );

    await waitUntil(
      () =>
        (ioServer.sockets.adapter.rooms.get(
          `customer:${CUSTOMER_USER_ID}`
        )?.size ?? 0) > 0,
      "customer socket did not join its user room"
    );
  }, 20_000);

  afterAll(async () => {
    customerSocket?.disconnect();
    driverSocket?.disconnect();

    if (prisma) {
      await cleanFixture();
    }

    if (ioServer) {
      await new Promise<void>((resolve) => {
        ioServer.close(() => resolve());
      });
    }

    if (httpServer?.listening) {
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }

    if (prisma) {
      await prisma.$disconnect();
    }

    // redis.ts uses MemoryStore because .env.e2e has REDIS_URL empty.
    const redisModule = await import("../config/redis");
    await redisModule.redis.quit();
  });

  it(
    "creates, dispatches, accepts, starts, and completes exactly one trip",
    async () => {
      //
      // 1. Customer creates trip through the real HTTP API.
      //
      const createResponse = await request(httpServer)
        .post("/api/v1/bookings/trip")
        .set(
          "Authorization",
          `Bearer ${customerToken}`
        )
        .send({
          vehicleType: "MOTO",
          serviceType: "PASSENGER",
          pickup: PICKUP,
          destination: DESTINATION,
          customerNote: "E2E lifecycle test",
        });

      expect(createResponse.status).toBe(201);
      expect(createResponse.body.success).toBe(true);

      const trip =
        createResponse.body.data?.trip ??
        createResponse.body.trip;

      expect(trip).toBeTruthy();
      expect(trip.id).toBeTypeOf("string");
      expect(trip.status).toBe("REQUESTED");

      const tripId: string = trip.id;

      const requestedTrip =
        await prisma.trip.findUniqueOrThrow({
          where: { id: tripId },
        });

      expect(requestedTrip.status).toBe("REQUESTED");
      expect(requestedTrip.driverId).toBeNull();

      //
      // 2. Customer explicitly starts socket dispatch.
      //
      const offerPromise =
        waitForEvent<{
          tripId: string;
          offerId: string;
          vehicleType: string;
        }>(
          driverSocket,
          "trip:offer"
        );

      const customerAcceptedPromise =
        waitForEvent<{
          tripId: string;
          driver: {
            id: string;
          };
        }>(
          customerSocket,
          "trip:accepted"
        );

      customerSocket.emit(
        "trip:dispatch",
        tripId
      );

      //
      // 3. Real driver socket receives a correlated offer.
      //
      const offer = await offerPromise;

      expect(offer.tripId).toBe(tripId);
      expect(offer.offerId).toBeTypeOf("string");
      expect(offer.offerId.length).toBeGreaterThan(0);
      expect(offer.vehicleType).toBe("MOTO");

      //
      // 4. Driver accepts using the exact offerId.
      //
      const acceptReceivedPromise =
        waitForEvent<{
          tripId: string;
          offerId: string;
        }>(
          driverSocket,
          "trip:accept:received"
        );

      const confirmedPromise =
        waitForEvent<{
          tripId: string;
          offerId: string;
        }>(
          driverSocket,
          "trip:confirmed"
        );

      driverSocket.emit(
        "trip:accept",
        {
          tripId,
          offerId: offer.offerId,
        }
      );

      const acceptReceived =
        await acceptReceivedPromise;

      expect(acceptReceived).toEqual({
        tripId,
        offerId: offer.offerId,
      });

      const confirmation =
        await confirmedPromise;

      expect(confirmation).toEqual({
        tripId,
        offerId: offer.offerId,
      });

      const customerAccepted =
        await customerAcceptedPromise;

      expect(customerAccepted.tripId).toBe(
        tripId
      );

      expect(customerAccepted.driver.id).toBe(
        DRIVER_ID
      );

      //
      // 5. Verify authoritative DB assignment.
      //
      const acceptedTrip =
        await prisma.trip.findUniqueOrThrow({
          where: { id: tripId },
        });

      expect(acceptedTrip.status).toBe(
        "ACCEPTED"
      );

      expect(acceptedTrip.driverId).toBe(
        DRIVER_ID
      );

      expect(
        acceptedTrip.acceptedAt
      ).toBeInstanceOf(Date);

      expect(
        acceptedTrip.dispatchClaimToken
      ).toBeNull();

      expect(
        acceptedTrip.dispatchClaimedAt
      ).toBeNull();

      //
      // 6. Driver starts trip through the real tracking HTTP API.
      //
      const activeEventPromise =
        waitForEvent<{
          tripId: string;
          status: string;
        }>(
          customerSocket,
          "trip:status"
        );

      const startResponse = await request(
        httpServer
      )
        .put(
          `/api/v1/tracking/trip/${tripId}/status`
        )
        .set(
          "Authorization",
          `Bearer ${driverToken}`
        )
        .send({
          status: "STARTED",
        });

      expect(startResponse.status).toBe(200);
      expect(
        startResponse.body.data.trip.status
      ).toBe("ACTIVE");

      const activeEvent =
        await activeEventPromise;

      expect(activeEvent).toEqual({
        tripId,
        status: "ACTIVE",
      });

      const activeTrip =
        await prisma.trip.findUniqueOrThrow({
          where: { id: tripId },
        });

      expect(activeTrip.status).toBe(
        "ACTIVE"
      );

      expect(
        activeTrip.startedAt
      ).toBeInstanceOf(Date);

      //
      // 7. Driver completes trip through the real tracking HTTP API.
      //
      const completedEventPromise =
        waitForEvent<{
          tripId: string;
          status: string;
        }>(
          customerSocket,
          "trip:status"
        );

      const completeResponse = await request(
        httpServer
      )
        .put(
          `/api/v1/tracking/trip/${tripId}/status`
        )
        .set(
          "Authorization",
          `Bearer ${driverToken}`
        )
        .send({
          status: "COMPLETED",
        });

      expect(
        completeResponse.status
      ).toBe(200);

      expect(
        completeResponse.body.data.trip.status
      ).toBe("COMPLETED");

      const completedEvent =
        await completedEventPromise;

      expect(completedEvent).toEqual({
        tripId,
        status: "COMPLETED",
      });

      //
      // 8. Authoritative final-state checks.
      //
      const finalTrip =
        await prisma.trip.findUniqueOrThrow({
          where: { id: tripId },
        });

      expect(finalTrip.status).toBe(
        "COMPLETED"
      );

      expect(finalTrip.customerId).toBe(
        CUSTOMER_ID
      );

      expect(finalTrip.driverId).toBe(
        DRIVER_ID
      );

      expect(
        finalTrip.acceptedAt
      ).toBeInstanceOf(Date);

      expect(
        finalTrip.startedAt
      ).toBeInstanceOf(Date);

      expect(
        finalTrip.completedAt
      ).toBeInstanceOf(Date);

      const finalDriver =
        await prisma.driver.findUniqueOrThrow({
          where: { id: DRIVER_ID },
        });

      expect(finalDriver.totalTrips).toBe(1);
    },
    20_000
  );
  it(
    "recovers an accepted trip after the driver disconnects and reconnects",
    async () => {
      await resetTripState();

      //
      // 1. Create a fresh trip.
      //
      const createResponse = await request(httpServer)
        .post("/api/v1/bookings/trip")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          vehicleType: "MOTO",
          serviceType: "PASSENGER",
          pickup: PICKUP,
          destination: DESTINATION,
          customerNote: "E2E reconnect recovery test",
        });

      expect(createResponse.status).toBe(201);

      const trip =
        createResponse.body.data?.trip ??
        createResponse.body.trip;

      expect(trip).toBeTruthy();

      const tripId: string = trip.id;

      //
      // 2. Dispatch and accept with the original driver socket.
      //
      const offerPromise =
        waitForEvent<{
          tripId: string;
          offerId: string;
        }>(
          driverSocket,
          "trip:offer"
        );

      customerSocket.emit(
        "trip:dispatch",
        tripId
      );

      const offer = await offerPromise;

      expect(offer.tripId).toBe(tripId);
      expect(offer.offerId).toBeTypeOf("string");

      const confirmedPromise =
        waitForEvent<{
          tripId: string;
          offerId: string;
        }>(
          driverSocket,
          "trip:confirmed"
        );

      driverSocket.emit(
        "trip:accept",
        {
          tripId,
          offerId: offer.offerId,
        }
      );

      await confirmedPromise;

      const acceptedBeforeDisconnect =
        await prisma.trip.findUniqueOrThrow({
          where: { id: tripId },
        });

      expect(
        acceptedBeforeDisconnect.status
      ).toBe("ACCEPTED");

      expect(
        acceptedBeforeDisconnect.driverId
      ).toBe(DRIVER_ID);

      //
      // 3. Customer joins the live tracking room.
      //
      const trackingStartedPromise =
        waitForEvent<{
          tripId: string;
          driverId: string;
        }>(
          customerSocket,
          "trip:tracking:started"
        );

      customerSocket.emit(
        "trip:track",
        tripId
      );

      const trackingStarted =
        await trackingStartedPromise;

      expect(
        trackingStarted.tripId
      ).toBe(tripId);

      //
      // 4. Disconnect the original physical driver socket.
      //
      const oldSocketId = driverSocket.id;

      driverSocket.disconnect();

      await waitUntil(
        () =>
          (ioServer.sockets.adapter.rooms.get(
            `driver:${DRIVER_ID}`
          )?.size ?? 0) === 0,
        "old driver connection did not leave its room"
      );

      //
      // Socket loss must not alter the authoritative assignment.
      //
      const acceptedWhileOffline =
        await prisma.trip.findUniqueOrThrow({
          where: { id: tripId },
        });

      expect(
        acceptedWhileOffline.status
      ).toBe("ACCEPTED");

      expect(
        acceptedWhileOffline.driverId
      ).toBe(DRIVER_ID);

      //
      // 5. Reconnect as the same authenticated driver.
      //
      const address = httpServer.address();

      if (!address || typeof address === "string") {
        throw new Error(
          "E2E HTTP server did not expose a TCP address"
        );
      }

      const baseUrl =
        `http://127.0.0.1:${(address as AddressInfo).port}`;

      driverSocket = await connectSocket(
        baseUrl,
        driverToken
      );

      expect(driverSocket.id).toBeTruthy();

      expect(driverSocket.id).not.toBe(
        oldSocketId
      );

      await waitUntil(
        () =>
          (ioServer.sockets.adapter.rooms.get(
            `driver:${DRIVER_ID}`
          )?.size ?? 0) === 1,
        "reconnected driver did not rejoin its Driver.id room"
      );

      //
      // 6. Recover the assigned trip through the real HTTP API.
      //
      const activeTripsResponse =
        await request(httpServer)
          .get("/api/v1/driver/trips/active")
          .set(
            "Authorization",
            `Bearer ${driverToken}`
          );

      expect(
        activeTripsResponse.status
      ).toBe(200);

      const recoveredTrips =
        activeTripsResponse.body.data?.trips ??
        activeTripsResponse.body.trips;

      expect(
        Array.isArray(recoveredTrips)
      ).toBe(true);

      const recoveredTrip =
        recoveredTrips.find(
          (candidate: { id: string }) =>
            candidate.id === tripId
        );

      expect(recoveredTrip).toBeTruthy();

      expect(
        recoveredTrip.status
      ).toBe("ACCEPTED");

      //
      // Reconnect must not duplicate the trip or assignment.
      //
      const matchingTripCount =
        await prisma.trip.count({
          where: {
            id: tripId,
            customerId: CUSTOMER_ID,
            driverId: DRIVER_ID,
          },
        });

      expect(matchingTripCount).toBe(1);

      //
      // 7. Prove the active-trip mapping survived the socket loss.
      //
      const locationPromise =
        waitForEvent<{
          driverId: string;
          lat: number;
          lng: number;
        }>(
          customerSocket,
          "driver:location:update"
        );

      driverSocket.emit(
        "driver:location",
        {
          lat: PICKUP.lat + 0.0005,
          lng: PICKUP.lng + 0.0005,
          heading: 90,
        }
      );

      const locationUpdate =
        await locationPromise;

      expect(
        locationUpdate.driverId
      ).toBe(DRIVER_ID);

      expect(
        locationUpdate.lat
      ).toBeCloseTo(
        PICKUP.lat + 0.0005
      );

      expect(
        locationUpdate.lng
      ).toBeCloseTo(
        PICKUP.lng + 0.0005
      );

      //
      // 8. Continue lifecycle after reconnect.
      //
      const activeEventPromise =
        waitForEvent<{
          tripId: string;
          status: string;
        }>(
          customerSocket,
          "trip:status"
        );

      const startResponse =
        await request(httpServer)
          .put(
            `/api/v1/tracking/trip/${tripId}/status`
          )
          .set(
            "Authorization",
            `Bearer ${driverToken}`
          )
          .send({
            status: "STARTED",
          });

      expect(
        startResponse.status
      ).toBe(200);

      const activeEvent =
        await activeEventPromise;

      expect(activeEvent).toEqual({
        tripId,
        status: "ACTIVE",
      });

      const activeTrip =
        await prisma.trip.findUniqueOrThrow({
          where: { id: tripId },
        });

      expect(
        activeTrip.status
      ).toBe("ACTIVE");

      //
      // 9. Complete successfully after reconnect.
      //
      const completedEventPromise =
        waitForEvent<{
          tripId: string;
          status: string;
        }>(
          customerSocket,
          "trip:status"
        );

      const completeResponse =
        await request(httpServer)
          .put(
            `/api/v1/tracking/trip/${tripId}/status`
          )
          .set(
            "Authorization",
            `Bearer ${driverToken}`
          )
          .send({
            status: "COMPLETED",
          });

      expect(
        completeResponse.status
      ).toBe(200);

      const completedEvent =
        await completedEventPromise;

      expect(completedEvent).toEqual({
        tripId,
        status: "COMPLETED",
      });

      const finalTrip =
        await prisma.trip.findUniqueOrThrow({
          where: { id: tripId },
        });

      expect(
        finalTrip.status
      ).toBe("COMPLETED");

      expect(
        finalTrip.driverId
      ).toBe(DRIVER_ID);

      expect(
        finalTrip.completedAt
      ).toBeInstanceOf(Date);

      const finalDriver =
        await prisma.driver.findUniqueOrThrow({
          where: { id: DRIVER_ID },
        });

      expect(
        finalDriver.totalTrips
      ).toBe(1);
    },
    20_000
  );
});
