# AllGo Monorepo

Trusted Rides. Reliable Delivery.

## Structure
- apps/customer — React Native (Expo) customer app
- apps/driver — React Native (Expo) driver app
- apps/admin — React web dashboard (Vite)
- server — Node.js API + Socket.io
- shared — Shared types/constants/utilities

## Build Timeline (rough)
- Weeks 1–2: foundation (monorepo, OTP auth, maps)
- Weeks 3–5: core ride flow (book → dispatch → track → rate)
- Weeks 6–8: payments + offline queues (WatermelonDB)
- Weeks 9–11: delivery (multi-stop, proof photos, scheduler)
- Weeks 11–13: admin (live map, billing, alerts, verification)
- Weeks 13–15: chat, loyalty, referrals, surge, corporate
- Weeks 15–16: testing, pilot, store submissions, monitoring

## Notes
- Offline-first: queued mutations with idempotency keys; server is source of truth.
- Payments: Paystack for MoMo/Vodafone; cash confirm flow; USSD fallback.
- Mapping: Mapbox or Google; keep abstraction to swap.
- Security: rate-limit OTP, signed uploads, admin 2FA, secrets in env only.

More detailed docs will live in each package as they are built.
