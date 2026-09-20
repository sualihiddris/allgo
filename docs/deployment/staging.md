# AllGo Staging Deployment

## Target

- Backend API + MySQL + Redis: Railway
- Admin web application: Vercel
- Real-device mobile pilot: after infrastructure smoke validation

The staging backend runs with `NODE_ENV=production` so production Redis and CORS requirements are exercised before the pilot.

## Railway

Railway infrastructure is defined in `.railway/railway.ts` and applied with the Railway CLI.

The Railway IaC definition provisions MySQL, Redis, and the AllGo API. The API generates Prisma, builds `@allgo/server`, runs `prisma migrate deploy`, starts the compiled server, and health-checks `/api/v1/health`.

Create an empty Railway staging project and environment, then use `railway config plan` and `railway config apply` from the repository root. The IaC definition provisions MySQL, Redis, and the AllGo API. MySQL and Redis remain internal to the Railway project.

The IaC definition sets `NODE_ENV=production` and wires these service variables automatically:

- `DATABASE_URL` from the Railway MySQL resource
- `REDIS_URL` from the Railway Redis resource

Before applying the IaC definition, create these Railway shared variables in the staging environment:

- `JWT_SECRET`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_TOTP_SECRET`
- `CORS_ORIGINS`

Do not commit real secrets.

Before the Vercel staging URL exists, a temporary value such as `https://bootstrap.invalid` may be used for `CORS_ORIGINS` only to let the first Railway deployment boot.

## Vercel

Vercel uses `vercel.json` from the repository root.

The admin build uses `@allgo/admin`, publishes `apps/admin/dist`, and rewrites browser routes to `index.html` for React Router.

Set:

`VITE_API_BASE_URL=https://<railway-api-domain>/api/v1`

The `/api/v1` suffix is required because the admin appends paths such as `/auth/...` and `/admin/...`.

The admin does not currently use Socket.IO, so `VITE_SOCKET_URL` is not required.

After Vercel provides the stable staging URL, set Railway `CORS_ORIGINS` to that exact origin and redeploy the API.

## Staging smoke test

Set `STAGING_BACKEND_URL` and `STAGING_ADMIN_URL`, then run:

`npm run smoke:staging`

The smoke test verifies:

- backend health returns HTTP 200
- MySQL reports healthy
- Redis reports healthy
- HTTP CORS allows the Vercel staging origin
- `/login` works as a direct SPA route
- Socket.IO / Engine.IO accepts the configured Origin

Expected final result:

`PASS: ALLGO STAGING SMOKE GREEN`

## Pilot gate

A green infrastructure smoke is not a public-launch signal.

The next gate is a controlled real-device pilot covering OTP delivery, booking, driver acceptance, reconnects, location updates, trip completion, cancellation, weak networks, and call-in operations.
