import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Patch 19/20: atomic OTP attempt accounting and successful consumption.
 *
 * Every value referenced inside a vi.mock() factory is created through
 * vi.hoisted() so the hoisted mock registration cannot touch an
 * uninitialized top-level binding.
 */
const mocks = vi.hoisted(() => ({
  otpFindFirst: vi.fn(),
  otpUpdate: vi.fn(),
  otpUpdateMany: vi.fn(),
  otpCreate: vi.fn(),
  userFindUnique: vi.fn(),
  userCreate: vi.fn(),
  userUpdate: vi.fn(),
  refreshTokenCreate: vi.fn(),
  redisIncr: vi.fn(),
  redisExpire: vi.fn(),
  redisDel: vi.fn(),
  sendOtpSms: vi.fn(),
  generateTokens: vi.fn(),
  generatePendingTotpToken: vi.fn(),
  verifyToken: vi.fn(),
  normalizeGhanaPhone: vi.fn(),
  generateOtp: vi.fn(),
  generateReferralCode: vi.fn(),
  setIfAbsent: vi.fn(),
  compareAndExpire: vi.fn(),
  compareAndDelete: vi.fn(),
}));

vi.mock("../config", () => ({
  prisma: {
    otpCode: {
      findFirst: mocks.otpFindFirst,
      update: mocks.otpUpdate,
      updateMany: mocks.otpUpdateMany,
      create: mocks.otpCreate,
    },
    user: {
      findUnique: mocks.userFindUnique,
      create: mocks.userCreate,
      update: mocks.userUpdate,
    },
    refreshToken: {
      create: mocks.refreshTokenCreate,
    },
  },
  redis: {
    incr: mocks.redisIncr,
    expire: mocks.redisExpire,
    del: mocks.redisDel,
  },
}));

vi.mock("../config/redis", () => ({
  setIfAbsent: mocks.setIfAbsent,
  compareAndExpire: mocks.compareAndExpire,
  compareAndDelete: mocks.compareAndDelete,
}));

vi.mock("./sms", () => ({
  sendOtpSms: mocks.sendOtpSms,
}));

vi.mock("./jwt", () => ({
  generateTokens: mocks.generateTokens,
  generatePendingTotpToken: mocks.generatePendingTotpToken,
  verifyToken: mocks.verifyToken,
}));

vi.mock("../utils", () => ({
  normalizeGhanaPhone: mocks.normalizeGhanaPhone,
  generateOtp: mocks.generateOtp,
  generateReferralCode: mocks.generateReferralCode,
}));

// createError is a pure error factory; use the real implementation so the
// tests assert on the genuine error codes/messages produced in production.

import { requestOtp, verifyOtp } from "./auth";

const PHONE = "0244123456";
const NORMALIZED = "+233244123456";
const RIGHT_CODE = "123456";
const WRONG_CODE = "999999";
const MAX_ATTEMPTS = 3;

interface OtpRow {
  id: string;
  phone: string;
  code: string;
  attempts: number;
  usedAt: Date | null;
  expiresAt: Date;
}

function makeOtpRow(overrides: Partial<OtpRow> = {}): OtpRow {
  return {
    id: "otp-1",
    phone: NORMALIZED,
    code: RIGHT_CODE,
    attempts: 0,
    usedAt: null,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    ...overrides,
  };
}

/**
 * Predicate matcher mirroring Prisma updateMany semantics against the row,
 * including { gt } / { lt } / { gte } operators on attempts/expiresAt.
 */
function matchesWhere(row: OtpRow, where: any): boolean {
  if (where.id !== undefined && row.id !== where.id) return false;
  if (where.phone !== undefined && row.phone !== where.phone) return false;
  if (where.code !== undefined && row.code !== where.code) return false;
  if ("usedAt" in where && row.usedAt !== where.usedAt) return false;
  if (where.expiresAt !== undefined) {
    if (typeof where.expiresAt === "object" && "gt" in where.expiresAt) {
      if (!(row.expiresAt > where.expiresAt.gt)) return false;
    } else if (row.expiresAt !== where.expiresAt) return false;
  }
  if (where.attempts !== undefined) {
    const a = where.attempts;
    if (typeof a === "object") {
      if ("lt" in a && !(row.attempts < a.lt)) return false;
      if ("gte" in a && !(row.attempts >= a.gte)) return false;
      if ("gt" in a && !(row.attempts > a.gt)) return false;
    } else if (row.attempts !== a) return false;
  }
  return true;
}

