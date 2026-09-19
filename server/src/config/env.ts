import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  ENABLE_DEV_LOGIN: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),

  PORT: z.coerce.number().default(3000),
  
  // Database
  DATABASE_URL: z.string(),
  
  // Redis may fall back to the in-memory store outside production.
  // Production requires a real shared Redis instance because OTP issuance,
  // dispatch coordination, and Socket.IO cross-instance behavior depend on it.
  REDIS_URL: z.string().trim().optional().default(""),
  
  // JWT
    JWT_SECRET: z.string().min(16),
    JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_TOTP_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default("15m"),
  JWT_REFRESH_EXPIRY: z.string().default("7d"),
  
  // External services
  ARKESEL_API_KEY: z.string().optional(),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  
  // Rate limiting
  OTP_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(3600000), // 1 hour
  OTP_RATE_LIMIT_MAX: z.coerce.number().default(5),
}).superRefine((values, ctx) => {
  if (values.NODE_ENV === "production" && !values.REDIS_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["REDIS_URL"],
      message: "REDIS_URL is required in production",
    });
  }
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  
  if (!parsed.success) {
    console.error("❌ Invalid environment variables:");
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  
  return parsed.data;
}

export const env = loadEnv();
export type Env = z.infer<typeof envSchema>;
