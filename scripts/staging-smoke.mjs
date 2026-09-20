const TIMEOUT_MS = 15_000;

function requireUrl(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  const url = new URL(value);

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${name} must be an HTTP(S) URL`);
  }

  return url;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function get(url, options = {}) {
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

async function main() {
  const backendUrl = requireUrl("STAGING_BACKEND_URL");
  const adminUrl = requireUrl("STAGING_ADMIN_URL");
  const adminOrigin = adminUrl.origin;

  console.log("=== ALLGO STAGING SMOKE ===");
  console.log(`Backend: ${backendUrl.origin}`);
  console.log(`Admin:   ${adminOrigin}`);

  // 1. Backend health + HTTP CORS
  const healthUrl = new URL("/api/v1/health", backendUrl);

  const healthResponse = await get(healthUrl, {
    headers: {
      Origin: adminOrigin,
    },
  });

  const healthCors =
    healthResponse.headers.get("access-control-allow-origin");

  const healthCredentials =
    healthResponse.headers.get("access-control-allow-credentials");

  assert(
    healthResponse.status === 200,
    `Health check returned HTTP ${healthResponse.status}`
  );

  assert(
    healthCors === adminOrigin,
    `HTTP CORS mismatch: expected ${adminOrigin}, got ${healthCors}`
  );

  assert(
    healthCredentials === "true",
    "HTTP CORS credentials header is not true"
  );

  const health = await healthResponse.json();

  assert(
    health.success === true,
    `Backend health is not successful: ${JSON.stringify(health)}`
  );

  assert(
    health.checks?.database === "ok",
    `Database health failed: ${JSON.stringify(health.checks)}`
  );

  assert(
    health.checks?.redis === "ok",
    `Redis health failed: ${JSON.stringify(health.checks)}`
  );

  console.log("PASS: backend health, MySQL, Redis, and HTTP CORS");

  // 2. Vercel SPA fallback
  const nestedAdminUrl = new URL("/login", adminUrl);
  const adminResponse = await get(nestedAdminUrl);

  assert(
    adminResponse.status === 200,
    `Admin nested route returned HTTP ${adminResponse.status}`
  );

  const contentType = adminResponse.headers.get("content-type") || "";

  assert(
    contentType.includes("text/html"),
    `Admin nested route is not HTML: ${contentType}`
  );

  console.log("PASS: Vercel SPA nested-route fallback");

  // 3. Socket.IO / Engine.IO CORS handshake
  const socketUrl = new URL("/socket.io/", backendUrl);
  socketUrl.searchParams.set("EIO", "4");
  socketUrl.searchParams.set("transport", "polling");
  socketUrl.searchParams.set("t", Date.now().toString());

  const socketResponse = await get(socketUrl, {
    headers: {
      Origin: adminOrigin,
    },
  });

  const socketCors =
    socketResponse.headers.get("access-control-allow-origin");

  const socketCredentials =
    socketResponse.headers.get("access-control-allow-credentials");

  assert(
    socketResponse.status === 200,
    `Socket.IO handshake returned HTTP ${socketResponse.status}`
  );

  assert(
    socketCors === adminOrigin,
    `Socket.IO CORS mismatch: expected ${adminOrigin}, got ${socketCors}`
  );

  assert(
    socketCredentials === "true",
    "Socket.IO CORS credentials header is not true"
  );

  const socketBody = await socketResponse.text();

  assert(
    socketBody.startsWith("0"),
    `Unexpected Engine.IO handshake payload: ${socketBody.slice(0, 120)}`
  );

  console.log("PASS: Socket.IO CORS / Engine.IO handshake");
  console.log("PASS: ALLGO STAGING SMOKE GREEN");
}

main().catch((error) => {
  console.error("FAIL: ALLGO STAGING SMOKE");
  console.error(error);
  process.exitCode = 1;
});
