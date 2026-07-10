# AllGO — Project Overview

**Trusted Rides. Reliable Delivery.**

A single reference document covering what AllGO is, how it works, how it's built, what's
done, and what's left. For the detailed product spec and history, see
[`AllGO_Master_Plan.md`](AllGO_Master_Plan.md) — this document summarizes and reflects the
actual current state of the code.

---

## 1. What AllGO is

AllGO is a **mobile-first ride-hailing and delivery platform built for towns and rural
Ghana**, on low-end Android phones and patchy networks. It connects customers to nearby
drivers for passenger rides and deliveries, with communication happening by **direct phone
call** — no in-app chat.

It was formerly named **HajjGO**; the rename to AllGO is complete in code (packages are
`@allgo/*`, the monorepo root is `allgo/`). The one intentional leftover is the local dev
MySQL database name (`hajjgo`), kept to avoid orphaning existing dev data.

**Who uses it**
- **Customers** — request a ride/delivery from the customer app.
- **Drivers** — receive and accept job offers, run trips from the driver app.
- **Admins / dispatchers** — approve drivers, verify subscriptions, create call-in trips,
  and monitor operations from the web admin panel. Two admin tiers: **branch admin**
  (scoped to one branch) and **super admin** (full cross-branch control).

---

## 2. Core flow

```
Customer requests a ride (vehicle type + optional note)
  → Backend dispatch finds the nearest matching driver (strictly sequential, nearest-first)
  → One driver is offered the job at a time (30s day / 45s night), radius expands on timeout
  → Driver accepts
  → Customer sees driver name + phone, taps CALL
  → Both parties call directly, meet, trip happens
  → Driver taps COMPLETE
  → Customer gives short feedback (rating + fare-fairness signal, admin-only visibility)
  → Fare settled directly between customer and driver — the app never touches money
```

A push notification wakes a backgrounded driver so no job offer is missed even when the
app's socket has dropped.

---

## 3. Vehicle types

Matching is **strict — never cross-matched**.

| Type | Local name | Use | Notes |
|---|---|---|---|
| `MOTO` | Motorbike | 1 passenger **or** delivery | Food / groceries / parcels / other |
| `KEKE` | Keke / Pragya | 2–3 passengers | Passenger tricycle |
| `MOTOR_KING` | Aboboya | Cargo only | Cargo tricycle, deliveries |

---

## 4. Payments — the app has ZERO involvement

There is **no fare calculation, no fare estimate, no MoMo/Paystack integration, no wallet,
no cash-confirmation step**. The trip ends, the customer asks "how much?", the driver
states a price, and the customer pays directly (cash or a direct MoMo transfer outside the
app). Any payment/fare code surfacing in the apps is a bug, not a feature.

**The one exception** is the driver subscription (below), which is a payment *to the
platform for access*, not a ride fare — and even that is handled manually, outside any
payment API.

---

## 5. Revenue model — driver subscriptions

Drivers pay a **monthly subscription** to stay active on the platform (not commission, not
a customer fee). Verification is **manual**:

1. Driver pays AllGO's business MoMo number directly (outside the app).
2. Driver submits proof of payment (transaction reference / screenshot) in the driver app.
3. An admin reviews and marks the subscription **PAID** for that period.

Enforcement is a **hard cutoff, no grace period**: an expired subscription blocks going
online. The exception — a trip already in progress is never interrupted; the cutoff applies
only after it reaches COMPLETED. Pricing per vehicle type is still **TBD** (needs market
research) and the business MoMo number is a placeholder pending launch.

---

## 6. Branches & admin roles

AllGO operates across **branches** (a branch = a town/region). Access is scoped:

- **Branch admin** — sees and manages only their own branch's drivers, trips,
  subscriptions, customers, and deliveries. Read-open where sensible, write-restricted to
  their branch. Enforced **server-side**, not just hidden in the UI.
- **Super admin** — full cross-branch visibility and control; can create/deactivate branch
  admins, reassign drivers between branches, and view a complete **audit log** of every
  admin action (who did what, when, on which record), filterable by admin.

There should be exactly **one super admin** (`+233200000000`, the seeded system account).

---

## 7. Tech stack

