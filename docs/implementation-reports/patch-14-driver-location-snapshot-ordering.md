# Patch 14 — Driver Location Snapshot Ordering

**Date:** 2026-09-15
**Branch:** `fix/driver-location-snapshot-ordering`
**Implementation:** COMPLETE
**Validation:** COMPLETE
**Committed:** NO
**Pushed:** NO
**PR created:** NO

## Objective

Prevent an older `Driver.lastLocation` snapshot from overwriting a newer
durable snapshot when concurrent MySQL writes complete out of order.

## Architecture preserved

The implementation preserves the existing Patch 13 contract:

- Redis remains authoritative for realtime and ephemeral driver location.
- MySQL `Driver.lastLocation` remains durable fallback persistence.
- Redis SET failure rejects `updateDriverLocation()`.
- Redis SET success followed by MySQL persistence failure remains non-fatal in
  the realtime path.
- Redis TTL remains 300 seconds.
- Dispatch freshness remains five minutes.
- Existing location readers and payload compatibility remain unchanged.

## Implementation details

### 1. Dedicated ordering column

Added the following field to the Prisma `Driver` model:

```prisma
lastLocationAt DateTime? @db.DateTime(3)
```

`Driver.updatedAt` was intentionally not used because it changes for unrelated
driver updates and does not represent the timestamp of a location sample.

### 2. Focused migration

Added one migration:

`server/prisma/migrations/20260915091000_add_driver_location_timestamp/migration.sql`

Exact SQL:

```sql
ALTER TABLE `drivers`
  ADD COLUMN `lastLocationAt` DATETIME(3) NULL;
```

The migration:

- adds only `lastLocationAt`;
- does not alter `lastLocation`;
- does not backfill historical JSON timestamps;
- leaves existing rows with `lastLocationAt = NULL`.

### 3. Shared durable snapshot helper

Added:

[`server/src/services/driverLocation.ts`](../../server/src/services/driverLocation.ts)

The helper accepts:

- `driverId`;
- latitude;
- longitude;
- sample timestamp.

It serializes the existing JSON/String payload and performs exactly one
conditional `prisma.driver.updateMany()`:

```ts
where: {
  id: driverId,
  OR: [
    { lastLocationAt: null },
    { lastLocationAt: { lt: sampleTimestamp } },
  ],
},
data: {
  lastLocation: serializedLocation,
  lastLocationAt: sampleTimestamp,
}
```

Return semantics:

- `{ persisted: true }` means the snapshot was accepted.
- `{ persisted: false }` means the timestamp was stale or equal and the
  snapshot was ignored.
- Prisma/database exceptions propagate to the caller.

The database conditional update is the ordering authority. No read-compare-
update sequence, mutex, Redis lock, row lock, queue, or application-side CAS
was introduced.

### 4. `updateDriverLocation()` changes

Updated:

[`server/src/services/dispatch.ts`](../../server/src/services/dispatch.ts)

The function now:

1. Validates coordinates.
2. Captures one logical timestamp.
3. Writes Redis with that timestamp first.
4. Calls the shared durable snapshot helper only after Redis succeeds.
5. Uses the same logical timestamp for:
   - Redis payload timestamp;
   - MySQL `lastLocationAt`;
   - embedded MySQL JSON timestamp.
6. Resolves normally for accepted, stale, or equal durable snapshots.
7. Logs and suppresses genuine MySQL exceptions after Redis succeeds.
8. Does not attempt MySQL persistence after Redis SET failure.
9. Never rolls Redis back after a MySQL failure.

### 5. Tracking route changes

Updated:

[`server/src/routes/tracking.ts`](../../server/src/routes/tracking.ts)

Removed the direct unconditional `prisma.driver.update()` of
`lastLocation`.

The route now:

- captures a server-side sample timestamp immediately after location
  validation;
- uses the shared durable snapshot helper;
- does not write Redis;
- treats stale/equal snapshots as successful secondary effects;
- preserves genuine database failure behavior by allowing helper exceptions to
  reach the existing route error handler.

## Implementation files changed

- [`server/prisma/schema.prisma`](../../server/prisma/schema.prisma)
- [`server/prisma/migrations/20260915091000_add_driver_location_timestamp/migration.sql`](../../server/prisma/migrations/20260915091000_add_driver_location_timestamp/migration.sql)
- [`server/src/services/driverLocation.ts`](../../server/src/services/driverLocation.ts)
- [`server/src/services/dispatch.ts`](../../server/src/services/dispatch.ts)
- [`server/src/routes/tracking.ts`](../../server/src/routes/tracking.ts)
- [`server/src/services/driverLocation.test.ts`](../../server/src/services/driverLocation.test.ts)
- [`server/src/services/dispatch.location.test.ts`](../../server/src/services/dispatch.location.test.ts)
- [`server/src/routes/tracking.test.ts`](../../server/src/routes/tracking.test.ts)

### Report artifact

`docs/implementation-reports/patch-14-driver-location-snapshot-ordering.md`

## Tests added or updated

### Shared helper tests

