const fs = require("fs");
const net = require("net");
const path = require("path");
const { spawn, spawnSync } = require("child_process");


const dotenv = require("dotenv");
const Redis = require("ioredis");
const { PrismaClient } = require("@prisma/client");
const { io: createSocketClient } = require("socket.io-client");

const serverDir = path.resolve(__dirname, "..");
const tsNodeProject = path.join(serverDir, "tsconfig.json");
const envPath = path.join(serverDir, ".env.e2e");
const serverEntry = path.join(serverDir, "src", "server.ts");
const jwtEntry = path.join(serverDir, "src", "services", "jwt.ts");

const REDIS_URL =
  "redis://127.0.0.1:6379/15";

const CUSTOMER_USER_ID =
  "cluster-e2e-customer-user";

const CUSTOMER_ID =
  "cluster-e2e-customer";

const DRIVER_USER_ID =
  "cluster-e2e-driver-user";

const DRIVER_ID =
  "cluster-e2e-driver";

const CUSTOMER_PHONE =
  "0509100001";

const DRIVER_PHONE =
  "0509100002";

const PICKUP = {
  lat: 5.401832,
  lng: -2.0930466,
  address: "Cluster E2E Tarkwa Pickup",
};

const DESTINATION = {
  lat: 5.41,
  lng: -2.08,
  address: "Cluster E2E Tarkwa Destination",
};

const children = [];
let customerSocket;
let driverSocket;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function delay(ms) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", reject);

    server.listen(
      0,
      "127.0.0.1",
      () => {
        const address = server.address();

        if (
          !address ||
          typeof address === "string"
        ) {
          server.close();

          reject(
            new Error(
              "Unable to allocate local TCP port"
            )
          );

          return;
        }

        const port = address.port;

        server.close((error) => {
          if (error) reject(error);
          else resolve(port);
        });
      }
    );
  });
}

function waitForEvent(
  socket,
  event,
  timeoutMs = 10_000
) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, handler);

      reject(
        new Error(
          `Timed out waiting for Socket.IO event "${event}"`
        )
      );
    }, timeoutMs);

    const handler = (payload) => {
      clearTimeout(timeout);
      socket.off(event, handler);
      resolve(payload);
    };

    socket.once(event, handler);
  });
}

async function connectSocket(
  baseUrl,
  accessToken
) {
  const socket = createSocketClient(
    baseUrl,
    {
      auth: {
        token: accessToken,
      },

      transports: ["websocket"],
      reconnection: false,
      forceNew: true,
      autoConnect: false,
    }
  );

  const connected =
    new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            `Timed out connecting socket to ${baseUrl}`
          )
        );
      }, 10_000);

      socket.once("connect", () => {
        clearTimeout(timeout);
        resolve();
      });

      socket.once(
        "connect_error",
        (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      );
    });

  socket.connect();

  await connected;

  return socket;
}

function prefixOutput(label, stream, target) {
  let pending = "";

  stream.on("data", (chunk) => {
    pending += chunk.toString();

    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";

    for (const line of lines) {
      if (line.length > 0) {
        target.write(
          `[${label}] ${line}\n`
        );
      }
    }
  });

  stream.on("end", () => {
    if (pending.length > 0) {
      target.write(
        `[${label}] ${pending}\n`
      );
    }
  });
}

function startBackend(
  label,
  port,
  baseEnv
) {
  const child = spawn(
    process.execPath,
    ["-r", "ts-node/register/transpile-only", serverEntry],
    {
      cwd: serverDir,

      env: {
        ...baseEnv,
        PORT: String(port),
        NODE_ENV: "test",
        REDIS_URL,
        TS_NODE_PROJECT: tsNodeProject,
      },

      windowsHide: true,

      stdio: [
        "ignore",
        "pipe",
        "pipe",
      ],
    }
  );

  children.push(child);

  prefixOutput(
    label,
    child.stdout,
    process.stdout
  );

  prefixOutput(
    label,
    child.stderr,
    process.stderr
  );

  return child;
}

