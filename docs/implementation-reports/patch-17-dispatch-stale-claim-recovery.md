# Patch 17 — Dispatch Stale-Claim Recovery

## Status

- Branch: `fix/dispatch-stale-claim-recovery`
- Base commit: `78b10e22e51c83ad020a4bda8ecdd553e38339a0`
- Committed: NO
- Pushed: NO
- PR created: NO

## Objective

Reduce the recovery delay when a backend process holding a dispatch claim becomes unavailable while a trip remains in `SEARCHING`.

Previously, the dispatch claim lease was fixed at five minutes.

Patch 17 replaces that fixed lease with a value derived from the configured driver-offer timeouts.

## Implementation

Modified:

- `server/src/services/socket.ts`
- `server/src/services/socket.test.ts`

The dispatch claim lease is now derived from:

`max(DAY_JOB_TIMEOUT_SECONDS, NIGHT_JOB_TIMEOUT_SECONDS) * 2 * 1000`

Current configured values:

- Daytime offer timeout: 30 seconds
- Nighttime offer timeout: 45 seconds

Therefore the current dispatch claim lease is:

`max(30, 45) * 2 * 1000 = 90,000 ms`

The lease remains private to `socket.ts`.

## Safety Properties Preserved

Patch 17 does not change:

- dispatch claim-token semantics;
- atomic Prisma claim acquisition;
- pre-offer ownership heartbeat;
- assignment fencing;
- `inFlightDispatches`;
- offer IDs;
- Redis cross-instance response relay;
- cancellation behavior;
- trip lifecycle;
- tracking;
- driver matching;
- driver-location persistence.

Stale ownership continues to use a strict:

`dispatchClaimedAt < staleBefore`

comparison.

## Tests

The socket tests verify:

- the derived lease is exactly 90,000 ms with current timeout configuration;
- the stale cutoff is deterministic;
- the stale comparison remains strict `lt`;
- a timestamp older than the cutoff is on the reclaimable side;
- a timestamp exactly at the cutoff is not stale;
- a newer timestamp is not stale;
- a live `SEARCHING` owner causes a competing dispatch to return `IN_PROGRESS`;
- no driver offer is produced when another instance retains ownership;
- claim-token fencing remains intact;
- fake timers are restored safely.

## Validation

### Focused Socket Tests

- 1 test file passed
- 36 tests passed

Result: PASS

### Full Server Test Suite

- 13 test files passed
- 179 tests passed

Result: PASS

### Workspace Typecheck

Passed for:

- `@allgo/admin`
- `@allgo/customer`
- `@allgo/driver`
- `@allgo/server`

Result: PASS

### Server Build

`tsc -p tsconfig.build.json`

Result: PASS

### Trip Lifecycle E2E

- 1 test file passed
- 5 tests passed

Covered normal trip completion, reconnect recovery, cancellation races, and ACTIVE cancellation fencing.

Result: PASS

An earlier E2E attempt failed because MySQL was unavailable at `localhost:3306`. After database availability was restored, the unchanged E2E suite passed all five tests.

### Two-Backend Redis Smoke

Result:

`PASS: ALLGO TWO-BACKEND REDIS SMOKE GREEN`

The smoke test verified:

- separate Backend A and Backend B Node processes;
- cross-instance driver offer delivery;
- cross-instance cancellation revocation;
- stale accept rejection;
- remote driver acceptance;
- cross-instance confirmation;
- authoritative MySQL assignment.

### Diff Validation

`git diff --check`

Result: PASS

## Scope

Files in Patch 17:

- `server/src/services/socket.ts`
- `server/src/services/socket.test.ts`
- `docs/implementation-reports/patch-17-dispatch-stale-claim-recovery.md`

No Prisma schema changes, migrations, dependency changes, or unrelated refactors were made.

## Limitations

Patch 17 reduces stale dispatch-owner recovery delay from five minutes to a currently derived 90-second lease.

It does not:

- detect backend failure immediately;
- guarantee automatic recovery without another dispatch attempt;
- implement distributed consensus or leader election;
- provide complete distributed fault tolerance.

Recovery still depends on lease expiry and a subsequent dispatch attempt.

## State at Report Finalization

- Committed: NO
- Pushed: NO
- PR created: NO
