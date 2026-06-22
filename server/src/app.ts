import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { env } from "./config";
import { errorHandler, notFoundHandler, requestId, generalRateLimit } from "./middleware";
import { apiRouter } from "./routes";

export function createApp(): Application {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors({
    origin: env.NODE_ENV === "production" 
      ? ["https://admin.allgo.com"] 
      : "*",
    credentials: true,
  }));

  // Request parsing
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Request tracking & logging
  app.use(requestId);
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

  // Rate limiting
  app.use(generalRateLimit);

  // Trust proxy for correct IP detection behind load balancers
  app.set("trust proxy", 1);

  // API routes
  app.use("/api/v1", apiRouter);

  // Root endpoint
  app.get("/", (req, res) => {
    res.json({
      name: "AllGo API",
      version: "0.1.0",
      status: "running",
    });
  });

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
