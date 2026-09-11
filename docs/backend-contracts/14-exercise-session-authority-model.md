# Stage 14 server-authoritative ExerciseSession model

This document freezes the deterministic Stage 14 online core under accepted ADR-008, ADR-037, ADR-041, and ADR-063. ADR-021 remains `PROPOSED`; no heartbeat cadence, offline grace interval, automatic expiry threshold, recovery window, or production retention value is introduced.

## Authoritative facts

- `startedAt` is the server clock value accepted by the start transaction.
- `businessDate` is computed once from `Organization.timezone` and server `startedAt`, then remains immutable even across midnight.
- `clientObservedAt` and reconciliation observations are untrusted diagnostics. They never set `startedAt`, `completedAt`, `businessDate`, or duration.
- An `IN_PROGRESS` aggregate has one open `RUNNING` segment. A `PAUSED` aggregate has one open `PAUSED` segment. A terminal aggregate has no open segment.
- Closing a `RUNNING` segment adds only whole, non-negative server-confirmed seconds to `actualDurationSeconds`. Closing a `PAUSED` segment adds only whole, non-negative server-confirmed seconds to `pausedDurationSeconds`.
- Paused time never contributes to actual duration. Both counters are persisted so restart recovery requires no process-local timer.
- `actualDurationSeconds` is capped at 7200. The authoritative cap instant is `currentIntervalStartedAt + remaining seconds`; materialization changes the state to `COMPLETED`, records `DURATION_LIMIT_REACHED`, closes the interval, and emits domain, audit, and outbox facts once.
- Every read and command materializes the running interval before returning. No response can expose actual duration above 7200 merely because no background worker exists.
- The database partial unique index permits at most one `IN_PROGRESS` or `PAUSED` session for a student. Serializable transactions, optimistic `expectedVersion`, and idempotency protect command concurrency.
- A second device cannot start a parallel session. Authentication-session references are stored as scoped foreign keys, while raw device identifiers and tokens are never stored in the session timeline or public projection.

## State and history

Allowed transitions are: absent to `IN_PROGRESS`; `IN_PROGRESS` to `PAUSED`, `COMPLETED`, or `CANCELLED`; and `PAUSED` to `IN_PROGRESS`, `COMPLETED`, or `CANCELLED`. Historical `EXPIRED` values are readable but Stage 14 provides no command or worker that writes `EXPIRED`.

`exercise_session_segments` stores server-confirmed RUNNING/PAUSED intervals and their accepted seconds. A segment may be closed once but cannot be reopened or deleted. `exercise_session_events` is append-only and uniquely versioned per session. It is the domain timeline; `AuditLog` remains separate operational evidence.

## Conservative reconciliation

Reconciliation first materializes and returns the server aggregate. Exact replays of already accepted client event identifiers are safe. Events that are unknown, out of order, bound to another actor/session/authentication session, or that claim an unverified offline interval fail closed with `SESSION_EVENT_OUT_OF_ORDER` or `SESSION_RECONCILIATION_REQUIRED`. Reconciliation cannot add offline seconds, change `businessDate`, bypass the 7200 cap, or restore a terminal state.

## Deterministic test vectors

| server-confirmed timeline | authoritative result |
|---|---|
| start and immediate pause | actual `0`, status `PAUSED` |
| RUNNING 3599 seconds | actual `3599` |
| RUNNING 3600 seconds | actual `3600` |
| RUNNING 7199 seconds | actual `7199` |
| RUNNING 7200 seconds | actual `7200`, `COMPLETED` at the cap instant |
| RUNNING beyond 7200 seconds | actual remains `7200`, never the client-observed value |
| RUNNING 100 seconds, PAUSED 50 seconds, RUNNING 25 seconds | actual `125`, paused `50` |
| start near midnight in `Asia/Shanghai`, finish after midnight | frozen business date from start |
| client clock far ahead or behind | no duration or business-date change |
| unverified offline claim | no added seconds; reconciliation fails closed |
