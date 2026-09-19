# Patch 21: OTP Request Issuance Race Hardening

## Summary

This patch closes the concurrent OTP issuance race in `requestOtp()`.

Previously, two requests for the same phone could interleave:

1. both invalidate existing OTP rows;
2. both create replacement OTP rows;
3. both send SMS messages.

That could leave multiple active OTPs for one phone and make verification
behavior ambiguous.

## Concurrency contract

For each normalized phone number:

- only one backend instance may own OTP issuance at a time;
- concurrent losers do not consume rate-limit quota;
- concurrent losers do not generate an OTP;
- concurrent losers do not mutate MySQL;
- concurrent losers do not send SMS;
- stale owners must not send a code after losing their issuance lease;
- MySQL independently enforces at most one active OTP ownership key.

## Redis issuance guard

`server/src/config/redis.ts` adds reusable ownership primitives:

- `setIfAbsent()` uses atomic Redis SET with EX and NX;
- `compareAndExpire()` performs owner-checked atomic lease renewal;
- `compareAndDelete()` performs owner-checked atomic release.

The in-memory development store implements equivalent ownership semantics.

`requestOtp()` acquires `otp:issue-lock:<normalized-phone>` using a random
UUID owner token.

The issuance lease is 60 seconds.

## Lease renewal before delivery

The request re-validates and renews its Redis ownership immediately before
SMS delivery.

If ownership has been lost:

- the newly-created OTP is invalidated when still owned by that request;
- the stale code is never sent;
- the request returns `OTP_REQUEST_IN_PROGRESS`.

If lease-renewal infrastructure fails:

- the request fails closed with `OTP_SERVICE_UNAVAILABLE`;
- it attempts to invalidate its exact newly-created OTP;
- no SMS is sent.

## Database backstop

The `OtpCode` model now contains the nullable unique field:

`activeKey String? @unique @db.VarChar(20)`

An active OTP stores its normalized phone in `activeKey`.

Consumed, invalidated, superseded, or abandoned OTP rows store `NULL`.

MySQL permits multiple NULL values in the unique index while preventing two
rows from owning the same non-null phone key. This provides a database-level
at-most-one-active-OTP invariant even if Redis lease timing becomes abnormal.

The migration:

1. adds nullable `activeKey`;
2. deterministically invalidates older duplicate currently-valid OTP rows;
3. backfills `activeKey` onto each surviving valid OTP;
4. creates the unique index.

Expired and historical rows remain valid history with `activeKey = NULL`.

A Prisma `P2002` collision during issuance is mapped to the retryable
`OTP_REQUEST_IN_PROGRESS` contract.

## Verification compatibility

All terminal OTP transitions clear `activeKey`:

- superseding an existing OTP;
- terminal wrong-attempt invalidation;
- successful OTP consumption;
- stale-owner abandonment before SMS.

Patch 19 atomic wrong-attempt accounting and Patch 20 atomic successful
consumption remain intact.

The wrong-code fallback lookup orders active OTPs by newest `createdAt` as
defense-in-depth for historical duplicate rows.

## SMS network bound

Arkesel SMS delivery now uses `AbortController` with a 15-second timeout.

This removes the previously unbounded SMS network wait and keeps delivery
inside a bounded issuance operation.

## Validation

Focused validation:

- Redis ownership primitives: 4/4 passed
- OTP auth tests: 21/21 passed
- SMS timeout tests: 2/2 passed
- Prisma schema validation: passed
- server TypeScript typecheck: passed

Full validation:

- 17 server test files passed
- 216 server tests passed
- server build passed
- `git diff --check` passed
- Prisma schema validation passed

## Files

Production and schema:

- `server/prisma/schema.prisma`
- `server/prisma/migrations/20260919162000_add_otp_active_key/migration.sql`
- `server/src/config/redis.ts`
- `server/src/services/auth.ts`
- `server/src/services/sms.ts`

Tests:

- `server/src/config/redis.test.ts`
- `server/src/services/auth.test.ts`
- `server/src/services/sms.test.ts`
