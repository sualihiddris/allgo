import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// Force config/redis onto the in-memory backend so these tests exercise
// the local implementation of the same ownership semantics used by
// Redis SET NX + owner-checked compare-and-delete.
vi.mock("./env", () => ({
  env: {
    REDIS_URL: "",
  },
}));

import {
  compareAndDelete,
  compareAndExpire,
  redis,
  setIfAbsent,
} from "./redis";

const KEY = "test:lock:otp-issuance";

describe("Redis ownership primitives", () => {
  beforeEach(async () => {
    await redis.del(KEY);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await redis.del(KEY);
  });

  it("setIfAbsent grants only the first owner while TTL is active", async () => {
    await expect(
      setIfAbsent(KEY, "owner-a", 30)
    ).resolves.toBe(true);

    await expect(
      setIfAbsent(KEY, "owner-b", 30)
    ).resolves.toBe(false);

    await expect(
      redis.get(KEY)
    ).resolves.toBe("owner-a");
  });

  it("setIfAbsent permits a new owner after the previous TTL expires", async () => {
    vi.useFakeTimers();

    vi.setSystemTime(
      new Date("2026-09-19T12:00:00.000Z")
    );

    await expect(
      setIfAbsent(KEY, "owner-a", 1)
    ).resolves.toBe(true);

    vi.setSystemTime(
      new Date("2026-09-19T12:00:01.001Z")
    );

    await expect(
      setIfAbsent(KEY, "owner-b", 30)
    ).resolves.toBe(true);

    await expect(
      redis.get(KEY)
    ).resolves.toBe("owner-b");
  });

  it("compareAndExpire renews only the current owner's lease", async () => {
    vi.useFakeTimers();

    vi.setSystemTime(
      new Date("2026-09-19T12:00:00.000Z")
    );

    await expect(
      setIfAbsent(KEY, "owner-a", 1)
    ).resolves.toBe(true);

    vi.setSystemTime(
      new Date("2026-09-19T12:00:00.500Z")
    );

    await expect(
      compareAndExpire(KEY, "owner-b", 30)
    ).resolves.toBe(false);

    await expect(
      compareAndExpire(KEY, "owner-a", 30)
    ).resolves.toBe(true);

    // We are now beyond the original one-second lease, but still inside the
    // renewed 30-second lease.
    vi.setSystemTime(
      new Date("2026-09-19T12:00:02.000Z")
    );

    await expect(
      setIfAbsent(KEY, "owner-c", 30)
    ).resolves.toBe(false);

    await expect(
      redis.get(KEY)
    ).resolves.toBe("owner-a");
  });

  it("compareAndDelete cannot release another owner's lock", async () => {
    await expect(
      setIfAbsent(KEY, "owner-a", 30)
    ).resolves.toBe(true);

    await expect(
      compareAndDelete(KEY, "owner-b")
    ).resolves.toBe(false);

    await expect(
      redis.get(KEY)
    ).resolves.toBe("owner-a");

    await expect(
      compareAndDelete(KEY, "owner-a")
    ).resolves.toBe(true);

    await expect(
      redis.get(KEY)
    ).resolves.toBeNull();
  });
});