async function waitForBackend(
  label,
  child,
  baseUrl
) {
  const deadline =
    Date.now() + 20_000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `${label} exited before becoming healthy ` +
        `(code ${child.exitCode})`
      );
    }

    try {
      const response = await fetch(
        `${baseUrl}/api/v1/health`
      );

      if (response.ok) {
        return;
      }
    } catch {
      // Server has not started listening yet.
    }

    await delay(100);
  }

  throw new Error(
    `${label} did not become healthy`
  );
}

async function stopChild(child) {
  if (
    !child ||
    child.exitCode !== null
  ) {
    return;
  }

  if (process.platform === "win32") {
    spawnSync(
      "taskkill",
      [
        "/PID",
        String(child.pid),
        "/T",
        "/F",
      ],
      {
        stdio: "ignore",
      }
    );

    return;
  }

  child.kill("SIGTERM");

  await Promise.race([
    new Promise((resolve) =>
      child.once("exit", resolve)
    ),
    delay(3_000),
  ]);

  if (child.exitCode === null) {
    child.kill("SIGKILL");
  }
}

async function cleanFixture(prisma) {
  await prisma.trip.deleteMany({
    where: {
      OR: [
        { customerId: CUSTOMER_ID },
        { driverId: DRIVER_ID },
      ],
    },
  });

  await prisma.driver.deleteMany({
    where: {
      id: DRIVER_ID,
    },
  });

  await prisma.customer.deleteMany({
    where: {
      id: CUSTOMER_ID,
    },
  });

  await prisma.user.deleteMany({
    where: {
      id: {
        in: [
          CUSTOMER_USER_ID,
          DRIVER_USER_ID,
        ],
      },
    },
  });
}

