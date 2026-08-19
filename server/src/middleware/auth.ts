import { Request, Response, NextFunction } from "express";
import { verifyToken, JwtPayload } from "../services/jwt";
import { createError } from "./errorHandler";
import { prisma } from "../config";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        phone: string;
        role: string;
      };
    }
  }
}

/**
 * Require valid access token
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw createError("Missing authorization token", 401, "UNAUTHORIZED");
    }

    const token = authHeader.slice(7);
    const payload = verifyToken(token, "access");

    if (!payload) {
      throw createError("Invalid or expired token", 401, "INVALID_TOKEN");
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, phone: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw createError("User not found or inactive", 401, "USER_INACTIVE");
    }

    req.user = {
      id: user.id,
      phone: user.phone,
      role: user.role,
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Require specific role(s)
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(createError("Not authenticated", 401, "UNAUTHORIZED"));
    }

    if (!roles.includes(req.user.role)) {
      return next(createError("Insufficient permissions", 403, "FORBIDDEN"));
    }

    next();
  };
}

/**
 * Optional auth - sets req.user if a valid token is provided.
 * On ANY failure (malformed/expired token, DB error, etc.) the request
 * proceeds as anonymous. This must never block or crash the request.
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return next();
    }

    const token = authHeader.slice(7);

    let payload: JwtPayload | null = null;
    try {
      payload = verifyToken(token, "access");
    } catch {
      return next();
    }

    if (payload) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: payload.sub },
          select: { id: true, phone: true, role: true, isActive: true },
        });

        if (user && user.isActive) {
          req.user = {
            id: user.id,
            phone: user.phone,
            role: user.role,
          };
        }
      } catch (dbError) {
        console.error("optionalAuth: user lookup failed", dbError);
      }
    }

    next();
  } catch (error) {
    console.error("optionalAuth: unexpected error", error);
    next();
  }
}