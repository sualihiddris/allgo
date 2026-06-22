interface PushResponse {
  success: boolean;
  error?: string;
}

/**
 * Send a push notification via Expo's push service.
 *
 * No Firebase project or service-account credentials needed - Expo's push
 * API proxies to FCM/APNs on our behalf. This is the wake-up channel for
 * job offers when a driver's Socket.io connection has died (backgrounded
 * app) - see services/socket.ts's dispatch loop, which fires this alongside
 * the "trip:offer" socket emit, fire-and-forget.
 */
export async function sendPushNotification(
  pushToken: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<PushResponse> {
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        to: pushToken,
        title,
        body,
        data,
        priority: "high",
        channelId: "job-offers",
      }),
    });

    const result = (await response.json()) as {
      data?: { status?: string; message?: string };
    };

    if (result.data?.status === "error") {
      return { success: false, error: result.data.message || "Push send failed" };
    }

    return { success: true };
  } catch (error) {
    console.error("[Push] Error sending notification:", error);
    return { success: false, error: "Push service unavailable" };
  }
}
