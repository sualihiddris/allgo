/**
 * AllGO Driver Push Notification Service
 *
 * Wake-up channel for job offers when the driver's Socket.io connection
 * has died (backgrounded app) - see server/src/services/socket.ts's
 * dispatch loop. Mirrors services/location.ts's permission-request shape:
 * plain async service methods, boolean/void returns, no custom modal.
 */

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { driverApiService } from "./driver";

const LAST_REGISTERED_TOKEN_KEY = "driver_push_token_registered";

class NotificationService {
  /**
   * Request notification permissions
   */
  async requestPermissions(): Promise<boolean> {
    try {
      const { status } = await Notifications.requestPermissionsAsync();

      if (status !== "granted") {
        console.warn("Notification permission denied");
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error requesting notification permissions:", error);
      return false;
    }
  }

  /**
   * Get this device's Expo push token and register it with the server if
   * it's new or has changed since the last successful registration. Safe
   * to call on every app start - it's a no-op when the token is unchanged.
   */
  async registerPushToken(): Promise<void> {
    try {
      if (Platform.OS === "web") {
        console.log("Expo push notifications are not supported on web - skipping registration");
        return;
      }

      if (!Device.isDevice) {
        console.warn("Push notifications require a physical device - skipping simulator/emulator");
        return;
      }

      const hasPermission = await this.requestPermissions();
      if (!hasPermission) return;

      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) {
        console.warn("No EAS project ID configured - run `eas init` to enable push notifications");
        return;
      }

      const { data: pushToken } = await Notifications.getExpoPushTokenAsync({ projectId });

      const lastRegistered = await AsyncStorage.getItem(LAST_REGISTERED_TOKEN_KEY);
      if (lastRegistered === pushToken) {
        return;
      }

      const result = await driverApiService.registerPushToken(pushToken);
      if (result.success) {
        await AsyncStorage.setItem(LAST_REGISTERED_TOKEN_KEY, pushToken);
        console.log("✅ Push token registered");
      }
    } catch (error) {
      console.error("Error registering push token:", error);
    }
  }
}

export const notificationService = new NotificationService();
export default notificationService;
