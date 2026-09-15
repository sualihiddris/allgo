# Patch 15 — Tracking Location Freshness

**Date:** 2026-09-15
**Base:** `main @ fa15593e97f789970ec94ecd2785f38c0772d584`
**Branch:** `fix/tracking-location-freshness`
**Implementation:** COMPLETE
**Validation:** COMPLETE
**Committed:** NO
**Pushed:** NO
**PR created:** NO

## Problem and objective

Tracking read paths previously read `Driver.lastLocation` directly from MySQL
through `parseStoredDriverLocation()`. That parser validated coordinates but did
not enforce the existing five-minute freshness policy and bypassed the
Redis-first realtime location authority.

Patch 15 changes both tracking consumers to use the existing
`getDriverLocation()` authority. That authority rejects stale, malformed,
invalid, missing, or otherwise unusable Redis data and may still return a
valid MySQL fallback location. Tracking returns `null` only when no valid
current location is available from either Redis or the MySQL fallback.

## Architecture and design decision

The implementation reuses
[`getDriverLocation()`](../../server/src/services/dispatch.ts) rather than
creating another freshness constant, timestamp parser, or fallback path.

This preserves:

- Redis as the realtime and ephemeral location authority;
- MySQL as the durable fallback;
- the existing five-minute freshness limit;
- the existing Redis TTL and key names;
- existing Redis-read failure fallback behavior;
- existing infrastructure exception propagation.

Tracking responses explicitly map the returned location to `{ lat, lng }`.
The internal timestamp is not exposed.

No write path, Patch 14 ordering logic, schema, migration, lifecycle rule,
authorization contract, or frontend behavior was changed.

## Implementation files changed

- [`server/src/routes/tracking.ts`](../../server/src/routes/tracking.ts)
- [`server/src/services/tracking.ts`](../../server/src/services/tracking.ts)
- [`server/src/routes/tracking.test.ts`](../../server/src/routes/tracking.test.ts)
- [`server/src/services/tracking.test.ts`](../../server/src/services/tracking.test.ts)

### Report artifact

`docs/implementation-reports/patch-15-tracking-location-freshness.md`

## Before and after behavior

### REST tracking endpoint

`GET /api/v1/tracking/trip/:id` now:

- selects the assigned driver's database `id`;
- preserves existing trip existence hiding and authorization checks;
- calls `getDriverLocation(driver.id)` only after the trip is found and
  authorized;
- returns `{ lat, lng }` when a current location is available;
- returns `location: null` when no current location is available;
- does not expose the internal location timestamp;
- no longer selects or parses `Driver.lastLocation` directly.

The response shape remains unchanged.

### `startTripTracking()`

`startTripTracking()` now:

- preserves customer ownership filtering;
- preserves the existing assigned-driver requirement;
- preserves the ACCEPTED/ACTIVE lifecycle requirement;
- calls `getDriverLocation(trip.driver.id)` only after those checks pass;
- maps a returned location to `{ lat, lng }`;
- returns `currentLocation: null` when the authority returns `null`;
- no longer parses `trip.driver.lastLocation`.

Existing error messages remain unchanged.

### Dead helper removal

Repository search confirmed that `parseStoredDriverLocation()` had no remaining
consumers after the tracking read paths were updated. The helper was removed
from `server/src/services/tracking.ts`.

## Failure semantics

The tracking consumers do not catch or convert infrastructure/database
exceptions from `getDriverLocation()`. Those exceptions continue through the
existing caller error handling.

`getDriverLocation()` rejects stale, malformed, invalid, missing, or otherwise
unusable Redis data and may continue to a valid MySQL fallback. Tracking
returns `null` only when no valid current location is available from either
Redis or the MySQL fallback.

Redis GET failures continue to use the existing MySQL fallback semantics.

Genuine database or infrastructure exceptions that are not handled inside
`getDriverLocation()` continue to propagate to the tracking caller.

## Tests added or updated

### REST tracking route tests

[`server/src/routes/tracking.test.ts`](../../server/src/routes/tracking.test.ts)
now verifies:

- an assigned authorized driver can read tracking details;
- an owning customer can read tracking details;
- the route calls `getDriverLocation()` with the assigned Driver id;
- returned timestamps are not present in the response;
- a null authority result serializes as `location: null`;
- unauthorized access remains a 404;
- missing trips remain a 404;
- `getDriverLocation()` is not invoked for unauthorized or missing trips.

### Tracking service tests

[`server/src/services/tracking.test.ts`](../../server/src/services/tracking.test.ts)
now verifies:

- ownership failure remains `Trip not found`;
- unassigned trips remain `No driver assigned to trip`;
- terminal trips remain `Trip is not active`;
- `getDriverLocation()` is not called for rejected lifecycle or ownership
  cases;
- an available location is called with the assigned Driver id and mapped to
  `{ lat, lng }`;
- the internal timestamp is not exposed;
- a null authority result produces `currentLocation: null`.

Dispatch freshness and Redis/MySQL fallback behavior remains covered by the
existing dispatch location tests and was not duplicated here.

## Validation evidence

### Focused tracking tests

Command:

```text
npm --prefix server test -- tracking.test.ts services/tracking.test.ts
```

Result:

```text
Test Files  2 passed (2)
Tests       24 passed (24)
```

### Full server unit suite

Command:

```text
npm --prefix server test
```

Result:

```text
Test Files  13 passed (13)
Tests       176 passed (176)
```

### Server typecheck

Command:

```text
npm --prefix server run typecheck
```

Result: PASS.

### Server build

Command:

```text
npm --prefix server run build
```

Result: PASS.

### Diff validation

Command:

```text
git diff --check
```

Result: PASS.

### Dead-helper repository audit

Search:

```text
parseStoredDriverLocation
```

Result: no remaining repository matches.

## Scope exclusions

The following were intentionally not changed:

- frontend or UI code;
- trip lifecycle transitions;
- cancellation behavior;
- dispatch radius;
- vehicle matching;
- driver offer logic;
- authentication or authorization contracts;
- database schema;
- location write ordering;
- location write frequency;
- Redis TTL;
- Redis key names;
- retry or queue infrastructure;
- Patch 14 durable snapshot ordering.

## Known limitations

- This patch changes tracking read authority but does not change the
  underlying location write frequency.
- Tracking uses the existing server-side location timestamps and does not add
  a device-capture timestamp.
- Existing tracking consumers depend on the availability and behavior of
  `getDriverLocation()`.
- No new retry or queue system was introduced.
- No claim is made that the system is production-ready, fully secure,
  bug-free, race-free, or perfectly consistent.

## Git state at report finalization

Branch:

```text
fix/tracking-location-freshness
```

Changed implementation files:

- `server/src/routes/tracking.test.ts`
- `server/src/routes/tracking.ts`
- `server/src/services/tracking.test.ts`
- `server/src/services/tracking.ts`

Added report artifact:

- `docs/implementation-reports/patch-15-tracking-location-freshness.md`

No commit, push, pull request, merge, or branch deletion was performed.
