import { randomInt, randomBytes } from "crypto";

/**
 * Generate a random numeric OTP code
 */
export function generateOtp(length: number = 6): string {
  let otp = "";
  for (let i = 0; i < length; i++) {
    otp += randomInt(0, 10).toString();
  }
  return otp;
}

/**
 * Generate a unique referral code
 */
export function generateReferralCode(prefix: string = "HG"): string {
  const random = randomBytes(4).toString("hex").toUpperCase();
  return `${prefix}${random}`;
}

/**
 * Generate an idempotency key
 */
export function generateIdempotencyKey(): string {
  return randomBytes(16).toString("hex");
}
