# AllGo Dispatch Lifecycle Audit

## 1. Executive Summary

The lifecycle is **partially complete but disconnected for call-in bookings and unsafe under concurrency**.

Normal customer bookings can reach socket dispatch, driver offers, acceptance, assignment, tracking, and completion. The Admin call-in endpoint creates a durable trip and identifies a nearby driver, but it does not invoke the Socket.IO offer flow, so the Driver app does not receive a request from a call-in booking.

The main safety concern is that acceptance is coordinated by process-local state and `assignTripToDriver()` performs an unconditional update. There is no database-level conditional/atomic claim preventing competing dispatch flows from assigning the same trip.

## 2. Current Architecture

```text
Customer app
  -> POST /api/v1/bookings/trip
  -> createTrip()
  -> REQUESTED trip
  -> customer socket connects
  -> trip:dispatch
  -> findNearbyDrivers()
  -> trip:offer to driver room
  -> trip:accept / trip:decline
  -> assignTripToDriver()
  -> trip.driverId + ACCEPTED
  -> trip:accepted / trip:confirmed
  -> driver updates STARTED/COMPLETED via REST
  -> customer receives trip:status

Admin call-in
  -> POST /api/v1/admin/trips/call-in
  -> geocode locations when needed
  -> createTrip()
  -> REQUESTED trip
  -> findDriverWithExpansion()
  -> nearest driver is returned in HTTP response only
  -> no trip:offer and no acceptance wait
```

The Socket.IO service is `server/src/services/socket.ts`, not `server/src/socket.ts`.

## 3. Customer Booking Flow

1. `server/src/routes/booking.ts` validates the request and looks up the authenticated `Customer`.
2. `createTrip()` in `server/src/services/trip.ts` calls the maps provider for route distance and inserts a trip with status `REQUESTED`.
3. `apps/customer/src/app/(main)/trip-tracking.tsx` connects the customer socket, registers listeners, and emits `trip:dispatch` (approximately lines 89-107).
4. The server `trip:dispatch` handler in `server/src/services/socket.ts` searches candidates and sequentially emits `trip:offer`.
5. The customer receives `trip:accepted`, updates its UI, and starts tracking.

Trip creation itself does not dispatch. The customer app must emit `trip:dispatch` afterward.

## 4. Call-In Booking Flow

`server/src/routes/admin.ts`, approximately lines 548-737:

1. Validates caller phone, vehicle type, addresses, call-in hours, night restrictions, and MOTO delivery fields.
2. Preserves valid finite coordinates or geocodes pickup and destination.
3. Calls `createTrip()` without `customerId`, with `source: "CALL"` and `callerPhone`.
4. `createTrip()` inserts a `REQUESTED` trip.
5. Calls `findDriverWithExpansion()` and returns the nearest eligible driver in the HTTP response.
6. Does not call `getIO()`, emit `trip:dispatch`, or invoke the offer wait/acceptance mechanism.

Therefore the call-in endpoint currently **only identifies a driver; it does not enter the real Driver acceptance flow**.

## 5. Driver Discovery

`findNearbyDrivers()` in `server/src/services/dispatch.ts`:

- Requires exact `vehicleType` equality.
- Requires `isApproved = true`.
- Requires `isOnline = true`.
- Requires `subscriptionStatus = ACTIVE`.
- Requires `subscriptionPeriodEnd > now`.
- During night service, requires `nightMode = true`.
- Loads Redis location first, then Prisma `lastLocation`.
- Rejects malformed, non-finite, missing-timestamp, and older-than-five-minute locations.
- Calculates Haversine distance and filters by radius.
- Excludes drivers with an `ACCEPTED` or `ACTIVE` trip.
- Sorts nearest first.

`findDriverWithExpansion()` checks night vehicle eligibility and searches:

- Day: 2 km, 5 km, 8 km.
- Night: 3 km, 6 km, 10 km.

It returns the nearest matching driver or a failure message. It does **not** emit a socket event and does **not** assign a trip.

