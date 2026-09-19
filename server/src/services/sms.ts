import { env } from "../config";

interface SmsResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

const SMS_REQUEST_TIMEOUT_MS = 15_000;

/**
 * Send SMS via Arkesel API
 * https://developers.arkesel.com/
 */
export async function sendSms(phone: string, message: string): Promise<SmsResponse> {
  if (!env.ARKESEL_API_KEY) {
    // Development mode - log to console
    console.log(`[SMS] To: ${phone}`);
    console.log(`[SMS] Message: ${message}`);
    return { success: true, messageId: "dev-mode" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    SMS_REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(
      "https://sms.arkesel.com/api/v2/sms/send",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": env.ARKESEL_API_KEY,
        },
        body: JSON.stringify({
          sender: "AllGo",
          recipients: [phone],
          message,
        }),
        signal: controller.signal,
      }
    );

    const data: any = await response.json();

    if (data.status === "success") {
      return {
        success: true,
        messageId: data.data?.[0]?.id,
      };
    }

    return {
      success: false,
      error: data.message || "SMS failed",
    };
  } catch (error) {
    console.error("SMS error:", error);

    return {
      success: false,
      error: "SMS service unavailable",
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Send OTP via SMS
 */
export async function sendOtpSms(phone: string, code: string): Promise<SmsResponse> {
  const message = `Your AllGo verification code is: ${code}. Valid for 10 minutes. Do not share this code.`;
  return sendSms(phone, message);
}
