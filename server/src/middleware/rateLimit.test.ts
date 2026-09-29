import { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({
  incr: vi.fn(),
  pexpire: vi.fn(),
  pttl: vi.fn(),
}));
vi.mock("../config", () => ({ redis }));

import { rateLimit } from "./rateLimit";

describe("rateLimit counter expiry", () => {
  const windowMs = 60_000;
  const now = 1_800_000_000_000;
  const key = "rl:test:127.0.0.1";
  const req = { ip: "127.0.0.1" } as Request;
  const setHeader = vi.fn();
  const res = { setHeader } as unknown as Response;
  const next = vi.fn();
  const middleware = rateLimit({ windowMs, max: 100, keyPrefix: "rl:test" });

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(now);
    redis.pexpire.mockResolvedValue(1);
  });

  afterEach(() => vi.restoreAllMocks());

  it("repairs an existing counter at 113 without expiry and rereads its TTL", async () => {
    redis.incr.mockResolvedValue(114);
    redis.pttl.mockResolvedValueOnce(-1).mockResolvedValueOnce(windowMs - 1);

    await middleware(req, res, next);

    expect(redis.incr).toHaveBeenCalledWith(key);
    expect(redis.pexpire).toHaveBeenCalledExactlyOnceWith(key, windowMs);
    expect(redis.pttl).toHaveBeenCalledTimes(2);
    expect(redis.pttl).toHaveBeenNthCalledWith(1, key);
    expect(redis.pttl).toHaveBeenNthCalledWith(2, key);
    expect(setHeader).toHaveBeenCalledWith("X-RateLimit-Reset", now + windowMs - 1);
    expect(setHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", 0);
    expect(next).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      statusCode: 429, code: "RATE_LIMIT_EXCEEDED",
    }));
  });

  it("retains a normal counter's original window across requests", async () => {
    redis.incr.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    redis.pttl.mockResolvedValueOnce(windowMs).mockResolvedValueOnce(42_000);

    await middleware(req, res, next);
    await middleware(req, res, next);

    expect(redis.pexpire).toHaveBeenCalledExactlyOnceWith(key, windowMs);
    expect(redis.pttl).toHaveBeenCalledTimes(2);
    expect(setHeader).toHaveBeenLastCalledWith("X-RateLimit-Reset", now + 42_000);
    expect(next.mock.calls).toEqual([[], []]);
  });
});