## 6. Socket Dispatch

In `server/src/services/socket.ts`:

- Customer starts dispatch with `trip:dispatch`.
- Server sends offers with `io.to("driver:<Driver.id>").emit("trip:offer", payload)`.
- Payload includes trip ID, vehicle/service/delivery fields, pickup/destination, distance, customer details, note, and `timeoutSeconds`.
- Driver sockets authenticate using an access token and join `driver:<Driver.id>`.
- Driver app listens for `trip:offer`.
- Driver responds with `trip:accept` or `trip:decline`.
- Offers are sequential: the next candidate is attempted only after accept, decline, or timeout.
- Day/night timeout comes from `getJobTimeout()` (30/45 seconds).
- Push notification is sent asynchronously when a candidate has a push token.
- Exhaustion emits `trip:dispatch:no_drivers`.

The server has a Redis Socket.IO adapter when `REDIS_URL` is configured, but offer-response state remains separate process-local state.

## 7. Driver Acceptance

Driver app:

1. `apps/driver/src/components/JobOfferModal.tsx` calls the parent accept handler.
2. `apps/driver/src/app/(main)/home.tsx` emits `trip:accept` with the trip ID.
3. Server checks the socket role, pending entry, pending driver ID, and current driver availability.
4. The pending promise resolves `"accept"`.
5. The dispatch loop calls `assignTripToDriver(tripId, candidate.driverId)`.
6. `assignTripToDriver()` in `server/src/services/dispatch.ts` unconditionally updates the trip:
   - writes `driverId`
   - sets status to `ACCEPTED`
   - writes `acceptedAt`
7. The server registers active tracking and emits `trip:accepted` to the initiating customer socket and `trip:confirmed` to the driver room.

There is **no transaction or conditional `WHERE status = REQUESTED` claim** in `assignTripToDriver()`. Two independent dispatch loops can therefore both pass their availability checks and update the same trip. The later update can overwrite the earlier driver.

## 8. Rejection and Timeout

- Driver decline resolves the pending response as `"decline"` and the loop tries the next candidate.
- No response causes `waitForDriverResponse()` to delete the entry after 30 or 45 seconds and resolve `"timeout"`.
- Timeout then advances to the next candidate.
- After all candidates and radius tiers are exhausted, the initiating customer socket receives `trip:dispatch:no_drivers`; the trip remains `REQUESTED`.
- Driver disconnect is not directly handled as a decline. The pending offer remains until timeout unless the driver reconnects and responds through the same trip ID.
- A disconnected driver can still remain `isOnline` in the database until the app explicitly toggles offline or another cleanup mechanism changes it.

## 9. Trip Start / Completion

The driver active-job screen calls `PUT /api/v1/tracking/trip/:id/status`:

- `STARTED` is stored as `ACTIVE` with `startedAt`.
- `COMPLETED` stores `completedAt`, increments driver `totalTrips`, and unregisters active tracking.
- `CANCELLED` is allowed before active and unregisters tracking.

`server/src/routes/tracking.ts` verifies that the authenticated user owns the assigned driver record before processing status updates. The route does not use the lifecycle service; it performs its own status update logic and does not explicitly validate every legal prior-state transition.

Customer status updates are emitted as `trip:status` to the customer room. The customer app maps these events and navigates to feedback on completion.

## 10. Admin Status Monitoring

`GET /api/v1/admin/trips/call-in/:tripId/status` returns trip status, caller data, driver data, and lifecycle timestamps.

`apps/admin/src/pages/CallInPage.tsx` starts polling three seconds after call-in creation, then polls every three seconds for at most ten attempts. It stops polling when status is `COMPLETED` or `CANCELLED`.

Admin monitoring is REST polling only. It does not create or consume the driver socket offer flow.

## 11. Process-Local State

`pendingResponses` is defined in `server/src/services/socket.ts` as:

```ts
const pendingResponses = new Map<
  string,
  { driverId: string; resolve: (response: "accept" | "decline") => void }
>();
```

