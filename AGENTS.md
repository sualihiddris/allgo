# AllGo Engineering Guide

This file gives coding agents the operational rules for working in the AllGo repository.

## Product

AllGo is a Ghana mobility and delivery platform for smaller cities, towns, and underserved communities.

Current pilot focus: Dambai, Oti Region.

Core pilot capabilities:

- customer ride booking
- MOTO, KEKE / Pragya, and MOTOR_KING / Aboboya
- delivery requests
- nearby-driver dispatch
- driver trip execution
- assisted call-in booking
- admin/operator supervision

Pilot principle:

> Build less, observe more, fix what reality proves matters, then expand.

Do not add speculative product scope while fixing a reproduced defect.

## Repository

AllGo is an npm workspace monorepo.

- `apps/customer` - Expo / React Native customer app
- `apps/driver` - Expo / React Native driver app
- `apps/admin` - React / Vite admin dashboard
- `server` - Node / Express / TypeScript API and Socket.IO services
- `shared` - shared types, constants, and utilities
- `docs` - project documentation
- `scripts` - project utilities

Backend technologies include Node.js, Express, TypeScript, Prisma, MySQL, Socket.IO, and Redis where required.

Frontend technologies include Expo, React Native, React, Vite, Tailwind CSS, and Zustand.

## Engineering Priorities

Prioritize:

1. correctness
2. truthful operational state
3. recovery from network or process interruption
4. lifecycle and data consistency
5. low-bandwidth resilience
6. low-end Android usability
7. visual polish

Customer, Driver, and Admin pilot UI is frozen.

Do not make general UI-cleanup changes. UI changes now require a reproduced defect or clearly documented operational need.

## Current Reliability Priorities

1. Customer network and backend-outage recovery
2. Driver network and Socket.IO recovery
3. Dispatch decline, timeout, and no-driver paths
4. Driver-offline-during-dispatch behavior
5. Cancellation races and lifecycle boundaries
6. Refresh/restart recovery during active trips
7. Pilot observability for dispatch and lifecycle debugging

## Known Reproduced Findings

### Customer place search

Customer location search can display `No places found` when the autocomplete request actually failed because the backend was unavailable.

A successful empty result and an unavailable search service must be represented as different states.

Fix this without redesigning the location-search screen.

### Driver online truthfulness

The Driver application can continue displaying `ONLINE` and `Waiting for a ride request` when backend or Socket.IO connectivity is unavailable.

Treat online intent and confirmed ability to receive jobs as different concepts.

Before changing this behavior, trace:

- driver online state
- Socket.IO connection lifecycle
- location heartbeat and presence
- reconnection
- server dispatch eligibility

Do not invent a new connection model without understanding the existing one.

## Lifecycle Invariants

Driver lifecycle:

`ACCEPTED -> ACTIVE -> COMPLETED`

Do not introduce an `ARRIVED` action unless product requirements explicitly change.

Call-in dispatch state is separate from trip lifecycle.

Dispatch outcomes include:

- `SEARCHING`
- `NO_DRIVER_FOUND`
- `FAILED`

Trip terminal states include:

- `COMPLETED`
- `CANCELLED`

Preserve that distinction.

## Evidence-First Bug Fixing

For bug work:

1. reproduce or establish the defect
2. trace the relevant code path
3. identify the failure mechanism
4. make the smallest correct patch
5. add regression coverage when practical
6. validate the affected scope
7. inspect the final diff

Do not patch hypothetical problems merely because code looks imperfect.

Do not expand scope unless required for correctness.

## Git Workflow

Never implement normal work directly on `main`.

Start from a clean, up-to-date `main`.

Use focused branches such as:

- `fix/`
- `feat/`
- `chore/`
- `docs/`
- `test/`

Avoid mixing unrelated fixes.

Before committing:

```bash
git diff --check
git status
git diff
```

Commit only intended files.

Do not push, open pull requests, merge, delete branches, force-push, or modify remote history unless the user explicitly authorizes it.

## Validation

Run validation appropriate to the changed scope.

### Server

```bash
npm run typecheck --workspace=@allgo/server
npm test --workspace=@allgo/server
npm run build --workspace=@allgo/server
```

When relevant:

```bash
npm run test:e2e --workspace=@allgo/server
```

### Customer

```bash
npm run typecheck --workspace=@allgo/customer
npm test --workspace=@allgo/customer
```

### Driver

```bash
npm run typecheck --workspace=@allgo/driver
```

The Driver workspace currently has no real automated test suite. Do not claim Driver tests passed when its test script is only a placeholder.

### Admin

```bash
npm run typecheck --workspace=@allgo/admin
npm run build --workspace=@allgo/admin
```

The Admin workspace currently has no real automated test suite. Do not claim Admin tests passed when its test script is only a placeholder.

Always run:

```bash
git diff --check
```

For persistence, dispatch, concurrency, lifecycle, Redis, or recovery changes, run relevant integration or E2E tests in addition to unit tests.

## Testing Doctrine

Every reproduced bug should receive regression coverage when practical.

Test failure paths, not only happy paths.

Important pilot cases include:

- backend unavailable
- network interruption
- Socket.IO disconnect and reconnect
- refresh during SEARCHING
- refresh during ACCEPTED
- refresh during ACTIVE
- driver decline
- offer timeout
- no available drivers
- driver becoming unavailable during dispatch
- cancellation racing another lifecycle action

Do not weaken assertions merely to make CI pass.

## Security and Data Safety

Never expose or commit:

- API keys
- access or refresh tokens
- OTPs
- Firebase private keys
- production credentials
- customer private data
- secrets from environment files

Use `.env.example` as the environment-variable reference.

Do not weaken authentication, authorization, branch scoping, validation, or rate limiting for convenience.

Do not mutate production data or run destructive database or schema commands without explicit approval.

For Prisma changes, inspect migrations and persistence impact before applying them.

Avoid real SMS, push, payment, or mapping charges during ordinary automated tests.

## Pilot Boundaries

AllGo is not trying to become a feature-complete Uber clone.

The pilot must prove that a customer in an underserved town can request a ride or delivery, a suitable nearby driver can receive and complete it, and an operator can supervise and recover from problems.

Call-in booking is a core product capability.

## Review Standard

Before presenting work as complete, report:

- root cause
- files changed
- behavior changed
- tests executed
- builds and typechecks executed
- runtime verification performed
- remaining known limitations

Separate verified facts from assumptions.

If a validation step was not run, state that plainly.

Prefer a small patch with strong evidence over a broad patch with optimistic comments.