| Layer | Technology |
|---|---|
| Customer app | React Native + Expo (SDK 51), Expo Router |
| Driver app | React Native + Expo (SDK 51), Expo Router |
| Admin panel | React + Vite + Tailwind CSS |
| Backend | Node.js + Express + Socket.io |
| Database | **MySQL** (via XAMPP locally) — *not* Postgres; the master plan's Postgres/PostGIS note is stale |
| ORM | Prisma |
| Realtime | Socket.io (optional Redis adapter for multi-instance) |
| Cache / ephemeral state | Redis (graceful in-memory fallback for local dev) |
| Push notifications | **Expo push service** (not raw Firebase/FCM) |
| Maps / routing | Google Maps (Directions + Geocoding server-side; Maps SDK on device) |
| SMS / OTP | Arkesel |
| Error monitoring | Sentry (backend + both mobile apps) |
| Auth | JWT access/refresh rotation, phone OTP, admin TOTP 2FA |
| State (mobile) | Zustand |

**Brand color is orange `#F97316`** across all three apps (the master plan mentions a
"coral" palette that was never implemented — orange is the shipping brand).

---

## 8. Repository structure

```
allgo/
├── apps/
│   ├── customer/     # React Native + Expo — customer app
│   ├── driver/       # React Native + Expo — driver app
│   ├── admin/        # React + Vite — admin/dispatcher web panel
│   └── shared/       # mobile-shared package
├── server/           # Node + Express + Socket.io + Prisma
│   ├── prisma/       # schema.prisma + migrations (MySQL)
│   └── src/
│       ├── routes/   # auth, booking, driver, admin, feedback, tracking, maps, health
│       ├── services/ # dispatch, socket, push, sms, totp, tracking, trip, maps/, auditLog
│       ├── middleware/# auth, branchScope (branch-scoping + super-admin guards), rateLimit
│       └── config/    # env, database, redis, sentry
├── shared/           # cross-app types + constants (incl. theme — orange palette)
└── docs/             # AllGO_Master_Plan.md (source of truth) + this overview
```

npm workspaces: `apps/*`, `server`, `shared`.

**Data models** (Prisma): `User`, `RefreshToken`, `OtpCode`, `Customer`, `Driver`,
`PaymentSubmission`, `Admin`, `Branch`, `AdminActionLog`, `DataRequest`, `Trip`, `Feedback`.

---

## 9. What's built (current status)

The core ride flow (request → sequential dispatch → accept → call → complete → feedback) is
built, wired end-to-end, and exercised live across all three apps.

