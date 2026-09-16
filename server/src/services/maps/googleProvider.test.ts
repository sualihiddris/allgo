import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock ../../config BEFORE the provider module is evaluated, so the real
// environment loader never runs in this test file.
vi.mock("../../config", () => ({
  env: {
    GOOGLE_MAPS_API_KEY: "test-google-maps-key",
  },
}));

import { GoogleMapsProvider } from "./googleProvider";

interface PendingFetchCall {
  input: unknown;
  init: RequestInit | undefined;
  signal: AbortSignal | undefined;
  resolve: (value: Response) => void;
  reject: (reason?: unknown) => void;
}

function makeAbortError(): Error {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

/**
 * Abort-aware fetch mock that behaves like real fetch:
 * - captures init.signal,
 * - returns a pending Promise,
 * - attaches an "abort" listener; when abort fires it rejects with an
 *   error whose name is exactly "AbortError",
 * - if the signal is already aborted, rejects immediately with AbortError.
 *
 * It also exposes the pending calls so individual tests can settle the
 * promise manually and avoid leaving unhandled/incomplete promises behind.
 */
function mockAbortAwareFetch() {
  const calls: PendingFetchCall[] = [];
  const fetchMock = vi.fn(
    (input: unknown, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const signal = (init?.signal as AbortSignal | undefined) ?? undefined;
        const call: PendingFetchCall = { input, init, signal, resolve, reject };
        calls.push(call);

        const onAbort = () => {
          reject(makeAbortError());
        };

        if (signal?.aborted) {
          onAbort();
          return;
        }
        signal?.addEventListener("abort", onAbort, { once: true });
      })
  );
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

function okRouteResponse(): Response {
  return {
    ok: true,
    json: async () => ({
      status: "OK",
      routes: [
        {
          legs: [
            {
              distance: { value: 1234 },
              duration: { value: 567 },
            },
          ],
          overview_polyline: { points: "encoded-polyline" },
          bounds: {
            northeast: { lat: 5.7, lng: -1.2 },
            southwest: { lat: 5.6, lng: -1.3 },
          },
        },
      ],
    }),
  } as unknown as Response;
}

function okAutocompleteResponse(): Response {
  return {
    ok: true,
    json: async () => ({
      suggestions: [
        {
          placePrediction: {
            placeId: "place-1",
            text: { text: "Accra Mall" },
          },
        },
      ],
    }),
  } as unknown as Response;
}

describe("GoogleMapsProvider request timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("getRoute success preserves existing return shape", async () => {
    const { calls } = mockAbortAwareFetch();
    const provider = new GoogleMapsProvider();

    const promise = provider.getRoute(
      { lat: 5.6037, lng: -0.187 },
      { lat: 5.66, lng: -0.2 }
    );

    expect(calls).toHaveLength(1);
    calls[0].resolve(okRouteResponse());

    const result = await promise;

    expect(result).toEqual({
      distance: 1234,
      duration: 567,
      polyline: "encoded-polyline",
      bounds: {
        northeast: { lat: 5.7, lng: -1.2 },
        southwest: { lat: 5.6, lng: -1.3 },
      },
    });
    expect(String(calls[0].input)).toContain(
      "https://maps.googleapis.com/maps/api/directions/json"
    );
  });

  it("does not abort the signal at 9,999 ms", async () => {
    const { calls } = mockAbortAwareFetch();
    const provider = new GoogleMapsProvider();

    const promise = provider.getRoute(
      { lat: 1, lng: 1 },
      { lat: 2, lng: 2 }
    );
    // Attach a rejection sentinel before advancing the clock so nothing can
    // ever surface as an unhandled rejection.
    const observed = promise.then(
      () => ({ settled: "resolved" as const }),
      (error) => ({ settled: "rejected" as const, error })
    );

    await vi.advanceTimersByTimeAsync(9_999);

    expect(calls).toHaveLength(1);
    expect(calls[0].signal?.aborted).toBe(false);

    // Settle the in-flight request cleanly so the test cannot hang or leak
    // a pending promise beyond its own scope.
    calls[0].resolve(okRouteResponse());
    const outcome = await observed;
    expect(outcome.settled).toBe("resolved");
  });

  it("aborts the signal at exactly 10,000 ms and the abort-aware fetch rejects with AbortError", async () => {
    const { calls } = mockAbortAwareFetch();
    const provider = new GoogleMapsProvider();

    const promise = provider.getRoute(
      { lat: 1, lng: 1 },
      { lat: 2, lng: 2 }
    );
    const assertion = expect(promise).rejects.toThrow(
      "Google Maps request timed out"
    );

    await vi.advanceTimersByTimeAsync(10_000);

    expect(calls).toHaveLength(1);
    expect(calls[0].signal?.aborted).toBe(true);

    // The abort-aware mock rejected with AbortError, which the provider
    // translated to the timeout error.
    await assertion;
  });

  it("rejects with exactly 'Google Maps request timed out' on timeout", async () => {
    mockAbortAwareFetch();
    const provider = new GoogleMapsProvider();

    const promise = provider.getRoute(
      { lat: 1, lng: 1 },
      { lat: 2, lng: 2 }
    );
    const assertion = expect(promise).rejects.toThrow(
      /^Google Maps request timed out$/
    );

    await vi.advanceTimersByTimeAsync(10_000);

    await assertion;
  });

  it("preserves an ordinary non-timeout fetch Error unchanged", async () => {
    const failure = new Error("socket hang up");
    const fetchMock = vi.fn().mockRejectedValue(failure);
    vi.stubGlobal("fetch", fetchMock);
    const provider = new GoogleMapsProvider();

    await expect(
      provider.getRoute({ lat: 1, lng: 1 }, { lat: 2, lng: 2 })
    ).rejects.toBe(failure);
  });

  it("preserves an unrelated Error even when the signal is aborted at the same moment", async () => {
    // Race coverage: abort fires (signal becomes aborted) but the fetch
    // rejects with an UNRELATED error, not an AbortError. Classification
    // must require BOTH conditions, so the unrelated error passes through.
    const unrelated = new Error("ECONNRESET");
    let capturedSignal: AbortSignal | undefined;
    const fetchMock = vi.fn(
      (_input: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          capturedSignal = init?.signal as AbortSignal | undefined;
          const onAbort = () => {
            reject(unrelated);
          };
          if (capturedSignal?.aborted) {
            onAbort();
            return;
          }
          capturedSignal?.addEventListener("abort", onAbort, { once: true });
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new GoogleMapsProvider();

    const promise = provider.getRoute(
      { lat: 1, lng: 1 },
      { lat: 2, lng: 2 }
    );
    const assertion = expect(promise).rejects.toBe(unrelated);

    await vi.advanceTimersByTimeAsync(10_000);

    expect(capturedSignal?.aborted).toBe(true);
    await assertion;
  });

  it("autocompletePlaces remains POST and preserves its URL, headers and body", async () => {
    const { fetchMock, calls } = mockAbortAwareFetch();
    const provider = new GoogleMapsProvider();

    const promise = provider.autocompletePlaces("accra", {
      lat: 5.6037,
      lng: -0.187,
    });

    expect(calls).toHaveLength(1);
    calls[0].resolve(okAutocompleteResponse());

    const result = await promise;

    expect(result).toEqual([{ placeId: "place-1", text: "Accra Mall" }]);

    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe("https://places.googleapis.com/v1/places:autocomplete");
    const init = call[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      "X-Goog-Api-Key": "test-google-maps-key",
      "X-Goog-FieldMask":
        "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      input: "accra",
      includedRegionCodes: ["gh"],
      languageCode: "en",
      regionCode: "gh",
      locationBias: {
        circle: {
          center: { latitude: 5.6037, longitude: -0.187 },
          radius: 50000,
        },
      },
    });
    // The provider must still pass an AbortSignal through to fetch.
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("autocompletePlaces receives the same 10,000 ms timeout protection", async () => {
    const { calls } = mockAbortAwareFetch();
    const provider = new GoogleMapsProvider();

    const promise = provider.autocompletePlaces("accra");
    const assertion = expect(promise).rejects.toThrow(
      "Google Maps request timed out"
    );

    await vi.advanceTimersByTimeAsync(10_000);

    expect(calls[0].signal?.aborted).toBe(true);
    await assertion;
  });

  it("clears the timer after a successful request", async () => {
    const { calls } = mockAbortAwareFetch();
    const provider = new GoogleMapsProvider();

    const promise = provider.getRoute(
      { lat: 1, lng: 1 },
      { lat: 2, lng: 2 }
    );
    expect(vi.getTimerCount()).toBe(1);

    calls[0].resolve(okRouteResponse());
    await promise;

    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the timer after a rejected request", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new GoogleMapsProvider();

    const promise = provider.getRoute(
      { lat: 1, lng: 1 },
      { lat: 2, lng: 2 }
    );
    const assertion = expect(promise).rejects.toThrow("network down");
    expect(vi.getTimerCount()).toBe(1);

    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
});
