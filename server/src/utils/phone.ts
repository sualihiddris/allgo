/**
 * Validate Ghana phone number
 * Accepts: +233XXXXXXXXX, 233XXXXXXXXX, 0XXXXXXXXX
 * Returns normalized format: +233XXXXXXXXX
 */
export function normalizeGhanaPhone(phone: string): string | null {
  // Remove all non-digit characters except leading +
  const cleaned = phone.replace(/[^\d+]/g, "");
  
  let normalized: string;
  
  if (cleaned.startsWith("+233")) {
    normalized = cleaned;
  } else if (cleaned.startsWith("233")) {
    normalized = "+" + cleaned;
  } else if (cleaned.startsWith("0")) {
    normalized = "+233" + cleaned.slice(1);
  } else if (cleaned.length === 9) {
    normalized = "+233" + cleaned;
  } else {
    return null;
  }
  
  // Validate length (+233 + 9 digits = 13 characters)
  if (normalized.length !== 13) {
    return null;
  }
  
  // Validate Ghana network prefixes (after +233)
  const networkPrefix = normalized.slice(4, 6);
  const validPrefixes = [
    "20", "23", "24", "25", "26", "27", "28", "29", // MTN
    "50", "54", "55", "59", // Vodafone
    "57", "56", "26", "27", // AirtelTigo
  ];
  
  if (!validPrefixes.includes(networkPrefix)) {
    return null;
  }
  
  return normalized;
}

/**
 * Check if phone is MTN (for MoMo)
 */
export function isMtnNumber(phone: string): boolean {
  const normalized = normalizeGhanaPhone(phone);
  if (!normalized) return false;
  
  const prefix = normalized.slice(4, 6);
  return ["20", "23", "24", "25", "26", "27", "28", "29"].includes(prefix);
}

/**
 * Check if phone is Vodafone
 */
export function isVodafoneNumber(phone: string): boolean {
  const normalized = normalizeGhanaPhone(phone);
  if (!normalized) return false;
  
  const prefix = normalized.slice(4, 6);
  return ["50", "54", "55", "59"].includes(prefix);
}
