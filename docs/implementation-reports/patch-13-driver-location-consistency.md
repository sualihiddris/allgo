# Patch 13 — Driver Location Redis/MySQL Consistency

## 1. Objective

Patch 13 aligns driver-location persistence with the existing architecture:
Redis remains the authoritative realtime and ephemeral location source, while
MySQL stores a durable `Driver.lastLocation` snapshot and supplies fallback
data when Redis is unavailable or unusable.

The implementation preserves coordinate validation, Redis freshness limits,
dispatch behavior, and the existing storage interfaces. It also ensures that
successful Redis publication is not hidden from realtime callers merely
because durable MySQL snapshot persistence failed.

## 2. Original Problem

`updateDriverLocation()` wrote Redis first and then awaited the Prisma update.
When Prisma failed, the function rejected even though Redis already contained
the fresh usable location. The socket layer consequently treated the update as
failed and could suppress realtime broadcasts.

`getDriverLocation()` returned immediately after reading a Redis key. A
malformed JSON value, invalid coordinates, or stale timestamp therefore
returned `null` without trying the existing MySQL fallback. A Redis GET
failure also escaped before the fallback path.

## 3. Architecture Decision

The patch keeps Redis-first publication and does not introduce retries,
queues, compensation, or another consistency subsystem.

The selected behavior is:

1. Validate the coordinates.
2. Publish the realtime location to Redis with its five-minute TTL.
3. Attempt durable MySQL snapshot persistence.
4. Treat Redis failure as a failed realtime update.
5. Treat MySQL snapshot failure as a logged, non-fatal durability issue.
6. Use MySQL as a fallback when Redis is absent, malformed, invalid, stale, or
   unreadable.

This is intentionally an availability-oriented boundary for realtime
location, not a claim of perfect cross-store consistency.

## 4. Authority Model

Redis is authoritative for current realtime and ephemeral driver location.
Its location key is the source used for current dispatch reads when the value
is valid and fresh.

MySQL `Driver.lastLocation` is durable last-known-location persistence and a
fallback source. It is not allowed to override a valid fresh Redis location.
When Redis cannot provide a usable location, the MySQL value is still accepted
only after the same coordinate and freshness normalization.

## 5. updateDriverLocation Before

Before Patch 13, invalid coordinates were rejected before persistence, then
`redis.setex()` wrote a numeric `Date.now()` timestamp. The Prisma update was
awaited afterward and stored a separately generated ISO timestamp.

If Redis failed, Prisma was not reached because the Redis promise rejected.
However, if Redis succeeded and Prisma failed, the function rejected despite
the realtime write already succeeding. There was no rollback of Redis, but the
caller could not distinguish this from a failed location publication.

## 6. updateDriverLocation After

`updateDriverLocation()` now:

- rejects invalid latitude or longitude before touching either store;
- generates one logical timestamp;
- performs Redis `SETEX` first with the unchanged 300-second TTL;
- propagates a Redis SET failure and does not call Prisma;
- attempts `Driver.lastLocation` persistence only after Redis succeeds;
- logs a MySQL persistence failure and resolves normally;
- leaves the successful Redis value intact when MySQL persistence fails.

The same logical timestamp is represented numerically in Redis and as an ISO
timestamp in MySQL. The timestamp format differs by store, but both
representations refer to the same update instant.

## 7. getDriverLocation Before

Before Patch 13, a Redis key caused the function to parse and normalize only
that value. A malformed payload logged a warning and returned `null`; a
payload with invalid coordinates or an expired logical timestamp also returned
`null`. None of those cases attempted MySQL.

If `redis.get()` itself rejected, the error escaped before the fallback query.
Only a missing Redis key reached the MySQL lookup.

## 8. getDriverLocation After

`getDriverLocation()` now follows this order:

- A valid fresh Redis location is normalized and returned immediately.
- A missing Redis key falls through to MySQL.
- Malformed Redis JSON logs a warning and falls through to MySQL.
- Invalid or out-of-range Redis coordinates fall through to MySQL.
- A stale Redis timestamp falls through to MySQL.
- A Redis GET rejection logs the driver id and Redis error, then falls through
  to MySQL without rethrowing.
- MySQL fallback data is parsed and passed through the existing normalization,
  coordinate validation, and five-minute freshness check.
- Invalid or stale MySQL fallback data returns `null`.

This patch does not delete or rewrite malformed, invalid, or stale Redis keys.

## 9. Failure Semantics

Redis write failure remains authoritative for the update operation: the
function rejects and Prisma is not called.

Redis write success followed by MySQL persistence failure is non-fatal for
realtime publication. The failure is logged, Redis is not deleted or rolled
back, and the update resolves normally.

Redis read failure is also non-fatal for location lookup. The failure is
logged and the MySQL fallback is attempted. If MySQL has no sufficiently fresh
valid snapshot, lookup returns `null`.

No retries, background queues, or silent conversion of Redis write failures
were added.

## 10. Redis Freshness Rules

The Redis location TTL remains **300 seconds**. The logical maximum accepted
location age remains **5 minutes** (`5 * 60 * 1000` milliseconds).

The TTL controls Redis key expiry, while normalization independently checks
the logical timestamp. A value that is present but stale is rejected as a
current location and causes fallback to MySQL.

## 11. Dispatch Impact

