import { beforeAll, describe, expect, it } from "vitest";

let envSchema: typeof import("./env").envSchema;

const validBaseEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "mysql://root:root@localhost:3306/allgo_test",
  JWT_SECRET: "test-secret-key-for-testing-only",
  JWT_ACCESS_SECRET: "test-access-secret-key-distinct-32chars-min",
  JWT_REFRESH_SECRET: "test-refresh-secret-key-distinct-32chars-min",
  JWT_TOTP_SECRET: "test-totp-secret-key-distinct-32chars-min",
};

beforeAll(async () => {
  Object.assign(process.env, validBaseEnv);

  const envModule = await import("./env");
  envSchema = envModule.envSchema;
});

describe("production Redis environment requirement", () => {
  it("rejects production when REDIS_URL is missing", () => {
    const result = envSchema.safeParse({
      ...validBaseEnv,
      NODE_ENV: "production",
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error.flatten().fieldErrors.REDIS_URL).toContain(
        "REDIS_URL is required in production"
      );
    }
  });

  it("rejects production when REDIS_URL is blank", () => {
    const result = envSchema.safeParse({
      ...validBaseEnv,
      NODE_ENV: "production",
      REDIS_URL: "   ",
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.error.flatten().fieldErrors.REDIS_URL).toContain(
        "REDIS_URL is required in production"
      );
    }
  });

  it("allows the in-memory fallback outside production", () => {
    const result = envSchema.safeParse({
      ...validBaseEnv,
      NODE_ENV: "development",
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.REDIS_URL).toBe("");
    }
  });

  it("accepts production with a real Redis URL configured", () => {
    const result = envSchema.safeParse({
      ...validBaseEnv,
      NODE_ENV: "production",
      REDIS_URL: "redis://redis.internal:6379",
    });

    expect(result.success).toBe(true);
  });
});
