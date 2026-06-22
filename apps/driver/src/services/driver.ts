/**
 * AllGO Driver API Service
 * 
 * Handles driver-specific API calls:
 * - Online/Offline toggle
 * - Night mode toggle (Section 20)
 * - Profile updates
 */

import { driverAuthService } from "./auth";
import { API_BASE_URL } from "../constants/config";

interface DriverStatus {
  isOnline: boolean;
  nightMode: boolean;
  isApproved: boolean;
  vehicleType: string;
  totalTrips: number;
}

interface ToggleResponse {
  success: boolean;
  message: string;
}

class DriverApiService {
  /**
   * Get current driver status
   */
  async getStatus(): Promise<DriverStatus | null> {
    try {
      const response = await driverAuthService.authenticatedFetch(
        `${API_BASE_URL}/driver/status`
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to get driver status");
      }
      
      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error("[DriverAPI] getStatus error:", error);
      return null;
    }
  }

  /**
   * Toggle online/offline status
   */
  async setOnline(isOnline: boolean): Promise<ToggleResponse> {
    try {
      const response = await driverAuthService.authenticatedFetch(
        `${API_BASE_URL}/driver/online`,
        {
          method: "PATCH",
          body: JSON.stringify({ isOnline }),
        }
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update online status");
      }
      
      const data = await response.json();
      return {
        success: true,
        message: data.data.message,
      };
    } catch (error) {
      console.error("[DriverAPI] setOnline error:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to update status",
      };
    }
  }

  /**
   * Toggle night mode (Section 20: Night Priority Service)
   * When enabled, driver receives requests during 9pm-5am
   */
  async setNightMode(nightMode: boolean): Promise<ToggleResponse> {
    try {
      const response = await driverAuthService.authenticatedFetch(
        `${API_BASE_URL}/driver/night-mode`,
        {
          method: "PATCH",
          body: JSON.stringify({ nightMode }),
        }
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update night mode");
      }
      
      const data = await response.json();
      return {
        success: true,
        message: data.data.message,
      };
    } catch (error) {
      console.error("[DriverAPI] setNightMode error:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to update night mode",
      };
    }
  }

  /**
   * Section 4A: subscription status, payment instructions, submission history
   */
  async getSubscription(): Promise<any | null> {
    try {
      const response = await driverAuthService.authenticatedFetch(
        `${API_BASE_URL}/driver/subscription`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to get subscription status");
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error("[DriverAPI] getSubscription error:", error);
      return null;
    }
  }

  /**
   * Section 4A: submit proof of subscription payment for admin review
   */
  async submitPayment(reference: string, screenshotUrl?: string): Promise<ToggleResponse> {
    try {
      const response = await driverAuthService.authenticatedFetch(
        `${API_BASE_URL}/driver/subscription/submit-payment`,
        {
          method: "POST",
          body: JSON.stringify({ reference, screenshotUrl }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to submit payment proof");
      }

      const data = await response.json();
      return { success: true, message: data.data.message };
    } catch (error) {
      console.error("[DriverAPI] submitPayment error:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to submit payment proof",
      };
    }
  }

  /**
   * Register/update this driver's Expo push token - the wake-up channel
   * for job offers when the Socket.io connection has died (backgrounded
   * app). See services/notifications.ts for where this is called from.
   */
  async registerPushToken(pushToken: string): Promise<ToggleResponse> {
    try {
      const response = await driverAuthService.authenticatedFetch(
        `${API_BASE_URL}/driver/push-token`,
        {
          method: "PATCH",
          body: JSON.stringify({ pushToken }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to register push token");
      }

      const data = await response.json();
      return { success: true, message: data.data.message };
    } catch (error) {
      console.error("[DriverAPI] registerPushToken error:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to register push token",
      };
    }
  }

  /**
   * Get full driver profile
   */
  async getProfile(): Promise<any | null> {
    try {
      const response = await driverAuthService.authenticatedFetch(
        `${API_BASE_URL}/driver/profile`
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to get profile");
      }
      
      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error("[DriverAPI] getProfile error:", error);
      return null;
    }
  }
}

export const driverApiService = new DriverApiService();