No dispatch radius, vehicle matching, offer sequencing, or assignment logic
was changed. Dispatch continues to use `getDriverLocation()`, so it can now
use a sufficiently fresh durable MySQL snapshot when Redis data is missing,
malformed, invalid, stale, or temporarily unreadable.

Successful Redis location updates now resolve even when MySQL snapshot
persistence fails, allowing the existing socket layer to continue its
realtime broadcast path. Redis write failures still prevent the update from
being treated as successful.

## 12. Files Changed

Before report creation, the Patch 13 code and test changes were limited to:

- `server/src/services/dispatch.ts`
  - Updated Redis-first location writes, shared timestamp generation,
    non-fatal MySQL persistence handling, and Redis-read fallback behavior.
- `server/src/services/dispatch.location.test.ts`
  - Added and updated focused coverage for write failures, persistence
    failures, timestamp correspondence, invalid Redis fallback, stale Redis
    fallback, malformed Redis fallback, Redis read failures, and stale
    MySQL fallback.

This report is the requested documentation artifact and does not represent a
production-code or test change.

## 13. Test Coverage Added

The focused location suite contains 20 tests and covers:

- valid location persistence to Redis and MySQL;
- shared logical timestamp representation;
- Redis SET failure rejecting the update;
- Prisma not being called after Redis SET failure;
- Redis success with MySQL persistence failure resolving successfully;
- persistence failure logging and absence of Redis rollback/delete;
- invalid coordinate rejection before either store;
- geographic boundary coordinates;
- invalid Redis coordinates falling back to valid MySQL;
- malformed Redis JSON falling back to valid MySQL;
- stale Redis data falling back to valid MySQL;
- valid fresh Redis data returning immediately without MySQL;
- Redis GET failure falling back to valid MySQL;
- Redis GET failure with no MySQL location returning `null`;
- Redis GET failure logging the driver id and error;
- invalid MySQL fallback returning `null`;
- stale MySQL fallback returning `null`.

The existing validation coverage was preserved, including invalid coordinate
inputs and the five-minute normalization rule.

## 14. Validation Results

The recorded Patch 13 validation results are:

- Focused location tests: **20/20 PASS**
- Full server unit suite: **12 files, 166 tests PASS**
- Lifecycle E2E: **1 file, 5 tests PASS**
- Server typecheck: **PASS**
- Server build: **PASS**
- Workspace typecheck: **PASS**
- Real two-backend Redis/Memurai/MySQL smoke: **PASS**
- `git diff --check`: **PASS**

The focused commands run for this Patch 13 implementation were:

```text
npm --prefix server run typecheck
npm --prefix server test -- dispatch.location.test.ts
git diff --check
```

## 15. Behavior Before vs After

| Scenario | Before Patch 13 | After Patch 13 |
|---|---|---|
| Invalid update coordinates | Rejected before persistence | Still rejected before either store |
| Redis SET failure | Rejected; Prisma was not reached | Rejected; Prisma is not called |
| Redis success, MySQL failure | Rejected despite usable Redis data | Logs failure and resolves; Redis remains |
| Update timestamps | Redis and MySQL generated separate timestamps | One logical timestamp, numeric in Redis and ISO in MySQL |
| Fresh Redis read | Returned from Redis | Still returns immediately; MySQL is not queried |
| Missing Redis key | Fell back to MySQL | Still falls back to MySQL |
| Malformed Redis value | Returned `null` | Falls back to MySQL |
| Invalid Redis coordinates | Returned `null` | Falls back to MySQL |
| Stale Redis value | Returned `null` | Falls back to MySQL |
| Redis GET failure | Threw before fallback | Logs and falls back to MySQL |
| Invalid/stale MySQL fallback | Returned `null` after normalization | Still returns `null` |

## 16. Scope Exclusions

The following were intentionally not changed:

- Prisma schema.
- Database migrations.
- Dependencies.
- Frontend code.
- Redis TTL, which remains 300 seconds.
- Dispatch radius behavior.
- `socket.ts`.
- `tracking.ts`.
- Retry or queue infrastructure.
- Redis key repair, deletion, or rewriting.

No unrelated refactor was performed.

## 17. Remaining Risks

- Concurrent GPS writes may still persist to MySQL out of order. Redis remains
  the realtime authority, but durable snapshots do not gain ordering
  guarantees from this patch.
- `tracking.ts` has a separate direct MySQL `lastLocation` write path that was
  not changed.
- No retry or queue was added for failed MySQL snapshot persistence, so a
  persistence failure can leave MySQL older than Redis.
- A Redis write outage still intentionally prevents realtime location
  publication; it is not weakened into best-effort behavior.
- A Redis read outage falls back only to a sufficiently fresh valid MySQL
  snapshot. If that snapshot is absent, invalid, or stale, lookup returns
  `null`.

This report does not claim the implementation is production ready, fully
secure, bug free, race free, or perfectly consistent.

## 18. Final Implementation Status

Implementation: COMPLETE

Focused location tests: 20/20 PASS

Full server unit suite: 12 files, 166 tests PASS

Lifecycle E2E: 1 file, 5 tests PASS

Server typecheck: PASS

Server build: PASS

Workspace typecheck: PASS

Real two-backend Redis/Memurai/MySQL smoke: PASS

git diff --check: PASS

Pre-commit validation snapshot:
Committed: NO
Pushed: NO
PR created: NO
