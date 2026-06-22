import { Router, Request, Response } from "express";
import { prisma, redis } from "../config";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  const checks: Record<string, "ok" | "error"> = {
    server: "ok",
    database: "error",
    redis: "error",
  };
  
  // Check database
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }
  
  // Check Redis
  try {
    await redis.ping();
    checks.redis = "ok";
  } catch {
    checks.redis = "error";
  }
  
  const allHealthy = Object.values(checks).every((v) => v === "ok");
  
  res.status(allHealthy ? 200 : 503).json({
    success: allHealthy,
    status: allHealthy ? "healthy" : "degraded",
    checks,
    timestamp: new Date().toISOString(),
  });
});

export const healthRouter = router;
