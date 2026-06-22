import jwt, { SignOptions } from "jsonwebtoken";
import { randomUUID } from "crypto";
import { env } from "../config";

export interface JwtPayload {
  sub: string; // userId
  phone: string;
  role: string;
  type: "access" | "refresh" | "totp_pending";
  jti?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Generate access and refresh tokens
 */
export function generateTokens(userId: string, phone: string, role: string): TokenPair {
  const accessJti = randomUUID();
  const refreshJti = randomUUID();

  const accessPayload: JwtPayload = {
    sub: userId,
    phone,
    role,
    type: "access",
    jti: accessJti,
  };

  const refreshPayload: JwtPayload = {
    sub: userId,
    phone,
    role,
    type: "refresh",
    jti: refreshJti,
  };

  // Convert expiry strings to seconds for jwt.sign
  const accessExpiresIn = parseExpiry(env.JWT_ACCESS_EXPIRY);
  const refreshExpiresIn = parseExpiry(env.JWT_REFRESH_EXPIRY);

  const accessToken = jwt.sign(accessPayload, env.JWT_SECRET, {
    expiresIn: accessExpiresIn,
  });

  const refreshToken = jwt.sign(refreshPayload, env.JWT_SECRET, {
    expiresIn: refreshExpiresIn,
  });

  return { accessToken, refreshToken, expiresIn: accessExpiresIn };
}

/**
 * Verify a JWT token
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Short-lived token issued after OTP success for an admin with TOTP
 * enabled - proves phone possession but not yet full auth. Must be
 * exchanged for real tokens via POST /auth/2fa/verify within 5 minutes.
 */
export function generatePendingTotpToken(userId: string, phone: string, role: string): string {
  const payload: JwtPayload = { sub: userId, phone, role, type: "totp_pending" };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: 300 });
}

/**
 * Parse expiry string to seconds
 */
function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) return 900; // default 15 minutes

  const [, num, unit] = match;
  const value = parseInt(num, 10);

  switch (unit) {
    case "s": return value;
    case "m": return value * 60;
    case "h": return value * 3600;
    case "d": return value * 86400;
    default: return 900;
  }
}
