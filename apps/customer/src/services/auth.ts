import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { API_BASE_URL } from "../constants/config";

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";

// Web-compatible storage wrapper
const storage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === "web") {
      return localStorage.getItem(key);
    }
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") {
      localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async deleteItem(key: string): Promise<void> {
    if (Platform.OS === "web") {
      localStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

interface User {
  id: string;
  phone: string;
  name: string | null;
  role: string;
  isNewUser?: boolean;
}

interface OtpRequestResponse {
  success: boolean;
  data: {
    phone: string;
    expiresAt: string;
    message: string;
  };
}

interface OtpVerifyResponse {
  success: boolean;
  data: {
    tokens: AuthTokens;
    user: User;
  };
}

interface MeResponse {
  success: boolean;
  data: User & {
    photoUrl?: string;
    createdAt: string;
    customer?: {
      loyaltyPoints: number;
      loyaltyTier: string;
      referralCode: string;
    };
  };
}

class AuthService {
  private accessToken: string | null = null;

  async init(): Promise<boolean> {
    try {
      this.accessToken = await storage.getItem(ACCESS_TOKEN_KEY);
      return !!this.accessToken;
    } catch {
      return false;
    }
  }

  async requestOtp(phone: string): Promise<OtpRequestResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/otp/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "Failed to send OTP");
    }

    return response.json();
  }

  async verifyOtp(phone: string, code: string): Promise<OtpVerifyResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/otp/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "Invalid OTP");
    }

    const data: OtpVerifyResponse = await response.json();

    // Store tokens
    await this.setTokens(data.data.tokens);

    return data;
  }

  async refreshTokens(): Promise<boolean> {
    try {
      const refreshToken = await storage.getItem(REFRESH_TOKEN_KEY);
      if (!refreshToken) return false;

      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        await this.clearTokens();
        return false;
      }

      const data = await response.json();
      await this.setTokens(data.data);
      return true;
    } catch {
      return false;
    }
  }

  async getMe(): Promise<MeResponse["data"] | null> {
    try {
      const response = await this.authenticatedFetch(`${API_BASE_URL}/auth/me`);
      if (!response.ok) return null;
      const data: MeResponse = await response.json();
      return data.data;
    } catch {
      return null;
    }
  }

  async updateProfile(updates: { name?: string }): Promise<boolean> {
    try {
      const response = await this.authenticatedFetch(`${API_BASE_URL}/auth/me`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // Section 4C data access/deletion request - fulfillment is a manual
  // admin process in MVP, this just creates a real, trackable request
  async submitDataRequest(type: "ACCESS" | "DELETION"): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.authenticatedFetch(`${API_BASE_URL}/auth/me/data-request`, {
        method: "POST",
        body: JSON.stringify({ type }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || "Failed to submit request");
      }
      return { success: true, message: data.data.message };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to submit request",
      };
    }
  }

  async logout(): Promise<void> {
    try {
      const refreshToken = await storage.getItem(REFRESH_TOKEN_KEY);
      if (refreshToken) {
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
      }
    } finally {
      await this.clearTokens();
    }
  }

  async authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
    if (!this.accessToken) {
      const hasToken = await this.init();
      if (!hasToken) throw new Error("Not authenticated");
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.accessToken}`,
        ...options.headers,
      },
    });

    // Token expired - try refresh
    if (response.status === 401) {
      const refreshed = await this.refreshTokens();
      if (refreshed) {
        return fetch(url, {
          ...options,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.accessToken}`,
            ...options.headers,
          },
        });
      }
    }

    return response;
  }

  private async setTokens(tokens: AuthTokens): Promise<void> {
    this.accessToken = tokens.accessToken;
    await storage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    await storage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  }

  private async clearTokens(): Promise<void> {
    this.accessToken = null;
    await storage.deleteItem(ACCESS_TOKEN_KEY);
    await storage.deleteItem(REFRESH_TOKEN_KEY);
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  /**
   * Dev-only: Login without OTP
   */
  async devLogin(phone: string): Promise<OtpVerifyResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/dev/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, role: "CUSTOMER" }),
    });

    if (!response.ok) {
      try {
        const error = await response.json();
        throw new Error(error.error?.message || "Dev login failed");
      } catch (_) {
        throw new Error("Dev login failed");
      }
    }

    const data: OtpVerifyResponse = await response.json();
    await this.setTokens(data.data.tokens);
    return data;
  }
}

export const authService = new AuthService();
