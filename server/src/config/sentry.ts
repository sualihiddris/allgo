import * as Sentry from "@sentry/node";
import { env } from "./env";

/**
 * Error tracking - skipped entirely if SENTRY_DSN isn't set (e.g. local
 * dev), same opt-in pattern as the Google Maps mock-provider fallback.
 * Must be called before any other imports that should be instrumented -
 * see the top of server.ts.
 */
export function initSentry(): void {
  if (!env.SENTRY_DSN) {
    console.log("⚠️  Sentry: DSN not set, error tracking disabled");
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === "production" ? 0.1 : 1.0,
  });

  console.log("✅ Sentry: error tracking enabled");
}

export { Sentry };