- Key: `tripId`.
- Value: expected `driverId` and promise resolver.
- Created immediately after `trip:offer` is emitted.
- Removed on accept/decline resolution or timeout.
- Timeout resolves `"timeout"` and advances dispatch.
- Rejection resolves `"decline"` and advances dispatch.
- Server restart loses all entries and leaves any database trip in its prior state.

With two backend instances, a driver may receive an offer through one instance but its response may arrive at another instance. The second instance has no matching map entry, so the response is rejected as expired/unavailable. The Redis Socket.IO adapter does not synchronize this Map.

## 12. Race Conditions / Authorization Risks

### CRITICAL

- **Call-in dispatch is disconnected:** `findDriverWithExpansion()` returns a driver but no offer is sent, so call-in trips cannot be accepted by a driver.
- **No atomic trip claim:** `assignTripToDriver()` unconditionally updates the trip. Competing dispatch flows can assign/overwrite `driverId` and `ACCEPTED`.

### HIGH

- **Process-local pending state:** pending offers are lost on restart and are not shared between backend instances.
- **Duplicate dispatch requests:** the customer retry path can emit `trip:dispatch` again while another dispatch loop is still active. There is no durable dispatch lock.
- **Status route transition gap:** `tracking.ts` authorizes the assigned driver but does not call `TripLifecycleService` or reject all invalid prior-state transitions itself.

### MEDIUM

- **Disconnect does not resolve an offer:** a disconnected driver consumes the full timeout.
- **Online status can become stale:** no observed socket-disconnect cleanup changes `isOnline`.
- **Customer notification is tied to the initiating socket:** the successful acceptance event is emitted to the socket that started dispatch, not a durable customer-room event in the dispatch handler.

### LOW

- **Admin call-in polling is bounded:** ten attempts at three-second intervals can stop before a long sequential dispatch finishes.

## 13. Missing Links

The clearest missing link is between Admin call-in creation and Socket.IO dispatch. The call-in route calls the discovery helper directly, but the actual offer/acceptance flow exists only inside the `trip:dispatch` socket handler. As a result:

- Admin receives a nearest-driver preview.
- Driver receives no `trip:offer`.
- No `pendingResponses` entry is created.
- No driver acceptance can populate `driverId`.
- The trip remains `REQUESTED` unless another dispatch path is triggered independently.

## 14. Recommended Next Fix

Implement one server-side dispatch entry point that can be invoked by both customer bookings and call-in bookings, while preserving the existing sequential offer behavior and customer/admin notification semantics.

This should come first because call-in bookings currently cannot complete the fundamental request-to-driver path. It should also establish a single place to address the atomic trip-claim requirement, rather than adding a second partial dispatch implementation.

## 15. Verification Evidence

Relevant implementation:

- `server/src/routes/booking.ts` — normal trip creation.
- `server/src/routes/admin.ts` — call-in creation and status polling endpoint.
- `server/src/services/trip.ts` — durable trip insertion and route-distance lookup.
- `server/src/services/dispatch.ts` — driver discovery, freshness validation, and unconditional assignment.
- `server/src/services/socket.ts` — socket dispatch, offer delivery, pending responses, and acceptance.
- `server/src/routes/tracking.ts` — driver status updates and customer status notifications.
- `apps/customer/src/app/(main)/trip-tracking.tsx` — customer dispatch trigger and status listeners.
- `apps/driver/src/app/(main)/home.tsx` — driver socket listeners and acceptance.
- `apps/driver/src/components/JobOfferModal.tsx` — offer countdown and accept/decline UI.
- `apps/admin/src/pages/CallInPage.tsx` — call-in submission and three-second polling.

Validation:

- `npm run typecheck --workspace=@allgo/server` — passed.
- `npm run test --workspace=@allgo/server` — passed, 30 tests.
- Repository was clean before this report was created.
- No production source code, schema, environment file, or dependencies were modified.