/**
 * Statefully model a single OtpCode row. The updateMany implementation
 * checks the predicate and applies the mutation synchronously with no
 * intervening await, reproducing the DB row-level atomicity the
 * production fence depends on.
 */
function installStatefulOtpRow(row: OtpRow, codeLookupMiss = false) {
  mocks.otpFindFirst.mockImplementation(async ({ where }: any) => {
    // Exact-code lookup is identified by its code predicate.
    //
    // The wrong-attempt active-OTP lookup now also carries orderBy, so
    // orderBy itself can no longer distinguish the two query paths.
    if (where.code !== undefined) {
      if (!codeLookupMiss && matchesWhere(row, where)) {
        return { ...row };
      }

      return null;
    }

    // Active-OTP lookup for wrong-attempt accounting.
    if (matchesWhere(row, where)) {
      return { ...row };
    }

    return null;
  });

  mocks.otpUpdateMany.mockImplementation(async ({ where, data }: any) => {
    if (!matchesWhere(row, where)) return { count: 0 };
    if (data.attempts && typeof data.attempts === "object" && "increment" in data.attempts) {
      row.attempts += data.attempts.increment;
    } else if (typeof data.attempts === "number") {
      row.attempts = data.attempts;
    }
    if ("usedAt" in data) row.usedAt = data.usedAt;
    return { count: 1 };
  });

  mocks.otpUpdate.mockImplementation(async ({ where, data }: any) => {
    if (row.id !== where.id) return null;
    if ("usedAt" in data) row.usedAt = data.usedAt;
    if (typeof data?.attempts === "number") row.attempts = data.attempts;
    return { ...row };
  });

  return row;
}

function expectInvalidOtp(error: any) {
  expect(error).toBeTruthy();
  expect(error.statusCode ?? error.status).toBe(400);
  expect(error.code).toBe("INVALID_OTP");
  expect(error.message).toBe("Invalid or expired OTP");
}

function expectMaxAttemptsError(error: any) {
  expect(error).toBeTruthy();
  expect(error.statusCode ?? error.status).toBe(400);
  expect(error.code).toBe("OTP_MAX_ATTEMPTS");
  expect(error.message).toBe("Too many attempts. Please request a new code.");
}

function expectOtpRequestInProgress(error: any) {
  expect(error).toBeTruthy();
  expect(error.statusCode ?? error.status).toBe(429);
  expect(error.code).toBe("OTP_REQUEST_IN_PROGRESS");
  expect(error.message).toBe(
    "An OTP request is already being processed. Please try again."
  );
}

async function wrongAttempt(): Promise<any> {
  try {
    await verifyOtp(PHONE, WRONG_CODE);
    return null;
  } catch (error) {
    return error;
  }
}