async function main() {
  console.log(
    "\n========================================"
  );
  console.log(
    " ALLGO TWO-BACKEND REDIS SMOKE"
  );
  console.log(
    "========================================\n"
  );

  assert(
    fs.existsSync(envPath),
    `Missing E2E environment: ${envPath}`
  );

  assert(
    fs.existsSync(serverEntry),
    "Server TypeScript entrypoint is missing."
  );

  assert(
    fs.existsSync(jwtEntry),
    "JWT TypeScript module is missing."
  );

  const envResult = dotenv.config({
    path: envPath,
    override: true,
  });

  if (envResult.error) {
    throw envResult.error;
  }

  assert(
    process.env.NODE_ENV === "test",
    `REFUSING SMOKE: NODE_ENV must be test, got "${process.env.NODE_ENV}"`
  );

  assert(
    process.env.DATABASE_URL,
    "REFUSING SMOKE: DATABASE_URL is missing"
  );

  const databaseName =
    new URL(
      process.env.DATABASE_URL
    )
      .pathname
      .replace(/^\/+/, "");

  assert(
    databaseName === "allgo_e2e",
    `REFUSING SMOKE: expected database allgo_e2e, got "${databaseName}"`
  );

  process.env.REDIS_URL =
    REDIS_URL;

  const prisma =
    new PrismaClient();

  const redis =
    new Redis(
      REDIS_URL,
      {
        maxRetriesPerRequest: 3,
      }
    );

  try {
    console.log(
      "1. Verifying isolated infrastructure..."
    );

    await prisma.$connect();

    const pong = await redis.ping();

    assert(
      pong === "PONG",
      "Memurai did not respond PONG"
    );

    // DB 15 is reserved for this smoke's keys.
    // Never use FLUSHALL.
    await redis.flushdb();

    await cleanFixture(prisma);

    console.log(
      "PASS: MySQL allgo_e2e + Memurai available."
    );

    console.log(
      "\n2. Creating cluster fixture..."
    );

    await prisma.user.create({
      data: {
        id: CUSTOMER_USER_ID,
        phone: CUSTOMER_PHONE,
        name: "Cluster E2E Customer",
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
        name: "Cluster E2E Driver",
        role: "DRIVER",
        isActive: true,
      },
    });

    await prisma.driver.create({
      data: {
        id: DRIVER_ID,
        userId: DRIVER_USER_ID,
        vehicleType: "MOTO",
        licensePlate: "CLUSTER-0001",
        isApproved: true,
        isOnline: true,
        nightMode: true,

        subscriptionStatus:
          "ACTIVE",

        subscriptionPeriodEnd:
          new Date(
            Date.now() +
            24 * 60 * 60 * 1000
          ),

        lastLocation:
          JSON.stringify({
            lat: PICKUP.lat,
            lng: PICKUP.lng,
            timestamp:
              new Date().toISOString(),
          }),
      },
    });
    process.env.TS_NODE_PROJECT = tsNodeProject;
    require("ts-node/register/transpile-only");


    const {
      generateTokens,
    } = require(jwtEntry);

    const customerToken =
      generateTokens(
        CUSTOMER_USER_ID,
        CUSTOMER_PHONE,
        "CUSTOMER"
      ).accessToken;

    const driverToken =
      generateTokens(
        DRIVER_USER_ID,
        DRIVER_PHONE,
        "DRIVER"
      ).accessToken;

    console.log(
      "PASS: isolated fixture created."
    );

    console.log(
      "\n3. Starting two independent AllGo backend processes..."
    );

    const portA =
      await getFreePort();

    let portB =
      await getFreePort();

    while (portB === portA) {
      portB =
        await getFreePort();
    }

    const baseUrlA =
      `http://127.0.0.1:${portA}`;

    const baseUrlB =
      `http://127.0.0.1:${portB}`;

    const baseEnv = {
      ...process.env,
      NODE_ENV: "test",
        REDIS_URL,
        TS_NODE_PROJECT: tsNodeProject,
    };

    const backendA =
      startBackend(
        "A",
        portA,
        baseEnv
      );

    const backendB =
      startBackend(
        "B",
        portB,
        baseEnv
      );

    await Promise.all([
      waitForBackend(
        "Backend A",
        backendA,
        baseUrlA
      ),

      waitForBackend(
        "Backend B",
        backendB,
        baseUrlB
      ),
    ]);

    console.log(
      `PASS: Backend A healthy on ${portA}.`
    );

    console.log(
      `PASS: Backend B healthy on ${portB}.`
    );

    console.log(
      "\n4. Connecting customer to A and driver to B..."
    );

    customerSocket =
      await connectSocket(
        baseUrlA,
        customerToken
      );

    driverSocket =
      await connectSocket(
        baseUrlB,
        driverToken
      );

    assert(
      customerSocket.connected,
      "Customer socket is not connected to A"
    );

    assert(
      driverSocket.connected,
      "Driver socket is not connected to B"
    );

    // Socket.IO connect completes before AllGo's asynchronous
    // Driver.id lookup and room join are guaranteed complete.
    // Give the independent backend process time to establish
    // its authenticated driver room before dispatch begins.
    await delay(1_000);

    console.log(
      "PASS: customer -> A, driver -> B."
    );

    console.log(
      "\n5. Creating trip through Backend A..."
    );

    const createResponse =
      await fetch(
        `${baseUrlA}/api/v1/bookings/trip`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${customerToken}`,
          },

          body: JSON.stringify({
            vehicleType: "MOTO",
            serviceType: "PASSENGER",
            pickup: PICKUP,
            destination: DESTINATION,

            customerNote:
              "Two-backend Redis smoke",
          }),
        }
      );

    const createBody =
      await createResponse.json();

    assert(
      createResponse.status === 201,
      `Trip creation failed: HTTP ${createResponse.status} ${JSON.stringify(createBody)}`
    );

    const trip =
      createBody.data?.trip ??
      createBody.trip;

    assert(
      trip?.id,
      "Trip creation returned no trip id"
    );

    assert(
      trip.status === "REQUESTED",
      `Expected REQUESTED, got ${trip.status}`
    );

    const tripId =
      trip.id;

    console.log(
      `PASS: trip ${tripId} created on A.`
    );

    console.log(
      "\n6. Dispatching on A; offer must cross Redis to driver on B..."
    );

    const offerPromise =
      waitForEvent(
        driverSocket,
        "trip:offer",
        15_000
      );

    const acceptedPromise =
      waitForEvent(
        customerSocket,
        "trip:accepted",
        15_000
      );

    customerSocket.emit(
      "trip:dispatch",
      tripId
    );

    const offer =
      await offerPromise;

    assert(
      offer.tripId === tripId,
      "Driver received offer for wrong trip"
    );

    assert(
      typeof offer.offerId === "string" &&
      offer.offerId.length > 0,
      "Driver offer has no offerId"
    );

    console.log(
      "PASS: A -> Redis adapter -> driver on B."
    );

    console.log(
      "\n7. Driver accepts on B; response must resolve dispatch on A..."
    );

    const acceptReceivedPromise =
      waitForEvent(
        driverSocket,
        "trip:accept:received",
        15_000
      );

    const confirmedPromise =
      waitForEvent(
        driverSocket,
        "trip:confirmed",
        15_000
      );

    driverSocket.emit(
      "trip:accept",
      {
        tripId,
        offerId: offer.offerId,
      }
    );

    const [
      acceptReceived,
      confirmation,
      customerAccepted,
    ] = await Promise.all([
      acceptReceivedPromise,
      confirmedPromise,
      acceptedPromise,
    ]);

    assert(
      acceptReceived.tripId === tripId,
      "Driver acknowledgement has wrong trip id"
    );

    assert(
      acceptReceived.offerId ===
        offer.offerId,
      "Driver acknowledgement has wrong offer id"
    );

    assert(
      confirmation.tripId === tripId,
      "Driver confirmation has wrong trip id"
    );

    assert(
      confirmation.offerId ===
        offer.offerId,
      "Driver confirmation has wrong offer id"
    );

    assert(
      customerAccepted.tripId ===
        tripId,
      "Customer acceptance has wrong trip id"
    );

    assert(
      customerAccepted.driver?.id ===
        DRIVER_ID,
      "Customer received wrong assigned driver"
    );

    console.log(
      "PASS: B -> Redis response -> dispatch owner A."
    );

    console.log(
      "\n8. Verifying authoritative database assignment..."
    );

    const acceptedTrip =
      await prisma.trip.findUnique({
        where: {
          id: tripId,
        },
      });

    assert(
      acceptedTrip,
      "Accepted trip disappeared"
    );

    assert(
      acceptedTrip.status === "ACCEPTED",
      `Expected ACCEPTED, got ${acceptedTrip.status}`
    );

    assert(
      acceptedTrip.driverId ===
        DRIVER_ID,
      `Expected driver ${DRIVER_ID}, got ${acceptedTrip.driverId}`
    );

    assert(
      acceptedTrip.acceptedAt
        instanceof Date,
      "acceptedAt was not persisted"
    );

    assert(
      acceptedTrip.dispatchClaimToken ===
        null,
      "dispatchClaimToken was not cleared"
    );

    assert(
      acceptedTrip.dispatchClaimedAt ===
        null,
      "dispatchClaimedAt was not cleared"
    );

    console.log(
      "PASS: authoritative assignment persisted."
    );

    console.log(
      "\n========================================"
    );

    console.log(
      " PASS: ALLGO TWO-BACKEND REDIS SMOKE GREEN"
    );

    console.log(
      "========================================"
    );

    console.log(
      "\nProved:"
    );

    console.log(
      "- Backend A and B are separate Node processes."
    );

    console.log(
      "- Customer is connected only to A."
    );

    console.log(
      "- Driver is connected only to B."
    );

    console.log(
      "- Driver offer crosses the Socket.IO Redis adapter."
    );

    console.log(
      "- Driver accept reaches the dispatch owner across Redis."
    );

    console.log(
      "- Driver confirmation crosses back to B."
    );

    console.log(
      "- Final assignment is authoritative in MySQL."
    );
  } finally {
    customerSocket?.disconnect();
    driverSocket?.disconnect();

    for (
      const child of [...children].reverse()
    ) {
      await stopChild(child);
    }

    try {
      await cleanFixture(prisma);
    } catch (error) {
      console.error(
        "Fixture cleanup failed:",
        error
      );
    }

    try {
      await redis.flushdb();
    } catch (error) {
      console.error(
        "Redis DB 15 cleanup failed:",
        error
      );
    }

    await prisma.$disconnect();

    if (
      redis.status !== "end"
    ) {
      await redis.quit();
    }
  }
}

main().catch((error) => {
  console.error(
    "\nSMOKE FAILED:",
    error
  );

  process.exitCode = 1;
});
