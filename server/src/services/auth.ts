import { prisma, redis } from "../config";
import { generateOtp, generateReferralCode, normalizeGhanaPhone } from "../utils";
import { sendOtpSms } from "./sms";
import { generateTokens, verifyToken, generatePendingTotpToken, TokenPair } from "./jwt";
import { createError } from "../middleware";

const OTP_EXPIRY_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 3;
const RATE_LIMIT_KEY = "otp:rate:";

export interface OtpRequestResult {
  success: boolean;
  phone: string;
  expiresAt: Date;
  message: string;
}

export interface OtpVerifyResult {
  success: boolean;
  tokens?: TokenPair;
  requiresTotp?: boolean;
  pendingToken?: string;
  user: {
    id: string;
    phone: string;
    name: string | null;
    role: string;
    isNewUser: boolean;
  };
}

/**
 * Request OTP for phone number
 */
export async function requestOtp(phone: string): Promise<OtpRequestResult> {
  // Normalize phone number
  const normalizedPhone = normalizeGhanaPhone(phone);
  if (!normalizedPhone) {
    throw createError("Invalid Ghana phone number", 400, "INVALID_PHONE");
  }

  // Check rate limit
  const rateLimitKey = `${RATE_LIMIT_KEY}${normalizedPhone}`;
  const attempts = await redis.incr(rateLimitKey);
  
  if (attempts === 1) {
    await redis.expire(rateLimitKey, 3600); // 1 hour window
  }
  
  if (attempts > 5) {
    throw createError(
      "Too many OTP requests. Please try again later.",
      429,
      "OTP_RATE_LIMIT"
    );
  }

  // Generate OTP
  const code = generateOtp(6);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  // Invalidate any existing OTPs for this phone
  await prisma.otpCode.updateMany({
    where: { phone: normalizedPhone, usedAt: null },
    data: { usedAt: new Date() },
  });

  // Store new OTP
  await prisma.otpCode.create({
    data: {
      phone: normalizedPhone,
      code,
      expiresAt,
    },
  });

  // Send SMS
  const smsResult = await sendOtpSms(normalizedPhone, code);
  if (!smsResult.success) {
    throw createError("Failed to send OTP. Please try again.", 500, "SMS_FAILED");
  }

  return {
    success: true,
    phone: normalizedPhone,
    expiresAt,
    message: "OTP sent successfully",
  };
}

/**
 * Record a wrong OTP attempt using ONLY database-atomic guarded mutations.
 *
 * Concurrency fence: never read -> compute -> write the attempt counter.
 * Under concurrency the counter may only move through two mutually
 * exclusive guarded updateMany transitions:
 *
 *   1. increment while attempts < MAX-1  (guarded atomic increment)
 *   2. invalidate while attempts >= MAX-1 (guarded atomic terminal mark)
 *
 * Each predicate also re-checks usedAt/expiresAt, so a request that loses
 * the race against a successful verification, an expiry, or another
 * request's invalidation mutates nothing and falls through to the normal
 * INVALID_OTP path.
 *
 * Each guarded mutation evaluates expiry against its own FRESH timestamp:
 * the increment await may itself take long enough for the OTP to expire,
 * so the terminal invalidation must not reuse the pre-increment Date or
 * it could mark an already-expired OTP used / over-count attempts against
 * a stale fence.
 */
async function recordWrongOtpAttempt(existingOtpId: string): Promise<void> {
  // Fresh fence for the increment guard.
  const incrementNow = new Date();

  // Guarded atomic increment: succeeds only while the OTP is still active
  // and has not yet reached the final (MAX-1) wrong-attempt slot.
  const incremented = await prisma.otpCode.updateMany({
    where: {
      id: existingOtpId,
      usedAt: null,
      expiresAt: { gt: incrementNow },
      attempts: { lt: OTP_MAX_ATTEMPTS - 1 },
    },
    data: {
      attempts: { increment: 1 },
    },
  });

  if (incremented.count === 1) {
    // Non-terminal wrong attempt.
    return;
  }

  // The increment guard failed: either the OTP was already at the terminal
  // slot, or another request already used/expired/invalidated it. Try the
  // terminal transition - invalidating THIS otp only if it is still the
  // live one sitting at the final allowed wrong attempt.
  //
  // Fresh fence: time passed while the increment awaited, and the OTP may
  // legitimately have expired in between. Re-evaluate expiry against NOW,
  // not against the stale incrementNow, so an expired OTP is left alone.
  const terminalNow = new Date();

  const invalidated = await prisma.otpCode.updateMany({
    where: {
      id: existingOtpId,
      usedAt: null,
      expiresAt: { gt: terminalNow },
      attempts: { gte: OTP_MAX_ATTEMPTS - 1 },
    },
    data: {
      usedAt: new Date(),
    },
  });

  if (invalidated.count === 1) {
    throw createError("Too many attempts. Please request a new code.", 400, "OTP_MAX_ATTEMPTS");
  }

  // Both guards lost the race: another request already handled this OTP
  // (used, expired, or invalidated). Do not mutate; fall through to the
  // normal INVALID_OTP behavior in the caller.
}

/**
 * Verify OTP and return tokens
 */
