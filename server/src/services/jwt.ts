import jwt, { SignOptions } from "jsonwebtoken";
import { randomUUID } from "crypto";
import { env } from "../config";

export interface JwtPayload {
  sub: string;
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
 * Signing-secret separation (Section 13 / Section 24 #11):
 *
 * Each token type is signed with, and can ONLY be verified with, its own
 * dedicated secret:
 *   - access        -> JWT_ACCESS_SECRET
 *   - refresh       -> JWT_REFRESH_SECRET
 *   - totp_pending  -> JWT_TOTP_SECRET
 *
 * This is a defense-in-depth layer ON TOP OF the payload `type` claim: even
 * if an attacker tampers with the `type` field in the payload, a token signed
 * with (say) the refresh secret simply will not pass signature verification
 * against the access secret, so it can never be accepted as an access token.
 *
 * The legacy JWT_SECRET is intentionally left configured for now (per current
 * migration plan) but is no longer used for signing or verifying any token.
 */
function secretForType(type: JwtPayload["type"]): string {
  switch (type) {
    case "access":
      return env.JWT_ACCESS_SECRET;
    case "refresh":
      return env.JWT_REFRESH_SECRET;
    case "totp_pending":
      return env.JWT_TOTP_SECRET;
  }
}

export function generateTokens(userId: string, phone: string, role: string): TokenPair {
  const accessJti = randomUUID();
  const refreshJti = randomUUID();

  const accessPayload: JwtPayload = { sub: userId, phone, role, type: "access", jti: accessJti };
  const refreshPayload: JwtPayload = { sub: userId, phone, role, type: "refresh", jti: refreshJti };

  const accessExpiresIn = parseExpiry(env.JWT_ACCESS_EXPIRY);
  const refreshExpiresIn = parseExpiry(env.JWT_REFRESH_EXPIRY);

  const accessToken = jwt.sign(accessPayload, secretForType("access"), { expiresIn: accessExpiresIn });
  const refreshToken = jwt.sign(refreshPayload, secretForType("refresh"), { expiresIn: refreshExpiresIn });

  return { accessToken, refreshToken, expiresIn: accessExpiresIn };
}

export function verifyToken(token: string, type: JwtPayload["type"]): JwtPayload | null {
  try {
    // Verify the signature using ONLY the secret dedicated to the expected
    // token type. A token signed for a different type is rejected here at the
    // signature check, before the payload is even inspected.
    const payload = jwt.verify(token, secretForType(type)) as JwtPayload;
    // Belt-and-suspenders: the payload type claim must also match the expected
    // type. A tampered type claim cannot help an attacker because the wrong
    // secret would already have failed verification above.
    if (payload.type !== type) return null;
    return payload;
  } catch {
    return null;
  }
}

export function generatePendingTotpToken(userId: string, phone: string, role: string): string {
  const payload: JwtPayload = { sub: userId, phone, role, type: "totp_pending" };
  return jwt.sign(payload, secretForType("totp_pending"), { expiresIn: 300 });
}

function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) return 900;
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