beforeEach(() => {
  vi.resetAllMocks();

  mocks.normalizeGhanaPhone.mockReturnValue(NORMALIZED);
  mocks.generateTokens.mockReturnValue({
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresIn: 900,
  });
  mocks.generatePendingTotpToken.mockReturnValue("pending-token");
  mocks.redisDel.mockResolvedValue(1);
  mocks.redisIncr.mockResolvedValue(1);
  mocks.redisExpire.mockResolvedValue(1);

  mocks.generateOtp.mockReturnValue(RIGHT_CODE);

  mocks.otpUpdateMany.mockResolvedValue({
    count: 0,
  });

  mocks.otpCreate.mockResolvedValue({
    id: "otp-new",
  });

  mocks.sendOtpSms.mockResolvedValue({
    success: true,
  });

  mocks.setIfAbsent.mockResolvedValue(true);
  mocks.compareAndExpire.mockResolvedValue(true);
  mocks.compareAndDelete.mockResolvedValue(true);

  mocks.refreshTokenCreate.mockResolvedValue({
    id: "rt-1",
  });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("requestOtp cross-instance issuance guard", () => {
  it("rejects a concurrent loser before rate limit, database writes, or SMS", async () => {
    mocks.setIfAbsent.mockResolvedValue(false);

    let error: any;

    try {
      await requestOtp(PHONE);
    } catch (caught) {
      error = caught;
    }

    expectOtpRequestInProgress(error);

    expect(mocks.setIfAbsent).toHaveBeenCalledTimes(1);

    expect(mocks.setIfAbsent).toHaveBeenCalledWith(
      `otp:issue-lock:${NORMALIZED}`,
      expect.any(String),
      60
    );

    expect(mocks.redisIncr).not.toHaveBeenCalled();
    expect(mocks.redisExpire).not.toHaveBeenCalled();
    expect(mocks.generateOtp).not.toHaveBeenCalled();
    expect(mocks.otpUpdateMany).not.toHaveBeenCalled();
    expect(mocks.otpCreate).not.toHaveBeenCalled();
    expect(mocks.sendOtpSms).not.toHaveBeenCalled();

    // A request that never acquired ownership must never attempt release.
    expect(mocks.compareAndExpire).not.toHaveBeenCalled();
    expect(mocks.compareAndDelete).not.toHaveBeenCalled();
  });

  it("holds the per-phone lock through SMS and releases the same owner token", async () => {
    const result = await requestOtp(PHONE);

    expect(result).toEqual({
      success: true,
      phone: NORMALIZED,
      expiresAt: expect.any(Date),
      message: "OTP sent successfully",
    });

    expect(mocks.setIfAbsent).toHaveBeenCalledTimes(1);

    const [lockKey, lockToken, ttlSeconds] =
      mocks.setIfAbsent.mock.calls[0];

    expect(lockKey).toBe(
      `otp:issue-lock:${NORMALIZED}`
    );

    expect(lockToken).toEqual(expect.any(String));
    expect(lockToken.length).toBeGreaterThan(0);
    expect(ttlSeconds).toBe(60);

    expect(mocks.redisIncr).toHaveBeenCalledTimes(1);

    expect(mocks.redisExpire).toHaveBeenCalledWith(
      `otp:rate:${NORMALIZED}`,
      3600
    );

    expect(mocks.generateOtp).toHaveBeenCalledWith(6);

    expect(mocks.otpUpdateMany).toHaveBeenCalledWith({
      where: {
        phone: NORMALIZED,
        usedAt: null,
      },
      data: {
        usedAt: expect.any(Date),
        activeKey: null,
      },
    });

    expect(mocks.otpCreate).toHaveBeenCalledWith({
      data: {
        phone: NORMALIZED,
        activeKey: NORMALIZED,
        code: RIGHT_CODE,
        expiresAt: expect.any(Date),
      },
    });

    expect(mocks.compareAndExpire).toHaveBeenCalledTimes(1);
    expect(mocks.compareAndExpire).toHaveBeenCalledWith(
      lockKey,
      lockToken,
      60
    );

    expect(
      mocks.compareAndExpire.mock.invocationCallOrder[0]
    ).toBeLessThan(
      mocks.sendOtpSms.mock.invocationCallOrder[0]
    );

    expect(mocks.sendOtpSms).toHaveBeenCalledWith(
      NORMALIZED,
      RIGHT_CODE
    );

    expect(mocks.compareAndDelete).toHaveBeenCalledTimes(1);

    expect(mocks.compareAndDelete).toHaveBeenCalledWith(
      lockKey,
      lockToken
    );

    expect(
      mocks.setIfAbsent.mock.invocationCallOrder[0]
    ).toBeLessThan(
      mocks.redisIncr.mock.invocationCallOrder[0]
    );

    expect(
      mocks.sendOtpSms.mock.invocationCallOrder[0]
    ).toBeLessThan(
      mocks.compareAndDelete.mock.invocationCallOrder[0]
    );
  });

  it("allows exactly one of two concurrent requests to issue and send an OTP", async () => {
    let currentOwner: string | null = null;

    mocks.setIfAbsent.mockImplementation(
      async (_key: string, ownerToken: string) => {
        if (currentOwner !== null) {
          return false;
        }

        currentOwner = ownerToken;
        return true;
      }
    );

    mocks.compareAndDelete.mockImplementation(
      async (_key: string, ownerToken: string) => {
        if (currentOwner !== ownerToken) {
          return false;
        }

        currentOwner = null;
        return true;
      }
    );

    const results = await Promise.allSettled([
      requestOtp(PHONE),
      requestOtp(PHONE),
    ]);

    const fulfilled = results.filter(
      (result) => result.status === "fulfilled"
    );

    const rejected = results.filter(
      (result) => result.status === "rejected"
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    if (rejected[0].status === "rejected") {
      expectOtpRequestInProgress(
        rejected[0].reason
      );
    }

    expect(mocks.setIfAbsent).toHaveBeenCalledTimes(2);

    // Only the lock winner can consume quota or produce issuance
    // side effects.
    expect(mocks.redisIncr).toHaveBeenCalledTimes(1);
    expect(mocks.generateOtp).toHaveBeenCalledTimes(1);
    expect(mocks.otpUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocks.otpCreate).toHaveBeenCalledTimes(1);
    expect(mocks.sendOtpSms).toHaveBeenCalledTimes(1);
    expect(mocks.compareAndDelete).toHaveBeenCalledTimes(1);

    expect(currentOwner).toBeNull();
  });

  it("never sends the created OTP when lease ownership is lost before SMS", async () => {
    mocks.compareAndExpire.mockResolvedValue(false);

    let error: any;

    try {
      await requestOtp(PHONE);
    } catch (caught) {
      error = caught;
    }

    expectOtpRequestInProgress(error);

    expect(mocks.otpCreate).toHaveBeenCalledTimes(1);
    expect(mocks.compareAndExpire).toHaveBeenCalledTimes(1);

    // First updateMany invalidates the previous OTP; the second abandons
    // this request's exact newly-created row.
    expect(mocks.otpUpdateMany).toHaveBeenCalledTimes(2);

    expect(mocks.otpUpdateMany).toHaveBeenNthCalledWith(
      2,
      {
        where: {
          id: "otp-new",
          usedAt: null,
          activeKey: NORMALIZED,
        },
        data: {
          usedAt: expect.any(Date),
          activeKey: null,
        },
      }
    );

    expect(mocks.sendOtpSms).not.toHaveBeenCalled();

    // finally still performs owner-checked cleanup, which cannot delete a
    // newer owner's lock.
    expect(mocks.compareAndDelete).toHaveBeenCalledTimes(1);
  });

  it("maps the database active-OTP uniqueness backstop to the retryable in-progress error", async () => {
    mocks.otpCreate.mockRejectedValue({
      code: "P2002",
    });

    let error: any;

    try {
      await requestOtp(PHONE);
    } catch (caught) {
      error = caught;
    }

    expectOtpRequestInProgress(error);

    expect(mocks.otpUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocks.otpCreate).toHaveBeenCalledTimes(1);

    // The database fence failed before delivery, so no unusable code is sent.
    expect(mocks.sendOtpSms).not.toHaveBeenCalled();

    // The Redis lease is still owner-released in finally.
    expect(mocks.compareAndDelete).toHaveBeenCalledTimes(1);
  });

  it("releases ownership even when SMS delivery fails", async () => {
    mocks.sendOtpSms.mockResolvedValue({
      success: false,
    });

    let error: any;

    try {
      await requestOtp(PHONE);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeTruthy();
    expect(error.statusCode ?? error.status).toBe(500);
    expect(error.code).toBe("SMS_FAILED");

    expect(mocks.compareAndDelete).toHaveBeenCalledTimes(1);

    const [, lockToken] =
      mocks.setIfAbsent.mock.calls[0];

    expect(mocks.compareAndDelete).toHaveBeenCalledWith(
      `otp:issue-lock:${NORMALIZED}`,
      lockToken
    );
  });

  it("does not turn successful OTP delivery into failure when unlock fails", async () => {
    const releaseError = new Error(
      "redis release unavailable"
    );

    mocks.compareAndDelete.mockRejectedValue(
      releaseError
    );

    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      await expect(
        requestOtp(PHONE)
      ).resolves.toMatchObject({
        success: true,
        phone: NORMALIZED,
        message: "OTP sent successfully",
      });

      expect(
        mocks.sendOtpSms
      ).toHaveBeenCalledTimes(1);

      expect(
        mocks.compareAndDelete
      ).toHaveBeenCalledTimes(1);

      expect(errorSpy).toHaveBeenCalledWith(
        "[Auth] Failed to release OTP issuance lock:",
        releaseError
      );
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe("verifyOtp OTP concurrency guards (atomic)", () => {
  it("first wrong attempt increments atomically and returns INVALID_OTP, never prisma.otpCode.update", async () => {
    const row = installStatefulOtpRow(makeOtpRow({ attempts: 0 }));

    const error = await wrongAttempt();

    expectInvalidOtp(error);
    expect(mocks.otpUpdateMany).toHaveBeenCalledTimes(1);

    // Even if legacy duplicate active rows exist, wrong-attempt accounting
    // deterministically selects the newest active OTP.
    expect(
      mocks.otpFindFirst.mock.calls[1][0].orderBy
    ).toEqual({
      createdAt: "desc",
    });

    const call = mocks.otpUpdateMany.mock.calls[0][0];
    // Guarded predicate: same OTP, still active, below terminal slot.
    expect(call.where.id).toBe("otp-1");
    expect(call.where.usedAt).toBeNull();
    expect(call.where.expiresAt).toEqual({ gt: expect.any(Date) });
    expect(call.where.attempts).toEqual({ lt: MAX_ATTEMPTS - 1 });
    // Atomic increment, never an absolute computed value.
    expect(call.data.attempts).toEqual({ increment: 1 });
    expect(typeof call.data.attempts).not.toBe("number");

    // Wrong-attempt accounting must NEVER use the single-row otpCode.update
    // path - that is reserved for marking a successfully verified OTP used.
    expect(mocks.otpUpdate).not.toHaveBeenCalled();

    expect(row.attempts).toBe(1);
    expect(row.usedAt).toBeNull();
  });

  it("second wrong attempt increments atomically and returns INVALID_OTP", async () => {
    const row = installStatefulOtpRow(makeOtpRow({ attempts: 1 }));

    const error = await wrongAttempt();

    expectInvalidOtp(error);
    expect(mocks.otpUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocks.otpUpdateMany.mock.calls[0][0].data.attempts).toEqual({ increment: 1 });
    expect(mocks.otpUpdate).not.toHaveBeenCalled();
    expect(row.attempts).toBe(2);
    expect(row.usedAt).toBeNull();
  });

  it("terminal wrong attempt fails increment guard, invalidates via guarded update, throws OTP_MAX_ATTEMPTS", async () => {
    const row = installStatefulOtpRow(makeOtpRow({ attempts: MAX_ATTEMPTS - 1 }));

    const error = await wrongAttempt();

    expectMaxAttemptsError(error);
    expect(mocks.otpUpdateMany).toHaveBeenCalledTimes(2);

    const incrementCall = mocks.otpUpdateMany.mock.calls[0][0];
    expect(incrementCall.where.attempts).toEqual({ lt: MAX_ATTEMPTS - 1 });
    expect(incrementCall.data.attempts).toEqual({ increment: 1 });

    const invalidateCall = mocks.otpUpdateMany.mock.calls[1][0];
    expect(invalidateCall.where.id).toBe("otp-1");
    expect(invalidateCall.where.usedAt).toBeNull();
    expect(invalidateCall.where.expiresAt).toEqual({ gt: expect.any(Date) });
    expect(invalidateCall.where.attempts).toEqual({ gte: MAX_ATTEMPTS - 1 });
    expect(invalidateCall.data.usedAt).toEqual(expect.any(Date));

    expect(row.usedAt).not.toBeNull();
    expect(row.attempts).toBe(MAX_ATTEMPTS - 1);
  });

  it("concurrent wrong attempts from attempts=0 lose no increment and end invalidated", async () => {
    const row = installStatefulOtpRow(makeOtpRow({ attempts: 0 }));

    const results = await Promise.all([
      wrongAttempt(),
      wrongAttempt(),
      wrongAttempt(),
    ]);

    const invalidCount = results.filter(
      (e) => e && e.code === "INVALID_OTP"
    ).length;
    const maxCount = results.filter(
      (e) => e && e.code === "OTP_MAX_ATTEMPTS"
    ).length;

    // Two non-terminal increments succeed, exactly one terminal
    // invalidation succeeds.
    expect(invalidCount).toBe(2);
    expect(maxCount).toBe(1);

    const terminalError = results.find((e) => e && e.code === "OTP_MAX_ATTEMPTS");
    expectMaxAttemptsError(terminalError);
    for (const e of results) {
      if (e && e.code === "INVALID_OTP") expectInvalidOtp(e);
    }

    // No lost increment and no absolute write: final state is exactly
    // the two successful atomic increments plus terminal invalidation.
    for (const call of mocks.otpUpdateMany.mock.calls) {
      const data = call[0].data;
      if (data.attempts !== undefined) {
        expect(data.attempts).toEqual({ increment: 1 });
      }
    }
    expect(row.attempts).toBe(2);
    expect(row.attempts).not.toBe(1);
    expect(row.usedAt).not.toBeNull();
  });

  it("wrong attempts after invalidation cannot revive, reset or mutate the OTP", async () => {
    const row = installStatefulOtpRow(
      makeOtpRow({ attempts: 2, usedAt: new Date() })
    );
    const usedAtBefore = row.usedAt;
    const attemptsBefore = row.attempts;

    const errors = await Promise.all([wrongAttempt(), wrongAttempt()]);

    for (const e of errors) expectInvalidOtp(e);

    // No active OTP is found; the guarded mutations never even run,
    // and the row is untouched.
    expect(row.usedAt).toBe(usedAtBefore);
    expect(row.attempts).toBe(attemptsBefore);
  });

  it("guards protect a request that obtained existingOtp.id and then loses the usedAt race post-lookup", async () => {
    // Real post-lookup race: the exact-code lookup misses, the active-OTP
    // lookup SUCCEEDS and returns a snapshot, and only AFTER that point
    // (before the first guarded updateMany executes) does shared state
    // change to usedAt != null - e.g. a concurrent request successfully
    // verified the OTP in the interleaving window.
    const row = makeOtpRow({ attempts: 1 });

    // Track whether the active-OTP lookup has completed yet. Only once it
    // has returned do we flip usedAt, so the test proves the request
    // already held existingOtp.id when it lost the race.
    let activeLookupDone = false;

    mocks.otpFindFirst.mockImplementation(async ({ where }: any) => {
      // Exact-code lookup: misses (wrong code submitted).
      if (where.code !== undefined) return null;

      // Active-OTP lookup: succeeds, returning a snapshot of the row.
      if (matchesWhere(row, where)) {
        const snapshot = { ...row };
        activeLookupDone = true;
        // Interleaving: immediately after this lookup succeeds, another
        // request consumes the OTP before our first guarded mutation runs.
        row.usedAt = new Date();
        return snapshot;
      }
      return null;
    });

    // The guarded mutations evaluate predicates against CURRENT shared
    // state - exactly what the real DB does with row-level updateMany.
    mocks.otpUpdateMany.mockImplementation(async ({ where }: any) => {
      // Sanity: this test's premise is that the snapshot lookup happened
      // BEFORE any guarded mutation ran.
      expect(activeLookupDone).toBe(true);
      if (!matchesWhere(row, where)) return { count: 0 };
      return { count: 1 };
    });

    const error = await wrongAttempt();

    // Both guarded mutations lost: the usedAt fence rejected them even
    // though this request had already obtained existingOtp.id.
    expect(activeLookupDone).toBe(true);
    expect(mocks.otpUpdateMany).toHaveBeenCalledTimes(2);
    expect(mocks.otpUpdateMany.mock.calls[0][0].where.usedAt).toBeNull();
    expect(mocks.otpUpdateMany.mock.calls[1][0].where.usedAt).toBeNull();

    // Plain INVALID_OTP, not OTP_MAX_ATTEMPTS: the terminal transition did
    // not win either.
    expectInvalidOtp(error);

    // Nothing overwritten/reset: attempts untouched, usedAt owned by the
    // winning request.
    expect(row.attempts).toBe(1);
    expect(row.usedAt).not.toBeNull();
    expect(mocks.otpUpdate).not.toHaveBeenCalled();
  });

  it("terminal guard uses a fresh expiry timestamp when the OTP expires between the two guards", async () => {
    // Exact expiry edge: attempts already at OTP_MAX_ATTEMPTS - 1. The
    // increment guard fails on attempts; the clock then advances past
    // expiresAt BEFORE the terminal invalidation. If production reused the
    // pre-increment Date, the terminal guard would still match and wrongly
    // invalidate an already-expired OTP with OTP_MAX_ATTEMPTS. Using a
    // fresh Date, the terminal guard must fail and the OTP must remain
    // unmodified, producing plain INVALID_OTP.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-19T12:00:00.000Z"));

    const expiresAt = new Date("2026-08-19T12:00:05.000Z"); // +5s
    const row = makeOtpRow({ attempts: MAX_ATTEMPTS - 1, expiresAt });

    mocks.otpFindFirst.mockImplementation(async ({ where }: any) => {
      // Exact-code lookup misses; active-OTP lookup returns the live row.
      if (where.code !== undefined) return null;
      if (matchesWhere(row, where)) return { ...row };
      return null;
    });

    let updateManyCalls = 0;
    mocks.otpUpdateMany.mockImplementation(async ({ where, data }: any) => {
      updateManyCalls += 1;
      if (updateManyCalls === 1) {
        // Increment guard fails (attempts already at MAX-1 - matchesWhere
        // enforces this via the { lt } predicate anyway).
        const matched = matchesWhere(row, where);
        expect(matched).toBe(false);
        // Simulate the await taking long enough for the OTP to expire
        // before the terminal guard runs.
        vi.setSystemTime(new Date("2026-08-19T12:00:06.000Z"));
        return { count: 0 };
      }
      // Terminal guard: with fake time now past expiresAt, the predicate
      // can only still match if production reused the STALE pre-increment
      // Date. Assert it does not match, i.e. the fence used a fresh Date.
      const matched = matchesWhere(row, where);
      expect(matched).toBe(false);
      expect(where.expiresAt.gt.getTime()).toBeGreaterThan(
        new Date("2026-08-19T12:00:00.000Z").getTime()
      );
      if (matched) {
        if ("usedAt" in data) row.usedAt = data.usedAt;
        return { count: 1 };
      }
      return { count: 0 };
    });

    const error = await wrongAttempt();

    // Fresh-fence outcome: INVALID_OTP, NOT OTP_MAX_ATTEMPTS.
    expectInvalidOtp(error);
    expect(mocks.otpUpdateMany).toHaveBeenCalledTimes(2);

    // The OTP row is completely unmodified by this request.
    expect(row.attempts).toBe(MAX_ATTEMPTS - 1);
    expect(row.usedAt).toBeNull();
    expect(mocks.otpUpdate).not.toHaveBeenCalled();
  });

  it("stale wrong request after usedAt becomes non-null cannot mutate the OTP", async () => {
    const row = installStatefulOtpRow(makeOtpRow({ attempts: 1 }));

    // Simulate the OTP being consumed by a successful verification
    // before this stale wrong attempt lands.
    row.usedAt = new Date();
    const usedAtBefore = row.usedAt;

    const error = await wrongAttempt();

    expectInvalidOtp(error);
    expect(row.attempts).toBe(1);
    expect(row.usedAt).toBe(usedAtBefore);
  });

  it("race loser after terminal invalidation falls through to INVALID_OTP without mutation", async () => {
    const row = installStatefulOtpRow(makeOtpRow({ attempts: MAX_ATTEMPTS - 1 }));

    // Terminal invalidation wins for the other request before this one
    // runs its guards.
    row.usedAt = new Date();

    const error = await wrongAttempt();

    expectInvalidOtp(error);
    expect(row.attempts).toBe(MAX_ATTEMPTS - 1);
  });

  it("successful verification atomically consumes the exact OTP before authentication side effects", async () => {
    const row = installStatefulOtpRow(makeOtpRow({ attempts: 0 }));
    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      phone: NORMALIZED,
      name: "Customer",
      role: "CUSTOMER",
      isActive: true,
      customer: { id: "cust-1" },
      admin: null,
    });

    const result = await verifyOtp(PHONE, RIGHT_CODE);

    expect(result.success).toBe(true);
    expect(result.tokens?.accessToken).toBe("access-token");
    expect(mocks.otpUpdateMany).toHaveBeenCalledTimes(1);

    const consumeCall = mocks.otpUpdateMany.mock.calls[0][0];
    expect(consumeCall.where).toEqual({
      id: "otp-1",
      usedAt: null,
      expiresAt: { gt: expect.any(Date) },
    });
    expect(consumeCall.data).toEqual({
      usedAt: expect.any(Date),
      activeKey: null,
    });
    expect(consumeCall.where.attempts).toBeUndefined();
    expect(consumeCall.data.attempts).toBeUndefined();
    expect(mocks.otpUpdate).not.toHaveBeenCalled();

    expect(row.usedAt).not.toBeNull();
    expect(mocks.userFindUnique).toHaveBeenCalledTimes(1);
    expect(mocks.redisDel).toHaveBeenCalledTimes(1);
    expect(mocks.generateTokens).toHaveBeenCalledTimes(1);
    expect(mocks.refreshTokenCreate).toHaveBeenCalledTimes(1);
  });

  it("two concurrent correct verifications consume the OTP exactly once", async () => {
    const row = installStatefulOtpRow(makeOtpRow({ attempts: 0 }));

    let exactLookups = 0;
    let releaseBoth!: () => void;
    const bothLookedUp = new Promise<void>((resolve) => {
      releaseBoth = resolve;
    });

    mocks.otpFindFirst.mockImplementation(async ({ where, orderBy }: any) => {
      if (!orderBy) return null;
      if (!matchesWhere(row, where)) return null;

      const snapshot = { ...row };
      exactLookups += 1;
      if (exactLookups === 2) releaseBoth();
      await bothLookedUp;
      return snapshot;
    });

    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      phone: NORMALIZED,
      name: "Customer",
      role: "CUSTOMER",
      isActive: true,
      customer: { id: "cust-1" },
      admin: null,
    });

    const results = await Promise.allSettled([
      verifyOtp(PHONE, RIGHT_CODE),
      verifyOtp(PHONE, RIGHT_CODE),
    ]);

    expect(exactLookups).toBe(2);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    if (fulfilled[0].status === "fulfilled") {
      expect(fulfilled[0].value.success).toBe(true);
    }
    if (rejected[0].status === "rejected") {
      expectInvalidOtp(rejected[0].reason);
    }

    expect(mocks.otpUpdateMany).toHaveBeenCalledTimes(2);
    expect(row.usedAt).not.toBeNull();
    expect(mocks.otpUpdate).not.toHaveBeenCalled();
    expect(mocks.userFindUnique).toHaveBeenCalledTimes(1);
    expect(mocks.redisDel).toHaveBeenCalledTimes(1);
    expect(mocks.generateTokens).toHaveBeenCalledTimes(1);
    expect(mocks.refreshTokenCreate).toHaveBeenCalledTimes(1);
  });

  it("correct verification loses cleanly if terminal invalidation wins after lookup", async () => {
    const row = installStatefulOtpRow(makeOtpRow({ attempts: 2 }));
    const terminalUsedAt = new Date(Date.now() + 1_000);

    mocks.otpFindFirst.mockImplementation(async ({ where, orderBy }: any) => {
      if (!orderBy) return null;
      if (!matchesWhere(row, where)) return null;

      const snapshot = { ...row };
      row.usedAt = terminalUsedAt;
      return snapshot;
    });

    let error: any;
    try {
      await verifyOtp(PHONE, RIGHT_CODE);
    } catch (caught) {
      error = caught;
    }

    expectInvalidOtp(error);
    expect(mocks.otpUpdateMany).toHaveBeenCalledTimes(1);
    expect(row.usedAt).toBe(terminalUsedAt);
    expect(mocks.otpUpdate).not.toHaveBeenCalled();
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.redisDel).not.toHaveBeenCalled();
    expect(mocks.generateTokens).not.toHaveBeenCalled();
    expect(mocks.refreshTokenCreate).not.toHaveBeenCalled();
  });

  it("successful verification uses a fresh expiry fence at consume time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-18T12:00:00.000Z"));

    const row = installStatefulOtpRow(
      makeOtpRow({
        attempts: 0,
        expiresAt: new Date("2026-09-18T12:00:05.000Z"),
      })
    );

    mocks.otpFindFirst.mockImplementation(async ({ where, orderBy }: any) => {
      if (!orderBy) return null;
      if (!matchesWhere(row, where)) return null;

      const snapshot = { ...row };
      vi.setSystemTime(new Date("2026-09-18T12:00:06.000Z"));
      return snapshot;
    });

    let error: any;
    try {
      await verifyOtp(PHONE, RIGHT_CODE);
    } catch (caught) {
      error = caught;
    }

    expectInvalidOtp(error);
    expect(mocks.otpUpdateMany).toHaveBeenCalledTimes(1);

    const consumeCall = mocks.otpUpdateMany.mock.calls[0][0];
    expect(consumeCall.where.expiresAt.gt).toEqual(
      new Date("2026-09-18T12:00:06.000Z")
    );

    expect(row.usedAt).toBeNull();
    expect(mocks.otpUpdate).not.toHaveBeenCalled();
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.redisDel).not.toHaveBeenCalled();
    expect(mocks.generateTokens).not.toHaveBeenCalled();
    expect(mocks.refreshTokenCreate).not.toHaveBeenCalled();
  });

  it("preserves exact INVALID_OTP code/message on a plain wrong code with no active OTP", async () => {
    // No active OTP row at all.
    installStatefulOtpRow(makeOtpRow({ usedAt: new Date() }));

    const error = await wrongAttempt();

    expectInvalidOtp(error);
  });
});
