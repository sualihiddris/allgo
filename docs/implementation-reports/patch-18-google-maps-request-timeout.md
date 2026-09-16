# Patch 18 — Google Maps Request Timeout Hardening



## Status



* **Patch:** 18

* **Branch:** `fix/maps-request-timeout`

* **Base commit:** `0de0db5f1cfca1ae110d31ce940e0f5efefbfd33`

* **Committed:** NO

* **Pushed:** NO

* **PR created:** NO

* **Implementation validation:** PASS

* **Review status:** PASS

* **Kimi review risk classification:** LOW

* **Kimi review blocking issues:** NONE



## Problem



`GoogleMapsProvider` performed Google Maps and Places HTTP requests without an AllGo-controlled request timeout.



Trip creation waits for `mapsService.getRoute()` before the trip is persisted. A stalled Google Maps or network request could therefore hold booking creation open without an application-level deadline.



The affected provider operations were:



* `getRoute()`

* `reverseGeocode()`

* `geocode()`

* `autocompletePlaces()`

* `getPlaceDetails()`



## Implementation



Patch 18 introduces a private Google Maps request deadline:



```ts

const GOOGLE_MAPS_REQUEST_TIMEOUT_MS = 10_000;

```



A shared internal `fetchWithTimeout()` helper now creates an `AbortController`, schedules a 10-second abort, supplies the controller signal to `fetch()`, and clears the timer in `finally`.



All five Google Maps and Places network requests use the shared timeout helper.



The patch also adds explicit `AbortError` classification. The stable AllGo timeout error:



```text

Google Maps request timed out

```



is produced only when both of the following conditions are true:



1. the helper's `AbortController` has been aborted; and

2. the caught fetch failure is an `AbortError`.



This prevents an unrelated network failure that races with timeout expiry from being incorrectly reported as a Google Maps timeout.



Non-timeout fetch errors continue to propagate unchanged.



Existing request URLs, query parameters, HTTP methods, headers, POST bodies, Google response validation, and public return shapes are preserved.



No retry, backoff, fallback provider, dependency, database, Redis, dispatch, trip, booking, CI, environment, or migration changes are included.



## Files Changed



Production:



* `server/src/services/maps/googleProvider.ts`



Tests:



* `server/src/services/maps/googleProvider.test.ts`



This report:



* `docs/implementation-reports/patch-18-google-maps-request-timeout.md`



## Test Coverage



A dedicated `GoogleMapsProvider` unit-test suite was added using mocked `globalThis.fetch`; no live Google requests are made.



Coverage includes:



* successful `getRoute()` behavior and return shape;

* no abort at `9,999 ms`;

* abort at exactly `10,000 ms`;

* exact stable timeout error;

* preservation of ordinary non-timeout fetch failures;

* preservation of unrelated failures racing timeout expiry;

* `autocompletePlaces()` POST request semantics;

* Places timeout protection;

* timer cleanup after successful requests;

* timer cleanup after rejected requests;

* restoration of fake timers and mocked globals;

* mocked configuration to avoid loading production environment validation.



The abort-aware fetch mock models native fetch behavior by rejecting with an `AbortError` when the supplied `AbortSignal` fires.



## Validation



### Focused Google Maps Provider Tests



Command:



```powershell

npm --prefix server test -- src/services/maps/googleProvider.test.ts

```



Result:



```text

Test Files  1 passed (1)

Tests       10 passed (10)

```



**PASS**



### Full Server Regression Suite



Agent post-edit validation:



```text

Test Files  14 passed (14)

Tests       189 passed (189)

```



**PASS**



### Server TypeScript Check



Command:



```powershell

npm run typecheck --workspace=@allgo/server

```



Result: exit code `0`.



**PASS**



### Server Build



Command:



```powershell

npm run build --workspace=@allgo/server

```



Result: exit code `0`.



**PASS**



### Git Diff Check



Command:



```powershell

git diff --check

```



Result: no reported whitespace errors for tracked changes.



**PASS**



Note: `googleProvider.test.ts` remained untracked during this verification, so the standard tracked `git diff --check` did not inspect that file. The file nevertheless passed TypeScript compilation and all 10 focused tests.



## Review



The Kimi adversarial review classified the change as **LOW risk** and reported **NO BLOCKING ISSUE FOUND**.



The review confirmed that timeout classification now requires both an aborted controller and an actual `AbortError`, preserving unrelated failures.



Non-blocking observations included:



* the race test could theoretically be strengthened with another timing variation;

* `isAbortError()` intentionally accepts foreign error-like objects whose `name` is `"AbortError"` when the controller is also aborted;

* timer-count assertions are somewhat coupled to the implementation's single-timer design.



None of these observations block Patch 18.



## Scope Confirmation



Patch 18 does not change:



* trip or booking lifecycle logic;

* dispatch behavior;

* Redis behavior;

* database schema or persistence;

* environment configuration;

* package dependencies;

* CI configuration;

* Prisma schema or migrations;

* retry/backoff behavior;

* provider fallback behavior.



## Current Git State



At report creation time:



```text

Branch: fix/maps-request-timeout

HEAD:   0de0db5f1cfca1ae110d31ce940e0f5efefbfd33



Modified:

  server/src/services/maps/googleProvider.ts



Untracked:

  server/src/services/maps/googleProvider.test.ts

  docs/implementation-reports/patch-18-google-maps-request-timeout.md

```



No commit, push, or pull request has been performed.
