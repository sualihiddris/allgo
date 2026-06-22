import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  
  // Database
  DATABASE_URL: z.string(),
  
  // Redis (optional for development)
  REDIS_URL: z.string().optional().default(""),
  
  // JWT
  JWT_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRY: z.string().default("15m"),
  JWT_REFRESH_EXPIRY: z.string().default("7d"),
  
  // External services
  ARKESEL_API_KEY: z.string().optional(),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  
  // Rate limiting
  OTP_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(3600000), // 1 hour
  OTP_RATE_LIMIT_MAX: z.coerce.number().default(5),
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
