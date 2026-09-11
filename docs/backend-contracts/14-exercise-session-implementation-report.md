# Stage 14 ExerciseSession Core implementation report

Generated: 2026-08-04. Branch: `backend/exercise-session`. Business baseline: `79eba05571689555a0fa086268b096491e0ce6f5`; Stage 13 implementation ancestor: `57569d5428deebd25e25ae8844f55433d53a3fd7`. The final Stage 14 HEAD must be obtained with `git rev-parse HEAD` after the documentation commit; this file does not recursively hardcode the hash of its own commit.

## Delivered contract and persistence

The authoritative OpenAPI remains at 88 operations. Exactly eight ExerciseSession operations are now `IMPLEMENTED_VERIFIED`: `startExerciseSession`, `getActiveExerciseSession`, `getExerciseSession`, `pauseExerciseSession`, `resumeExerciseSession`, `finishExerciseSession`, `cancelExerciseSession`, and `reconcileExerciseSession`. No Session list route, fallback controller, fake empty array, Media, Record, Review, Score, or Export implementation was added.

`0005_exercise_session` is forward-only with SHA-256 `d26ea3da255e6522c893cae9f89d7d1229c4db2f6e43c4d25edfca811cac41f4`. It adds `exercise_sessions`, `exercise_session_segments`, and `exercise_session_events`: 12 foreign keys, 8 explicit unique indexes, 19 CHECK additions (18 on the three new tables plus the forward replacement of the AuditLog action check), 15 explicit indexes, and 3 user triggers. PostgreSQL catalog counts include the three primary-key backing indexes, so the three new tables expose 11 unique indexes and 18 total indexes in the catalog. No future-module tables exist.

The immutable earlier checksums remain:

- 0001: `0573e3d13018e0db103ef4b605eb35278723174507b37379425a489b10e1462d`
- 0002: `bc62c8cc42989da02eb5be92c7c68f64a72b90e6a41b3913c169333d5fbfbc41`
- 0003: `032b2f001638de63495bdb8d9bd3979ab54679eaaa7802d7526c6e5e24aaa5b7`
- 0004: `bcfcde0c5cbb2a6bb0097f57b97f4d1f576dd90a4ff8e290a5c34f7605554b3a`

## Authority, state, and transaction model

States are `IN_PROGRESS`, `PAUSED`, `COMPLETED`, `CANCELLED`, and read-compatible historical `EXPIRED`. Stage 14 creates no automatic expiration worker or client command for `EXPIRED`. Start requires the authenticated student's own ACTIVE Enrollment and an eligible ClassSection time window. A database partial unique index and serializable transaction enforce at most one `IN_PROGRESS`/`PAUSED` session per student.

`startedAt`, state-transition instants, and `completedAt` are server facts. `businessDate` is frozen at start from the Organization timezone and server `startedAt`. `actualDurationSeconds` includes only server-confirmed running segments; paused segments accumulate separately. The authoritative duration is capped at 7200 seconds and materializes `COMPLETED` with `DURATION_LIMIT_REACHED`. Client observations never directly add duration or change business date.

Reconcile accepts only ordered, non-future `STATE_SYNC` observations from the auth session that started the Session. Accepted observations are append-only evidence and do not credit unverified offline time. Duplicate accepted client event IDs replay safely; disorder, forgery, another auth session, or a terminal Session fails closed. ADR-021 heartbeat cadence, offline grace, expiry threshold, and production retention remain unresolved.

All mutations use shared authentication, policy resolution, organization/ownership scope, SystemMode, Idempotency-Key, expectedVersion, PostgreSQL transactions, append-only domain events, AuditLog, Outbox, stable ErrorCode, and role-specific projections. Students control only their own Session. The current OpenAPI grants no Teacher/Admin ExerciseSession operation, so both roles are denied rather than receiving an invented read route.

## Automated verification

Stage 13 was re-run before implementation: 115/115. Final Stage 14 results are Unit 49/49, Integration 26/26, E2E 25/25, Contract 12/12, Security 23/23 = 135/135, with 0 fail, 0 skip, and 0 todo. Format, lint, strict typecheck, contract check, runtime coverage, Prisma validate, migration safety, schema drift, generated-artifact check, build, `npm audit --audit-level=high`, and `git diff --check` passed. Audit reported 0 vulnerabilities. Redocly retained the same six visible non-blocking warnings.