[`server/src/services/driverLocation.test.ts`](../../server/src/services/driverLocation.test.ts)

Coverage includes:

- first snapshot accepted when `lastLocationAt` is null;
- newer snapshot accepted;
- older snapshot ignored;
- equal timestamp ignored;
- null-or-less-than timestamp predicate;
- `lastLocation` and `lastLocationAt` written together;
- genuine Prisma exception propagation.

### Dispatch location tests

[`server/src/services/dispatch.location.test.ts`](../../server/src/services/dispatch.location.test.ts)

Coverage includes:

- Redis persistence occurs before durable persistence;
- Redis failure prevents durable persistence;
- accepted durable write resolves;
- stale/equal durable write resolves;
- genuine durable database failure resolves and logs;
- Redis and durable persistence use the same logical timestamp;
- existing coordinate validation and fallback tests remain covered.

### Tracking route tests

[`server/src/routes/tracking.test.ts`](../../server/src/routes/tracking.test.ts)

Coverage includes:

- stale durable location does not fail the status transition;
- the shared helper is used;
- the old direct location update path is no longer used;
- genuine durable persistence failure retains the existing route failure
  behavior.

## Validation results

### Prisma client generation

Command:

```text
npm --prefix server run db:generate
```

Result: PASS. Prisma Client regenerated successfully with `lastLocationAt`.

### Patch 14 migration validation

The migration was tested against the isolated MySQL database `allgo_e2e`.

Migration:

```text
20260915091000_add_driver_location_timestamp
```

Exact migration SQL:

```sql
ALTER TABLE `drivers`
  ADD COLUMN `lastLocationAt` DATETIME(3) NULL;
```

`prisma migrate deploy`: PASS

`prisma migrate status`: PASS

The isolated database reported:

```text
Database schema is up to date.
```

The migration was applied only to the isolated `allgo_e2e` database for
validation. This task did not apply it to ordinary development or production
databases.

### Exact requested focused tests

Command:

```text
npm --prefix server test -- dispatch.location.test.ts tracking.test.ts
```

Result:

```text
Test Files  3 passed (3)
Tests       45 passed (45)
```

### Shared helper tests

Command:

```text
npm --prefix server test -- driverLocation.test.ts
```

Result:

```text
Test Files  1 passed (1)
Tests       5 passed (5)
```

Combined focused validation produced 50 passing tests.

### Full server unit suite

Result:

```text
Test Files  13 passed (13)
Tests       175 passed (175)
```

### Lifecycle E2E suite

Result:

```text
Test Files  1 passed (1)
Tests       5 passed (5)
```

### Server typecheck

Result: PASS.

### Server build

Result: PASS.

### Workspace typecheck

Result: PASS for the admin, customer, driver, and server workspaces.

### Two-backend Redis/Memurai/MySQL smoke

Result: PASS.

The smoke proved:

- Backend A and Backend B were separate Node processes.
- The customer connected only to Backend A.
- The driver connected only to Backend B.
- The driver offer crossed the Socket.IO Redis adapter.
- The driver response reached the dispatch owner across Redis.
- Driver confirmation crossed back to Backend B.
- Authoritative assignment persisted in MySQL.

### Real MySQL snapshot-ordering proof

Result: PASS.

A temporary `Driver`/`User` fixture was created in `allgo_e2e` and removed
afterward.

Test timestamps:

```text
T1 = 2026-09-15T09:30:00.100Z
T2 = 2026-09-15T09:30:00.200Z
```

Execution:

- persisted T2 first;
- attempted older T1 second;
- attempted an equal-T2 timestamp with different coordinates.

Observed:

- T2 returned `persisted: true`;
- stale T1 returned `persisted: false`;
- equal T2 returned `persisted: false`;
- final `Driver.lastLocationAt` remained T2;
- final `Driver.lastLocation` remained the T2 coordinates and timestamp;
- the temporary `Driver`/`User` fixture was deleted.

This is a real-MySQL monotonic stale/equal-write proof against the atomic
conditional update. It is not a high-load concurrent stress test.

No permanent automated database concurrency test was added in this patch. The
live proof confirms the real MySQL/Prisma behavior, while the single
conditional `UPDATE` supplies the atomic ordering boundary.

### Diff validation

Command:

```text
git diff --check
```

Result: passed with no whitespace errors.

## Unresolved limitations

- Existing rows outside the validated E2E database may initially have
  `lastLocationAt = NULL` after the migration.
- Historical JSON timestamps were not backfilled or normalized.
- The tracking route uses server receipt time rather than device capture time
  because the API does not provide a client sample timestamp.
- Future `lastLocation` writers must use the shared helper to remain protected
  by the ordering guard.
- Tracking read freshness remains outside Patch 14.
- No retry or queue system was added.

## Scope exclusions

The following were intentionally not changed:

- Redis TTL;
- Redis key names;
- dispatch radius;
- vehicle matching;
- offer sequencing;
- trip lifecycle rules;
- authorization;
- tracking read freshness;
- frontend code or UI;
- payment behavior;
- retry or queue infrastructure;
- `Driver.lastLocation` serialized payload format.
