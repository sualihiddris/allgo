import { Request, Response, NextFunction } from "express";
import { redis } from "../config";
import { createError } from "./errorHandler";

interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyPrefix?: string;
  message?: string;
}

export function rateLimit(options: RateLimitOptions) {
  const { windowMs, max, keyPrefix = "rl", message = "Too many requests" } = options;
  
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      const key = `${keyPrefix}:${ip}`;
      
      const current = await redis.incr(key);
      
      if (current === 1) {
        await redis.pexpire(key, windowMs);
      }
      
      const ttl = await redis.pttl(key);
      
      res.setHeader("X-RateLimit-Limit", max);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, max - current));
      res.setHeader("X-RateLimit-Reset", Date.now() + ttl);
      
      if (current > max) {
        throw createError(message, 429, "RATE_LIMIT_EXCEEDED");
      }
      
      next();
    } catch (error) {
      if ((error as any).statusCode === 429) {
        next(error);
      } else {
        // If Redis fails, allow the request (fail open)
        console.warn("Rate limit check failed:", error);
        next();
      }
    }
  };
}

// Pre-configured rate limiters
export const generalRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  keyPrefix: "rl:general",
});

export const authRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  keyPrefix: "rl:auth",
  message: "Too many authentication attempts. Please try again later.",
});
