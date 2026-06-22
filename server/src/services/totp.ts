import { authenticator } from "otplib";
import * as QRCode from "qrcode";

const ISSUER = "AllGo Admin";

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export async function generateTotpQrCode(phone: string, secret: string): Promise<string> {
  const uri = authenticator.keyuri(phone, ISSUER, secret);
  return QRCode.toDataURL(uri);
}

export function verifyTotpCode(code: string, secret: string): boolean {
  try {
    return authenticator.check(code, secret);
  } catch {
    return false;
  }
}
