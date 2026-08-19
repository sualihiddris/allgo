import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { requestOtp, verifyOtp, refreshAccessToken, logout } from "../services/auth";
import { authRateLimit, requireAuth } from "../middleware";
import { sendSuccess } from "../utils";
import { prisma } from "../config";
import { verifyToken, generateTokens } from "../services/jwt";
import { verifyTotpCode } from "../services/totp";

const router = Router();

// Validation schemas
const requestOtpSchema = z.object({
  phone: z.string().min(9).max(15),
});

const verifyOtpSchema = z.object({
  phone: z.string().min(9).max(15),
  code: z.string().length(6),
  deviceId: z.string().optional(),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

const verify2faSchema = z.object({
  pendingToken: z.string().min(1),
  code: z.string().length(6),
  deviceId: z.string().optional(),
});

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  photoUrl: z.string().url().optional(),
});




/**
 * POST /auth/otp/request
 * Request OTP for phone number
 */
router.post(
  "/otp/request",
  authRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { phone } = requestOtpSchema.parse(req.body);
      const result = await requestOtp(phone);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /auth/otp/verify
 * Verify OTP and get tokens
 */
router.post(
  "/otp/verify",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { phone, code, deviceId } = verifyOtpSchema.parse(req.body);
      const result = await verifyOtp(phone, code, deviceId);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /auth/2fa/verify
 * Second step of admin login: exchange a pending token + TOTP code
 * (from POST /auth/otp/verify's requiresTotp response) for real tokens
 */
router.post(
  "/2fa/verify",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { pendingToken, code, deviceId } = verify2faSchema.parse(req.body);

      const payload = verifyToken(pendingToken, "totp_pending");
      if (!payload || payload.type !== "totp_pending") {
        return res.status(401).json({
          success: false,
          error: { code: "INVALID_TOKEN", message: "Invalid or expired pending token" },
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        include: { admin: true },
      });

      if (!user?.admin?.totpSecret || !verifyTotpCode(code, user.admin.totpSecret)) {
        return res.status(401).json({
          success: false,
          error: { code: "INVALID_CODE", message: "Invalid authenticator code" },
        });
      }

      const tokens = generateTokens(user.id, user.phone, user.role);

      await prisma.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: user.id,
          deviceId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      sendSuccess(res, {
        tokens,
        user: { id: user.id, phone: user.phone, name: user.name, role: user.role, isNewUser: false },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /auth/refresh
 * Refresh access token
 */
router.post(
  "/refresh",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refreshToken } = refreshTokenSchema.parse(req.body);
      const tokens = await refreshAccessToken(refreshToken);
      sendSuccess(res, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        tokenType: "Bearer",
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /auth/logout
 * Invalidate refresh token
 */
router.post(
  "/logout",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refreshToken } = refreshTokenSchema.parse(req.body);
      await logout(refreshToken);
      sendSuccess(res, { message: "Logged out successfully" });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /auth/me
 * Get current user profile
 */
router.get(
  "/me",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: {
          id: true,
          phone: true,
          name: true,
          role: true,
          createdAt: true,
          customer: true,
          driver: true,
          admin: true,
        },
      });

      sendSuccess(res, user);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /auth/me
 * Update current user profile
 */
router.patch(
  "/me",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updates = updateProfileSchema.parse(req.body);
      
      const user = await prisma.user.update({
        where: { id: req.user!.id },
        data: updates,
        select: {
          id: true,
          phone: true,
          name: true,
          role: true,
        },
      });

      sendSuccess(res, user);
    } catch (error) {
      next(error);
    }
  }
);

const dataRequestSchema = z.object({
  type: z.enum(["ACCESS", "DELETION"]),
});

/**
 * POST /auth/me/data-request
 * Section 4C: data access/deletion request - fulfillment is a manual
 * admin process in MVP, this just creates a real, trackable request
 */
router.post(
  "/me/data-request",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { type } = dataRequestSchema.parse(req.body);

      const request = await prisma.dataRequest.create({
        data: { userId: req.user!.id, type },
      });

      sendSuccess(res, {
        request,
        message:
          type === "DELETION"
            ? "Your deletion request has been submitted. An admin will process it and contact you if needed."
            : "Your data access request has been submitted. An admin will respond with your data.",
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /auth/dev/login
 * Development-only: Login without OTP
 */
router.post(
  "/dev/login",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Only in development
      if (process.env.NODE_ENV === "production") {
        return res.status(404).json({ error: "Not found" });
      }

      const { phone, role = "CUSTOMER" } = req.body;
      
      if (!phone) {
        return res.status(400).json({ error: "Phone required" });
      }

      const { normalizeGhanaPhone } = await import("../utils");
      const { generateTokens } = await import("../services/jwt");

      const normalizedPhone = normalizeGhanaPhone(phone);
      if (!normalizedPhone) {
        return res.status(400).json({ error: "Invalid phone" });
      }

      // Find or create user
      let user = await prisma.user.findUnique({
        where: { phone: normalizedPhone },
        include: { customer: true, driver: true, admin: true },
      });

      let isNewUser = false;

      if (!user) {
        isNewUser = true;
        if (role === "ADMIN") {
          user = await prisma.user.create({
            data: {
              phone: normalizedPhone,
              name: "Test Admin",
              role: "ADMIN",
              admin: {
                create: {},
              },
            },
            include: { customer: true, driver: true, admin: true },
          });
        } else if (role === "DRIVER") {
          user = await prisma.user.create({
            data: {
              phone: normalizedPhone,
              name: "Test Driver",
              role: "DRIVER",
              driver: {
                create: {
                  vehicleType: "MOTO",
                  licensePlate: "TEST-001",
                  isOnline: true,
                  isApproved: true,
                },
              },
            },
            include: { customer: true, driver: true, admin: true },
          });
        } else {
          user = await prisma.user.create({
            data: {
              phone: normalizedPhone,
              name: "Test Customer",
              role: "CUSTOMER",
              customer: {
                create: {},
              },
            },
            include: { customer: true, driver: true, admin: true },
          });
        }
      } else {
        // A phone can hold multiple roles in dev (e.g. test the same number
        // as both customer and driver). Ensure the requested role's
        // sub-record exists, and always sync `role` to the one actually
        // being used this session - otherwise the JWT's role claim (and the
        // socket room a stale token joins) reflects whichever role was used
        // last, not the one the caller asked for.
        const hasRequestedRole =
          (role === "ADMIN" && user.admin) ||
          (role === "DRIVER" && user.driver) ||
          (role === "CUSTOMER" && user.customer);

        if (!hasRequestedRole) {
          if (role === "ADMIN") {
            user = await prisma.user.update({
              where: { id: user.id },
              data: { role: "ADMIN", admin: { create: {} } },
              include: { customer: true, driver: true, admin: true },
            });
          } else if (role === "DRIVER") {
            user = await prisma.user.update({
              where: { id: user.id },
              data: {
                role: "DRIVER",
                driver: {
                  create: { vehicleType: "MOTO", licensePlate: "TEST-002", isOnline: true, isApproved: true },
                },
              },
              include: { customer: true, driver: true, admin: true },
            });
          } else {
            user = await prisma.user.update({
              where: { id: user.id },
              data: { role: "CUSTOMER", customer: { create: {} } },
              include: { customer: true, driver: true, admin: true },
            });
          }
        } else if (user.role !== role) {
          user = await prisma.user.update({
            where: { id: user.id },
            data: { role },
            include: { customer: true, driver: true, admin: true },
          });
        }
      }

      if (!user) {
        return res.status(500).json({ error: "Failed to create user" });
      }

      // Section 4B: keep dev-login consistent with the real OTP path - a
      // deactivated account should be rejected here too, not just on
      // subsequent requireAuth-gated calls
      if (!user.isActive) {
        return res.status(403).json({ error: { code: "ACCOUNT_DEACTIVATED", message: "This account has been deactivated" } });
      }

      // Generate tokens
      const tokens = generateTokens(user.id, user.phone, user.role);

      // Store refresh token
      await prisma.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      return sendSuccess(res, {
        tokens,
        user: {
          id: user.id,
          phone: user.phone,
          name: user.name,
          role: user.role,
          isNewUser,
          customer: user.customer,
          driver: user.driver,
          admin: user.admin,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export const authRouter = router;
