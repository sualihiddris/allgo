import "dotenv/config";
import http from "http";

import { createApp } from "./app";
import { env, connectDatabase, connectRedis, disconnectDatabase, disconnectRedis } from "./config";
import { setupSocketIO } from "./services/socket";

async function main() {
  // Connect to services
  await connectDatabase();
  await connectRedis();

  // Create Express app
  const app = createApp();

  // Create HTTP server
  const httpServer = http.createServer(app);

  // Setup Socket.io with authentication and dispatch
  const io = await setupSocketIO(httpServer);

  // Make io accessible to routes
  app.set("io", io);

  // Start server
  httpServer.listen(env.PORT, () => {
    console.log(`
╔═══════════════════════════════════════════╗
║                                           ║
║   🚀 AllGo API Server                    ║
║                                           ║
║   Port: ${env.PORT.toString().padEnd(34)}║
║   Env:  ${env.NODE_ENV.padEnd(34)}║
║                                           ║
╚═══════════════════════════════════════════╝
    `);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    
    httpServer.close(async () => {
      console.log("HTTP server closed");
      io.close();
      await disconnectDatabase();
      await disconnectRedis();
      process.exit(0);
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
      console.error("Forced shutdown after timeout");
      process.exit(1);
    }, 30000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