Runtime coverage is 48 `IMPLEMENTED_VERIFIED`, 2 `IMPLEMENTED_DEFAULT_DENY`, 33 `NOT_IMPLEMENTED`, and 5 `BLOCKED_BY_ADR`. `withdrawEnrollment` and `ignoreRosterAlignmentResult` remain the only default-deny operations.

## Docker runtime acceptance

Validation project: `bnbu-session-validation`. Docker Client and Server: 29.6.2; Docker Desktop 4.85.0; Compose v5.3.1; context `desktop-linux`; host Windows 11 amd64 with Linux/amd64 WSL2 engine. The two required no-cache multi-stage builds completed successfully in 139.2 seconds combined.

- Runtime image `bnbu-sports-backend:stage14-runtime`: ID/digest `sha256:50aa2ed27d267f9e273775de8e22141398a40b24475a7c5f1914f3c8f1378885`, 196,140,715 bytes, user `bnbu` / UID 10001, command `node --enable-source-maps dist/main.js`.
- Migrator image `bnbu-sports-backend:stage14-migrator`: ID/digest `sha256:06a90a6a9ddce0e5c42b21f1ef6794f4de5f70170f51213d4d1698742c3d2ca2`, 215,298,835 bytes, user `node`, command `npm run db:migrate:deploy`.

The runtime image contained no `.env`, `.git`, seed source, or validation key; Docker history contained no validation Secret. PostgreSQL 18.4 and MinIO were healthy, MinIO init exited 0, and the bucket was directly verified private. Ports were loopback-only. The App was healthy and non-root. The app database role had no schema CREATE privilege.

On a new empty volume, 0001-0005 all applied successfully; the second migrator run returned `No pending migrations to apply`; drift returned `No difference detected`. The existing Foundation/Teaching/Stage12/Stage13 runtime runner passed 82 assertions after removing only its obsolete expectation that `/exercise-sessions/active` was unimplemented. Stage 14 passed 11 direct HTTP assertions covering all eight operations, idempotent start replay, second-device start conflict, and cap materialization. The 7200 cap was observed, and Session segments/events/AuditLog/Outbox all contained persisted evidence. Five future module probes returned no fake success.

After App restart, health and readiness recovered to 200. During PostgreSQL stop, readiness returned 503; after recovery it returned 200. Counts remained identical: 10 Sessions, 14 segments, 22 events, and 5 applied migrations. Missing runtime configuration caused a fresh container to fail fast with exit 1. CORS allowed the configured origin and omitted allow-origin for an untrusted origin. Secret-value, sensitive-pattern, PII-oriented, and image-history scans found zero leaks.

Teardown removed the validation App, Compose containers, network, PostgreSQL volume, MinIO volume, ignored environment file, and local validation keys. Residual validation containers/networks/volumes: 0/0/0. No other Docker project, image, network, or volume was removed; `docker system prune` was not used.

## Gates and next stage

Session Persistence, State Machine, Server-authoritative Timing, Pause Accounting, 7200 Cap, Ownership, Multi-device Conflict, Conservative Reconcile, and Session Core Gates: **YES**, subject to the final clean-worktree check after local commits. Session Offline Credit: **NO / FAIL CLOSED**. Session Automatic Expiration: **NO**. Session Production Parameters: **NO**.

Enrollment Withdrawal/Rejoin and Roster Ignore remain **NO / DEFAULT DENY**. Roster Official API Sync, Roster Production Retention, Media, Record, Review, Score, Export, and Full Production remain **NO**. ADR-021, ADR-023/029/030/040/060/068, ADR-018/026/044/047/059/062/069, and ADR-070-074 remain unresolved as recorded in `decision-log.md`.

Stage 15 readiness is limited to a prompt for `MediaEvidence Core`, branch `backend/media-evidence`, and forward-only migration `0006_media_evidence`. Stage 15 was not started. Android/Web sources and gitlinks were not changed. No push or Pull Request was created.
