export interface OTPRequestPayload {
  phone: string; // MSISDN
  channel?: "SMS"; // reserved for future channels
}

export interface OTPVerifyPayload {
  phone: string;
  code: string;
  deviceId?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
  tokenType: "Bearer";
}

export interface UserProfile {
  id: string;
  phone: string;
  name?: string;
  photoUrl?: string;
  createdAt: string;
}