**Backend**
- Sequential nearest-first dispatch with day/night timeouts and expanding radius tiers.
- `tripId`-keyed pending-response registry so accept/decline survives a driver's socket
  reconnect (fixes a real race where a woken-from-push driver's accept was lost).
- Driver subscriptions: enforcement on go-online + dispatch, proof submission, admin review.
- Branches + admin roles + `AdminActionLog` audit trail; branch-scoping middleware applied
  to every admin read/write (drivers, subscriptions, customers, deliveries, stats,
  feedback, active-trips).
- Expo push notifications as a wake-up channel for backgrounded drivers.
- Google Maps proxy (`/maps/reverse-geocode`) keeping the API key server-side.
- Security: OTP rate-limiting, JWT rotation, admin TOTP 2FA, booking rate limit, data
  access/deletion request path.
- Sentry error tracking (opt-in via `SENTRY_DSN`).

**Customer app** — phone OTP auth, home/booking flow, live trip tracking with a real map,
appearance mode (light/dark/system), edit profile, feedback, Terms & Privacy with real data
access/deletion requests.

**Driver app** — auth, online/night-mode toggles, job offers, active job with in-app map +
"Open in Maps", subscription screen, push-token registration, edit profile, vehicle details.

**Admin panel** — dashboard, drivers (approve/reject + SMS + feedback tab), subscriptions,
customers, deliveries, trips, call-in booking, branches + branch-admin management, audit
log, settings (2FA). Fully modernized UI.

---

## 10. Key architectural decisions

- **Dispatch is sequential, not parallel.** One driver offered at a time, in nearest-first
  order, for driver fairness (no offers "stolen" mid-view). Trade-off: higher worst-case
  wait time on patchy networks — watch during pilot.
- **Push is Expo, not Firebase.** No Firebase project/service-account needed; Expo proxies
  to FCM/APNs. Requires an EAS project ID (configured) and a dev-client build (not Expo Go
  for custom native config).
- **Maps keys are split.** A server-only key (Directions + Geocoding) lives in
  `server/.env`; separate app-restricted keys (Android package + SHA-1, iOS bundle ID) live
  in each app's `app.json`. Never reuse the server key in a mobile bundle.
- **Branch scoping is server-enforced.** A branch admin literally cannot query or mutate
  another branch's data; the UI filter is a convenience for super admins only.
- **Dark mode** is a per-screen `createStyles(theme)` pattern driven by a Zustand theme
  store, persisted to AsyncStorage/localStorage.

---

## 11. Integrations & required keys

| Integration | Where configured | Status |
|---|---|---|
| Google Maps (server: Directions + Geocoding) | `server/.env` → `GOOGLE_MAPS_API_KEY` | ✅ set & verified |
| Google Maps (Android device) | `apps/*/app.json` → `android.config.googleMaps.apiKey` | ✅ set (needs Maps SDK for Android enabled) |
| Google Maps (iOS device) | `apps/*/app.json` → `ios.config.googleMapsApiKey` | ✅ set (needs Maps SDK for iOS enabled) |
| Sentry (backend + apps) | `server/.env` `SENTRY_DSN`; apps' `app.json` `extra.sentryDsn` | ✅ wired |
| Arkesel SMS/OTP | `server/.env` → `ARKESEL_API_KEY` | ⚠️ key rejected as invalid — needs a valid key from the Arkesel dashboard |
| EAS project IDs | `apps/*/app.json` → `extra.eas.projectId` | ✅ linked to Expo account `hajj-b` |

Secrets live in gitignored `.env` files; `.env.example` documents the shape.

---

## 12. Running locally (dev)

Requires XAMPP MySQL running on `localhost:3306` (DB name `hajjgo`).

```
# from allgo/
npm install

# backend  (http://localhost:3000)
cd server && npm run dev

# admin panel  (http://localhost:5173)
cd apps/admin && npm run dev

# customer app on web  (http://localhost:8081)
cd apps/customer && npm run web

# driver app on web  (http://localhost:8082)
cd apps/driver && npx expo start --web --port 8082
```

Each app has a **Dev Login (Skip OTP)** button. Seeded super admin: `0200000000`.
The mobile apps run on web for quick iteration, but the native map tiles and push
notifications only work in a real EAS dev-client build on a device.

---

## 13. Deployment plan (target)

- **Backend + MySQL + Redis** → Railway.
- **Admin panel** → Vercel (static build, pointed at the Railway backend).
- **Mobile apps** → EAS Build → Google Play + Apple App Store.
- **Driver documents** → Cloudinary (not yet integrated).
- Ghana latency: Railway is US/EU; measure round-trip latency before wide rollout.

Sequence: finish dev → deploy to staging → pilot with 3–5 real drivers against staging →
promote to production → build & submit mobile apps → public launch.

---

## 14. Known gaps / remaining work

- **Arkesel SMS key** — current key is invalid; OTP falls back to console-log dev mode until
  a valid key is added.
- **Subscription pricing** per vehicle type and the **business MoMo number** — TBD, business
  decisions.
- **iOS build** — only Android dev-client builds have been run; iOS needs an Apple Developer
  account for provisioning.
- **App icon / splash** — still using Expo defaults; needs the real AllGO logo.
- **Cloudinary** driver-document storage — not integrated yet.
- **Deployment** — everything is local; Railway/Vercel deploy is not done.
- **Pilot test (real drivers, real devices, poor-network scenarios)** — not started.
- **Remaining mobile screen polish** — home screens are modernized; booking-confirm,
  active-trip, active-job, rides, and profile screens can get the same pass.
- **Driver contract** — to be drafted (legal).

---

*Source of truth for the full product spec: [`AllGO_Master_Plan.md`](AllGO_Master_Plan.md).
This overview reflects the actual state of the code as of the latest commit.*
