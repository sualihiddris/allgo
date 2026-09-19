# Patch 20 - Atomic Successful OTP Consumption

## Problem

`verifyOtp()` previously located a valid OTP and then consumed it with an unconditional
`prisma.otpCode.update()`.

This created a lookup-to-consume race where:

- two concurrent correct-code requests could both authenticate;
- terminal invalidation could win after lookup but the correct request could still continue authentication;
- the OTP could expire between lookup and consumption and still be accepted.

## Implementation

`server/src/services/auth.ts` now consumes the exact OTP through a guarded atomic
`prisma.otpCode.updateMany()` before any successful-authentication side effects.

The consume succeeds only when:

- `id` matches the exact OTP;
- `usedAt` is still `null`;
- `expiresAt` is later than a fresh consume-time timestamp.

Successful authentication continues only when:

```text
updateMany.count === 1
```

If the guarded consume loses, verification returns the existing error:

```text
message: Invalid or expired OTP
status: 400
code: INVALID_OTP
```

The losing request does not proceed to user lookup/creation, rate-limit cleanup,
token generation, or refresh-token creation.

## Concurrency Behavior

The successful path now linearizes at the guarded database mutation:

```text
find exact active OTP
-> guarded atomic consume
-> only the winner continues authentication
```

Two concurrent correct-code requests may both obtain the same OTP snapshot, but only
one can transition it from unused to used.

The fresh expiry predicate also prevents an OTP that expires after lookup from being
consumed successfully.

## Preserved Behavior

Patch 20 does not change:

- `OTP_EXPIRY_MINUTES`;
- `OTP_MAX_ATTEMPTS`;
- Patch 19 wrong-attempt accounting;
- OTP error messages or codes;
- `requestOtp`;
- SMS behavior;
- JWT implementation;
- routes;
- rate limiting policy;
- Prisma schema;
- migrations;
- dependencies;
- TOTP/2FA behavior.

## Test Coverage

`server/src/services/auth.test.ts` now contains 14 OTP concurrency tests.

Patch 20 adds coverage for:

- normal atomic successful consumption;
- two concurrent correct-code requests with exactly one winner;
- terminal invalidation winning after successful lookup;
- expiry between lookup and consume;
- no downstream successful-authentication side effects when consumption loses.

The tests model current shared OTP state through stateful `updateMany` predicates
rather than hard-coded success/failure counts.

## Validation

Focused auth suite:

```text
Test Files  1 passed
Tests       14 passed
```

Full server suite:

```text
Test Files  15 passed
Tests       203 passed
```

Server TypeScript check: PASS.

Server build: PASS.

`git diff --check`: PASS.

## Review

The production and test diffs were manually reviewed.

A review-only Kimi/NVIDIA request was also attempted using only the Patch 20 diff,
but the external API timed out. The review request had no repository mutation path
and changed no files.

## Current Git State

Branch:

```text
fix/otp-success-consume-race
```

Base HEAD:

```text
7506b5850f112f1683bd92a4f6d0e0a2fc8540d7
```

Patch files:

- `server/src/services/auth.ts`
- `server/src/services/auth.test.ts`
- `docs/implementation-reports/patch-20-atomic-successful-otp-consumption.md`

No commit, push, pull request, or merge has been performed.

## Scope Note

Patch 20 does not address the separate concurrent `requestOtp()` issuance race that
can create multiple simultaneously active OTP rows.

That remains a separate follow-up.
