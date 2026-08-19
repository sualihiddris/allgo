import { describe, it, expect, beforeEach, vi } from "vitest";
import jwt from "jsonwebtoken";

// Mock the config so tests don't depend on real environment variables.
// Each token type has its OWN distinct secret so the tests can prove that a
// token signed with one type's secret cannot be verified as another type -
// even if its payload `type` claim is tampered with.
vi.mock("../config", () => ({
  env: {
    // Legacy secret is still configured but must NOT be used by jwt.ts.
    JWT_SECRET: "legacy-secret-should-not-be-used",
    JWT_ACCESS_SECRET: "test-access-secret-distinct-value-0001",
    JWT_REFRESH_SECRET: "test-refresh-secret-distinct-value-0002",
    JWT_TOTP_SECRET: "test-totp-secret-distinct-value-0003",
    JWT_ACCESS_EXPIRY: "15m",
    JWT_REFRESH_EXPIRY: "7d",
  },
}));

import {
  generateTokens,
  verifyToken,
  generatePendingTotpToken,
  JwtPayload,
} from "./jwt";
import { env } from "../config";

const userId = "user-123";
const phone = "+233200000000";
const role = "CUSTOMER";

describe("generateTokens", () => {
  it("returns access, refresh tokens and expiresIn", () => {
    const pair = generateTokens(userId, phone, role);

    expect(pair.accessToken).toBeTypeOf("string");
    expect(pair.refreshToken).toBeTypeOf("string");
    // 15m -> 900 seconds
    expect(pair.expiresIn).toBe(900);
  });

  it("signs the access token with JWT_ACCESS_SECRET", () => {
    const { accessToken } = generateTokens(userId, phone, role);
    const payload = jwt.verify(accessToken, env.JWT_ACCESS_SECRET) as JwtPayload;

    expect(payload.sub).toBe(userId);
    expect(payload.phone).toBe(phone);
    expect(payload.role).toBe(role);
    expect(payload.type).toBe("access");
    expect(payload.jti).toBeTypeOf("string");
  });

  it("signs the refresh token with JWT_REFRESH_SECRET", () => {
    const { refreshToken } = generateTokens(userId, phone, role);
    const payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as JwtPayload;

    expect(payload.sub).toBe(userId);
    expect(payload.type).toBe("refresh");
    expect(payload.jti).toBeTypeOf("string");
  });

  it("does NOT sign the access token with the refresh or totp secret", () => {
    const { accessToken } = generateTokens(userId, phone, role);
    expect(() => jwt.verify(accessToken, env.JWT_REFRESH_SECRET)).toThrow();
    expect(() => jwt.verify(accessToken, env.JWT_TOTP_SECRET)).toThrow();
  });

  it("does NOT sign the refresh token with the access or totp secret", () => {
    const { refreshToken } = generateTokens(userId, phone, role);
    expect(() => jwt.verify(refreshToken, env.JWT_ACCESS_SECRET)).toThrow();
    expect(() => jwt.verify(refreshToken, env.JWT_TOTP_SECRET)).toThrow();
  });

  it("does NOT sign any token with the legacy JWT_SECRET", () => {
    const { accessToken, refreshToken } = generateTokens(userId, phone, role);
    const pending = generatePendingTotpToken(userId, phone, role);
    expect(() => jwt.verify(accessToken, env.JWT_SECRET)).toThrow();
    expect(() => jwt.verify(refreshToken, env.JWT_SECRET)).toThrow();
    expect(() => jwt.verify(pending, env.JWT_SECRET)).toThrow();
  });

  it("gives access and refresh tokens distinct jti values", () => {
    const { accessToken, refreshToken } = generateTokens(userId, phone, role);
    const access = jwt.verify(accessToken, env.JWT_ACCESS_SECRET) as JwtPayload;
    const refresh = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as JwtPayload;

    expect(access.jti).not.toBe(refresh.jti);
  });
});

describe("generatePendingTotpToken", () => {
  it("signs the totp_pending token with JWT_TOTP_SECRET", () => {
    const token = generatePendingTotpToken(userId, phone, role);
    const payload = jwt.verify(token, env.JWT_TOTP_SECRET) as JwtPayload;

    expect(payload.sub).toBe(userId);
    expect(payload.type).toBe("totp_pending");
  });

  it("does NOT sign the totp_pending token with the access or refresh secret", () => {
    const token = generatePendingTotpToken(userId, phone, role);
    expect(() => jwt.verify(token, env.JWT_ACCESS_SECRET)).toThrow();
    expect(() => jwt.verify(token, env.JWT_REFRESH_SECRET)).toThrow();
  });
});

