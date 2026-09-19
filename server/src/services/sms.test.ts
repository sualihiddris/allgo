import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
}));

vi.mock("../config", () => ({
  env: {
    ARKESEL_API_KEY: "test-api-key",
  },
}));

import { sendSms } from "./sms";

describe("SMS request timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("aborts an Arkesel request after 15 seconds", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    mocks.fetch.mockImplementation(
      async (_url: string, options: any) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            "abort",
            () => {
              const error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
            },
            { once: true }
          );
        })
    );

    const resultPromise = sendSms(
      "+233244123456",
      "OTP test"
    );

    expect(mocks.fetch).toHaveBeenCalledTimes(1);

    const [, options] =
      mocks.fetch.mock.calls[0];

    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.signal.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(14_999);

    expect(options.signal.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);

    expect(options.signal.aborted).toBe(true);

    await expect(resultPromise).resolves.toEqual({
      success: false,
      error: "SMS service unavailable",
    });

    expect(errorSpy).toHaveBeenCalled();
  });

  it("clears the timeout after a successful SMS request", async () => {
    mocks.fetch.mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        status: "success",
        data: [
          {
            id: "sms-1",
          },
        ],
      }),
    });

    await expect(
      sendSms(
        "+233244123456",
        "OTP test"
      )
    ).resolves.toEqual({
      success: true,
      messageId: "sms-1",
    });

    expect(vi.getTimerCount()).toBe(0);

    const [, options] =
      mocks.fetch.mock.calls[0];

    expect(options.signal.aborted).toBe(false);
  });
});