export async function verifyOtp(
  phone: string,
  code: string,
  deviceId?: string
): Promise<OtpVerifyResult> {
  // Normalize phone number
  const normalizedPhone = normalizeGhanaPhone(phone);
  if (!normalizedPhone) {
    throw createError("Invalid phone number", 400, "INVALID_PHONE");
  }

  // Find valid OTP
  const otp = await prisma.otpCode.findFirst({
    where: {
      phone: normalizedPhone,
      code,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) {
    // Wrong code: find the currently active OTP for this phone and record
    // the attempt atomically (see recordWrongOtpAttempt).
    const existingOtp = await prisma.otpCode.findFirst({
      where: {
        phone: normalizedPhone,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (existingOtp) {
      await recordWrongOtpAttempt(existingOtp.id);
    }

    throw createError("Invalid or expired OTP", 400, "INVALID_OTP");
  }

  // Atomically consume the exact OTP before any downstream authentication
  // side effects. The fresh expiry fence closes the lookup->consume window.
  const consumeNow = new Date();
  const consumed = await prisma.otpCode.updateMany({
    where: {
      id: otp.id,
      usedAt: null,
      expiresAt: { gt: consumeNow },
    },
    data: { usedAt: consumeNow },
  });

  if (consumed.count !== 1) {
    throw createError("Invalid or expired OTP", 400, "INVALID_OTP");
  }

  // Find or create user
  let user = await prisma.user.findUnique({
    where: { phone: normalizedPhone },
    include: { customer: true, admin: true },
  });

  let isNewUser = false;

  if (!user) {
    isNewUser = true;
    user = await prisma.user.create({
      data: {
        phone: normalizedPhone,
        role: "CUSTOMER",
        customer: {
          create: {},
        },
      },
      include: { customer: true, admin: true },
    });
  }

  if (!user) {
    throw new Error("Failed to create user");
  }

  // Section 4B: a deactivated account (e.g. a removed branch admin) must be
  // rejected at login itself, not just on subsequent requireAuth calls -
  // otherwise they get a working token for a few minutes before every
  // following request starts failing
  if (!user.isActive) {
    throw createError("This account has been deactivated", 403, "ACCOUNT_DEACTIVATED");
  }

  // Clear rate limit on successful OTP verification (independent of 2FA)
  await redis.del(`${RATE_LIMIT_KEY}${normalizedPhone}`);

  // Admins with TOTP enabled don't get real tokens yet - the OTP only
  // proves phone possession, which is the FIRST factor. A pending token
  // must be exchanged for real tokens via POST /auth/2fa/verify.
  if (user.role === "ADMIN" && user.admin?.totpEnabled) {
    const pendingToken = generatePendingTotpToken(user.id, user.phone, user.role);
    return {
      success: true,
      requiresTotp: true,
      pendingToken,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        role: user.role,
        isNewUser,
      },
    };
  }

  // Generate tokens
  const tokens = generateTokens(user.id, user.phone, user.role);

  // Store refresh token
  await prisma.refreshToken.create({
    data: {
      token: tokens.refreshToken,
      userId: user.id,
      deviceId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  });

  return {
    success: true,
    tokens,
    user: {
      id: user.id,
      phone: user.phone,
      name: user.name,
      role: user.role,
      isNewUser,
    },
  };
}

/**
 * Refresh access token
 */
export async function refreshAccessToken(refreshToken: string): Promise<TokenPair> {
  // Verify token
  const payload = verifyToken(refreshToken, "refresh");
  if (!payload || payload.type !== "refresh") {
    throw createError("Invalid refresh token", 401, "INVALID_TOKEN");
  }

  // Check if token exists in database
  const storedToken = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    include: { user: true },
  });

  if (!storedToken || storedToken.expiresAt < new Date()) {
    throw createError("Refresh token expired", 401, "TOKEN_EXPIRED");
  }

  if (!storedToken.user.isActive) {
    throw createError("This account has been deactivated", 403, "ACCOUNT_DEACTIVATED");
  }

  // Generate new tokens
  const tokens = generateTokens(
    storedToken.user.id,
    storedToken.user.phone,
    storedToken.user.role
  );

  // Rotate refresh token
  await prisma.refreshToken.delete({ where: { id: storedToken.id } });
  await prisma.refreshToken.create({
    data: {
      token: tokens.refreshToken,
      userId: storedToken.user.id,
      deviceId: storedToken.deviceId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return tokens;
}

/**
 * Logout - invalidate refresh token
 */
export async function logout(refreshToken: string): Promise<void> {
  await prisma.refreshToken.delete({ where: { token: refreshToken } });
}

/**
 * Dev-only login bypass
 */
export async function devLogin(
  phone: string,
  role: string = "CUSTOMER"
): Promise<OtpVerifyResult> {
  if (process.env.NODE_ENV === "production") {
    throw createError("Dev login not allowed in production", 403);
  }

  const normalizedPhone = normalizeGhanaPhone(phone);
  if (!normalizedPhone) {
    throw createError("Invalid phone number", 400, "INVALID_PHONE");
  }

  let user = await prisma.user.findUnique({
    where: { phone: normalizedPhone },
  });

  let isNewUser = false;
  if (!user) {
    isNewUser = true;
    user = await prisma.user.create({
      data: {
        phone: normalizedPhone,
        role: role as any,
        [role.toLowerCase()]: {
          create: {},
        },
      },
    });
  }

  const tokens = generateTokens(user.id, user.phone, user.role);

  await prisma.refreshToken.create({
    data: {
      token: tokens.refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return {
    success: true,
    tokens,
    user: {
      id: user.id,
      phone: user.phone,
      name: user.name,
      role: user.role,
      isNewUser,
    },
  };
}

/**
 * Logout from all devices
 */
export async function logoutAll(userId: string): Promise<void> {
  await prisma.refreshToken.deleteMany({
    where: { userId },
  });
}
