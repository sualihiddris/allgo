# Patch 16 — Driver Location Future-Timestamp Guard

**Date:** 2026-09-15
**Branch:** `fix/driver-location-future-timestamp-guard`
**Base:** `main @ da26cdeb1747164006cac7ba7ee51c4c301f9240`
**Implementation:** COMPLETE
**Validation:** COMPLETE
**Committed:** NO
**Pushed:** NO
**PR created:** NO

## Objective

Prevent structurally valid driver locations with unreasonably future-dated
timestamps from being treated as fresh.

Previously, `normalizeDriverLocation()` rejected locations older than the
existing five-minute maximum age, but did not reject timestamps sufficiently
ahead of the current server time. Since `Date.now() - futureTimestamp` is
negative, an excessively future-dated value could pass the stale check.

## Implementation

Added the private constant in
[`server/src/services/dispatch.ts`](../../server/src/services/dispatch.ts):

```ts
const DRIVER_LOCATION_MAX_FUTURE_SKEW_MS = 30 * 1000;
```

`normalizeDriverLocation()` now:

1. Preserves existing coordinate validation.
2. Preserves existing timestamp parsing.
3. Captures `Date.now()` once for the freshness decision.
4. Rejects locations older than five minutes.
5. Rejects locations more than 30 seconds ahead of server time.
6. Accepts timestamps exactly 30 seconds ahead.

The existing Redis-first and MySQL-fallback behavior remains unchanged.

## Read behavior

### Excessively future Redis value

An otherwise structurally valid Redis location more than 30 seconds ahead is
treated as unusable. `getDriverLocation()` continues to the existing MySQL
fallback. A valid fresh MySQL fallback may be returned.

### Excessively future MySQL fallback

If Redis has no usable location and the MySQL fallback timestamp is more than
30 seconds ahead, the MySQL value is rejected and `getDriverLocation()` returns
`null`.

No exception is thrown solely because a location timestamp is future-dated.

### Exact boundary

A Redis timestamp exactly 30 seconds ahead of server time is accepted and
returned immediately. MySQL is not queried in that case.

## Exact files modified

- [`server/src/services/dispatch.ts`](../../server/src/services/dispatch.ts)
- [`server/src/services/dispatch.location.test.ts`](../../server/src/services/dispatch.location.test.ts)

No other implementation, schema, migration, application, or test files were
modified.

## Tests added

Updated
[`server/src/services/dispatch.location.test.ts`](../../server/src/services/dispatch.location.test.ts)
with deterministic fake-time tests for:

- future Redis timestamp (`now + 30,001 ms`) falling back to valid MySQL;
- future MySQL timestamp (`now + 30,001 ms`) being rejected;
- exact future-skew boundary (`now + 30,000 ms`) being accepted from Redis;
- ensuring MySQL is queried for the rejected future Redis case;
- ensuring MySQL is not queried for the accepted boundary case.

Fake timers are restored with `vi.useRealTimers()` in `finally` blocks so the
tests do not leak time state into other tests.

Existing stale, malformed, invalid-coordinate, Redis-failure, and valid
location tests were retained.

## Validation

### Focused location tests

Command:

```text
npm --prefix server test -- src/services/dispatch.location.test.ts
```

Result:

```text
Test Files  1 passed (1)
Tests       25 passed (25)
```

### Server typecheck

Command:

```text
npm --prefix server run typecheck
```

Result: PASS.

### Full server unit suite

Command:

```text
npm --prefix server test
```

Result:

```text
Test Files  13 passed (13)
Tests       179 passed (179)
```

### Server build

Command:

```text
npm --prefix server run build
```

Result: PASS.

### Workspace typecheck

Command:

```text
npm run typecheck
```

Result: PASS for admin, customer, driver, and server workspaces.

### Lifecycle E2E

Command:

```text
npm --prefix server run test:e2e -- trip-lifecycle.e2e.test.ts
```

Result:

```text
Test Files  1 passed (1)
Tests       5 passed (5)
```

The lifecycle E2E covered:

- create, dispatch, accept, start, and complete;
- driver disconnect/reconnect recovery;
- customer cancellation beating a stale driver accept;
- accepted-trip cancellation cleanup and stale STARTED fencing;
- rejection of customer cancellation after the trip became ACTIVE.

### Two-backend Redis/Memurai smoke

Command:

```text
node server/scripts/two-backend-redis-smoke.cjs
```

Result: PASS.

The smoke confirmed:

- Backend A and Backend B ran as separate Node processes;
- the customer connected only to Backend A;
- the driver connected only to Backend B;
- the offer crossed the Socket.IO Redis adapter;
- cancellation revoked an outstanding cross-instance offer;
- stale acceptance after cancellation was rejected;
- a later remote driver acceptance reached the dispatch owner;
- authoritative assignment persisted in MySQL.

### Diff validation

Command:

```text
git diff --check
```

Result: PASS.

## Preserved behavior and scope exclusions

The following were intentionally not changed:

- Redis TTL;
- Redis key names;
- Redis payload shape;
- five-minute maximum location age;
- `updateDriverLocation()`;
- durable snapshot helpers;
- `Driver.lastLocationAt`;
- Prisma schema;
- migrations;
- Redis-first write ordering;
- Redis failure semantics;
- MySQL persistence failure semantics;
- dispatch search behavior;
- driver matching;
- trip lifecycle;
- cancellation;
- tracking authorization;
- Socket.IO events;
- mobile, admin, customer, and driver applications;
- logging unrelated to this guard;
- durable heartbeat throttling.

## Limitations

- This patch validates the future-skew boundary through deterministic unit
  tests; it does not add a live database or high-load test.
- The 30-second allowance is based on server receipt/read time and does not
  correct clock synchronization between devices and the server.
- No claim is made that the system is production-ready, fully secure,
  bug-free, race-free, or perfectly consistent.

## Git state at report finalization

Branch:

```text
fix/driver-location-future-timestamp-guard
```

Implementation changes:

- `server/src/services/dispatch.ts`
- `server/src/services/dispatch.location.test.ts`

Report artifact:

- `docs/implementation-reports/patch-16-driver-location-future-timestamp-guard.md`

No commit, push, merge, pull request, or branch operation was performed.