describe("verifyToken", () => {
  it("verifies a valid access token when access is expected", () => {
    const { accessToken } = generateTokens(userId, phone, role);
    const payload = verifyToken(accessToken, "access");

    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe(userId);
    expect(payload?.type).toBe("access");
  });

  it("verifies a valid refresh token when refresh is expected", () => {
    const { refreshToken } = generateTokens(userId, phone, role);
    const payload = verifyToken(refreshToken, "refresh");

    expect(payload).not.toBeNull();
    expect(payload?.type).toBe("refresh");
  });

  it("verifies a valid totp_pending token when totp_pending is expected", () => {
    const token = generatePendingTotpToken(userId, phone, role);
    const payload = verifyToken(token, "totp_pending");

    expect(payload).not.toBeNull();
    expect(payload?.type).toBe("totp_pending");
  });

  describe("type mismatches (payload type claim only)", () => {
    it("rejects an access token where a refresh token is expected", () => {
      const { accessToken } = generateTokens(userId, phone, role);
      expect(verifyToken(accessToken, "refresh")).toBeNull();
    });

    it("rejects a refresh token where an access token is expected", () => {
      const { refreshToken } = generateTokens(userId, phone, role);
      expect(verifyToken(refreshToken, "access")).toBeNull();
    });

    it("rejects a totp_pending token where an access token is expected", () => {
      const token = generatePendingTotpToken(userId, phone, role);
      expect(verifyToken(token, "access")).toBeNull();
    });

    it("rejects an access token where a totp_pending token is expected", () => {
      const { accessToken } = generateTokens(userId, phone, role);
      expect(verifyToken(accessToken, "totp_pending")).toBeNull();
    });

    it("rejects a refresh token where a totp_pending token is expected", () => {
      const { refreshToken } = generateTokens(userId, phone, role);
      expect(verifyToken(refreshToken, "totp_pending")).toBeNull();
    });

    it("rejects a totp_pending token where a refresh token is expected", () => {
      const token = generatePendingTotpToken(userId, phone, role);
      expect(verifyToken(token, "refresh")).toBeNull();
    });
  });

  describe("signing-secret separation (tampered type claim)", () => {
    // These tests are the core of the hardening: they prove that a token
    // signed with one token-type secret cannot be verified as another type
    // EVEN IF the payload `type` claim is forged to the target type. The
    // wrong secret fails signature verification, so verifyToken returns null.

    it("rejects a refresh-secret-signed token forged to claim type=access", () => {
      const forged = jwt.sign(
        { sub: userId, phone, role, type: "access" } as JwtPayload,
        env.JWT_REFRESH_SECRET,
        { expiresIn: 900 }
      );
      // Payload claims access, but it was signed with the refresh secret.
      expect(verifyToken(forged, "access")).toBeNull();
    });

    it("rejects a totp-secret-signed token forged to claim type=access", () => {
      const forged = jwt.sign(
        { sub: userId, phone, role, type: "access" } as JwtPayload,
        env.JWT_TOTP_SECRET,
        { expiresIn: 900 }
      );
      expect(verifyToken(forged, "access")).toBeNull();
    });

    it("rejects an access-secret-signed token forged to claim type=refresh", () => {
      const forged = jwt.sign(
        { sub: userId, phone, role, type: "refresh" } as JwtPayload,
        env.JWT_ACCESS_SECRET,
        { expiresIn: 900 }
      );
      expect(verifyToken(forged, "refresh")).toBeNull();
    });

    it("rejects an access-secret-signed token forged to claim type=totp_pending", () => {
      const forged = jwt.sign(
        { sub: userId, phone, role, type: "totp_pending" } as JwtPayload,
        env.JWT_ACCESS_SECRET,
        { expiresIn: 900 }
      );
      expect(verifyToken(forged, "totp_pending")).toBeNull();
    });

    it("rejects a refresh-secret-signed token forged to claim type=totp_pending", () => {
      const forged = jwt.sign(
        { sub: userId, phone, role, type: "totp_pending" } as JwtPayload,
        env.JWT_REFRESH_SECRET,
        { expiresIn: 900 }
      );
      expect(verifyToken(forged, "totp_pending")).toBeNull();
    });

    it("rejects a token signed with the legacy JWT_SECRET for any type", () => {
      const legacyAccess = jwt.sign(
        { sub: userId, phone, role, type: "access" } as JwtPayload,
        env.JWT_SECRET,
        { expiresIn: 900 }
      );
      const legacyRefresh = jwt.sign(
        { sub: userId, phone, role, type: "refresh" } as JwtPayload,
        env.JWT_SECRET,
        { expiresIn: 900 }
      );
      const legacyPending = jwt.sign(
        { sub: userId, phone, role, type: "totp_pending" } as JwtPayload,
        env.JWT_SECRET,
        { expiresIn: 900 }
      );
      expect(verifyToken(legacyAccess, "access")).toBeNull();
      expect(verifyToken(legacyRefresh, "refresh")).toBeNull();
      expect(verifyToken(legacyPending, "totp_pending")).toBeNull();
    });
  });

  describe("expired tokens", () => {
    it("returns null for an expired access token", () => {
      const expired = jwt.sign(
        { sub: userId, phone, role, type: "access" } as JwtPayload,
        env.JWT_ACCESS_SECRET,
        { expiresIn: -1 }
      );
      expect(verifyToken(expired, "access")).toBeNull();
    });

    it("returns null for an expired totp_pending token", () => {
      const expired = jwt.sign(
        { sub: userId, phone, role, type: "totp_pending" } as JwtPayload,
        env.JWT_TOTP_SECRET,
        { expiresIn: -1 }
      );
      expect(verifyToken(expired, "totp_pending")).toBeNull();
    });
  });

  describe("malformed / invalid tokens", () => {
    it("returns null for a non-token string", () => {
      expect(verifyToken("not-a-jwt", "access")).toBeNull();
    });

    it("returns null for an empty string", () => {
      expect(verifyToken("", "access")).toBeNull();
    });

    it("returns null for a token signed with a different secret", () => {
      const foreign = jwt.sign(
        { sub: userId, phone, role, type: "access" } as JwtPayload,
        "wrong-secret",
        { expiresIn: 900 }
      );
      expect(verifyToken(foreign, "access")).toBeNull();
    });

    it("returns null for a token with a tampered payload", () => {
      const { accessToken } = generateTokens(userId, phone, role);
      const [header, , signature] = accessToken.split(".");
      const tamperedPayload = Buffer.from(
        JSON.stringify({ sub: "attacker", type: "access" })
      ).toString("base64url");
      const tampered = `${header}.${tamperedPayload}.${signature}`;
      expect(verifyToken(tampered, "access")).toBeNull();
    });
  });
});
