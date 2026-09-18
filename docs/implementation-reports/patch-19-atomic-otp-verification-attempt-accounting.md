# Patch 19 - Atomic OTP Verification Attempt Accounting

## Problem

`verifyOtp()` previously handled wrong OTP attempts using a non-atomic flow:

```text
read attempts
-> compute attempts + 1
-> write absolute value
```

Concurrent wrong attempts could read the same attempt count and overwrite one
another, undercounting guesses.

The terminal invalidation path also used `prisma.otpCode.update()` separately,
without a guarded concurrency predicate.

## Implementation

`server/src/services/auth.ts` now records wrong OTP attempts using guarded,
database-atomic `updateMany` mutations.

### Non-terminal transition

The atomic increment succeeds only when:

- the OTP id matches;
- `usedAt` is `null`;
- `expiresAt` is still in the future;
- `attempts < OTP_MAX_ATTEMPTS - 1`.

The counter is updated using:

```ts
attempts: { increment: 1 }
```

rather than a read-compute-write absolute value.

### Terminal transition

If the increment guard loses, a second guarded mutation attempts terminal
invalidation only when:

- the OTP id matches;
- `usedAt` is `null`;
- `expiresAt` is still in the future;
- `attempts >= OTP_MAX_ATTEMPTS - 1`.

Only the request that wins this guarded terminal transition throws
`OTP_MAX_ATTEMPTS`.

Requests that lose both guarded mutations perform no mutation and fall through
to the existing `INVALID_OTP` behavior.

## Fresh Expiry Fence

The increment and terminal mutations intentionally use separate fresh
timestamps.

The terminal guard does not reuse the timestamp captured before the increment
await because the OTP may expire between the two database operations.

This prevents an already-expired OTP from being invalidated using a stale
expiry fence.

## Preserved Behavior

Patch 19 does not change:

- `OTP_MAX_ATTEMPTS`;
- OTP error messages or error codes;
- successful OTP verification behavior;
- `requestOtp`;
- SMS behavior;
- JWT behavior;
- routes;
- rate limiting;
- Prisma schema;
- migrations;
- dependencies.

## Test Coverage

`server/src/services/auth.test.ts` contains 11 focused tests covering:

- first wrong-attempt atomic increment;
- second wrong-attempt atomic increment;
- terminal guarded invalidation;
- concurrent wrong attempts with no lost increment;
- attempts after invalidation;
- post-active-lookup `usedAt` race;
- expiry between increment and terminal guards using fake timers;
- stale request after `usedAt` becomes non-null;
- terminal race loser behavior;
- successful verification bypassing wrong-attempt `updateMany` accounting;
- exact `INVALID_OTP` behavior when no active OTP exists.

The tests explicitly assert that wrong-attempt accounting does not use
`prisma.otpCode.update()`.

## Validation

### Focused auth suite

```text
Test Files  1 passed
Tests       11 passed
```

### Full server regression suite

```text
Test Files  15 passed
Tests       200 passed
```

### Server TypeScript check

PASS.

### Server build

PASS.

### Git diff check

`git diff --check` passed with no reported whitespace errors.

## Current Git State

Branch:

```text
fix/otp-verification-attempt-race
```

Base HEAD:

```text
2f293c31fc8d06a3e4998ddff0f2295cba2ee6d2
```

Patch files:

- `server/src/services/auth.ts`
- `server/src/services/auth.test.ts`
- `docs/implementation-reports/patch-19-atomic-otp-verification-attempt-accounting.md`

No commit, push, pull request, or merge has been performed.

## Scope Note

A broader audit of successful-verification concurrency and selection among
multiple simultaneously active OTP rows is outside Patch 19 and is not claimed
as fixed by this change.
