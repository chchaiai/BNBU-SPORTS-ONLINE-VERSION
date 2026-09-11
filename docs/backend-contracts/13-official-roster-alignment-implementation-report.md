# Stage 13: Official Roster Import / Roster Alignment implementation and runtime validation

Date: 2026-08-04
Branch: `backend/official-roster-alignment`
Stage 13 base: `7f1e00000c49a86ab1fa88bd2893bdbd22913851`
Stage 12 ancestor: `b472ffc28b1fb6fbd7557090a15f45c4c0206272`
Final implementation/runtime commit: `57569d5` (verify full hash with Git)

Android and Web gitlinks were unchanged: `e4cd2e5a623261cd19cddbd59d5cda7627bf7e98` and `a602280b4aa46d3e944671d341a7bf12bacb17cb`. No client source was changed.

## Contract and runtime ledger

The authoritative OpenAPI has 88 operations, 220 schemas, 145 error codes and 6 non-blocking Redocly warnings. Runtime coverage is 40 `IMPLEMENTED_VERIFIED`, 2 `IMPLEMENTED_DEFAULT_DENY`, 41 `NOT_IMPLEMENTED`, and 5 `BLOCKED_BY_ADR`.

Stage 13 verified operations are: `listRosterImports`, `getCurrentRosterImport`, `createRosterImport`, `getRosterImport`, `listRosterEntries`, `rollbackRosterImport`, `alignRosterImport`, `listRosterAlignmentResults`, `getRosterAlignmentResult`, `confirmRosterAlignmentResult`, `resolveRosterAlignmentResult`, and `reopenRosterAlignmentResult`.

`ignoreRosterAlignmentResult` is a real default-deny route returning `ROSTER_IGNORE_NOT_ALLOWED`; it creates no resolution event, successful AuditLog, Outbox event, idempotency record, or version change. The other global default-deny is `withdrawEnrollment`. The five ADR-blocked operations remain score operations. No Roster operation is `BLOCKED_BY_ADR`.

## Migration and PostgreSQL evidence

`0004_official_roster_alignment` SHA-256 is `bcfcde0c5cbb2a6bb0097f57b97f4d1f576dd90a4ff8e290a5c34f7605554b3a`. The unchanged 0001-0003 hashes are recorded in `CURRENT-HANDOFF.md` and the migration manifest.

The empty PostgreSQL 18.4 database applied 0001-0004 successfully. A second deploy reported `No pending migrations to apply`; `prisma migrate diff` reported `No difference detected`.

The catalog verified six Stage 13 tables:

- `official_roster_imports`
- `official_roster_entries`
- `roster_alignment_runs`
- `roster_alignment_platform_entries`
- `roster_alignment_results`
- `roster_resolution_events`

Catalog/static migration totals are 27 foreign keys, 24 unique indexes, 60 CHECK constraints, 34 migration-created indexes, and 12 user triggers. The trigger split is documented in `database-baseline.md`; not every trigger is append-only. The App database identity has no `CREATE` privilege on the public schema. Future Session, Media, Record, Review, Score and Export tables were absent.

## Import, private storage, and alignment

Only multipart `FILE`/UTF-8 CSV is accepted. The server generates the object key; MIME, magic bytes, path traversal, filename/control characters, formula-injection prefixes, body/file limits, strict field mapping, duplicate rows and invalid rows are guarded. Unknown-length request streams use the managed S3 multipart uploader with bounded 5 MiB parts and abort-on-failure. `OFFICIAL_API` is explicitly unsupported and does not pretend to be synchronized.

The bucket is private and the App identity is distinct from the MinIO root identity, limited to `roster-sources/*`. Anonymous GET and PUT both returned 403. No public projection, AuditLog, Outbox, or ordinary log contains `storageKey`, signed URL, token, or raw source data.

The import lifecycle is `RECEIVED -> VALIDATING -> VALIDATED` or `FAILED`. `RECEIVED` and its Outbox event are committed before parsing; failures remain recoverable and never become current. Validated versions are immutable, current-pointer changes are atomic, history remains available, and rollback only changes the current pointer. Replays return the exact original projection.

Alignment freezes a server-side platform snapshot and deterministic schema-v1 fingerprint/revision. Only VALID official rows enter alignment; import duplicate rows remain historical but are excluded. Five statuses were persisted by the runtime fixture: `MATCHED`, `MISSING_IN_PLATFORM`, `EXTRA_IN_PLATFORM`, `WRONG_COURSE`, and `IDENTITY_CONFLICT`. `DUPLICATED` is a fail-closed platform-snapshot integrity sentinel covered by deterministic unit tests; normal database uniqueness prevents a valid persisted fixture from containing duplicate platform subjects, so this report does not claim six persisted statuses. Resolution is append-only and follows `PENDING -> CONFIRMED -> RESOLVED -> PENDING` for confirm/resolve/reopen. Evidence is same-organization, same-subject and bound to a different roster version. WRONG_COURSE projections do not disclose cross-class enrollment or student IDs.

The runtime smoke observed synthetic counts of 3 imports, 7 entries, 1 alignment run, 6 results and 3 resolution events. User, StudentProfile and Enrollment counts/versions were unchanged by Roster mutations.

## Docker build and Compose runtime

Compose project: `bnbu-roster-validation`. Host: Windows 11 Home 10.0.26200, 64-bit. Docker context: `desktop-linux`; Docker Client/Server 29.6.2; Compose v5.3.1; Buildx v0.35.0-desktop.2; server architecture linux/amd64.

The final BuildKit commands were:

```text
docker buildx build --no-cache --load --target runtime --file backend/Dockerfile --tag bnbu-sports-backend:stage13-57569d5 .
docker buildx build --no-cache --load --target migrator --file backend/Dockerfile --tag bnbu-sports-backend-migrator:stage13-57569d5 .
```

Runtime build exit was 0 in 72.11 seconds. Image ID/digest is `sha256:932e3345a3ca2d91064733a13a254698884d6a5ec0c7f8cecb5b94943f52c201`, size 196052454 bytes, user `bnbu` (UID 10001), entrypoint `docker-entrypoint.sh`, command `node --enable-source-maps dist/main.js`, and a real live Healthcheck. Migrator build exit was 0 in 59.29 seconds. Its image ID/digest is `sha256:e3aa7d43cdd9cb79737626f1c0e03717e1ba9e9e953bc66edaf8656728ff1662`, size 215291808 bytes, user `node` (UID 1000), command `npm run db:migrate:deploy`.

The final image contains no `.env`, `.git`, source, tests or Prisma directory; runtime UID was 10001. Exact values from all local validation environment files were absent from Docker history. PostgreSQL and MinIO became healthy, MinIO init exited 0, migrator first/repeat/drift exited 0, and App Healthcheck was healthy with restart count 0.

The external smoke runner completed 83 assertions and exercised all 42 implemented/default-deny operations: Foundation 9/9, Teaching Structure 10/10, Stage 12 10/10, and Stage 13 13/13. It covered login/error envelopes, refresh rotation/reuse/logout, import failure and success replay, current/history/rollback, alignment replay, five persisted statuses, confirm/resolve/reopen, teacher/admin/student scope, zero writes for Roster identity/enrollment, and unimplemented Session/Media/Record/Review/Score/Export probes. App restart returned readiness 200. PostgreSQL stop returned readiness 503 and recovery returned 200; login and Roster counts remained valid after recovery.

Production mode with `TOKEN_SIGNING_KEY` missing exited 1 with the required fail-fast configuration error. Sensitive log scan counts were zero for JWT/Bearer, Authorization, Cookie, DATABASE_URL, storageKey/signed URL, synthetic email/student number, and exact local secret values.

## Quality and cleanup

Final quality evidence is Unit 43/43, Integration 22/22, E2E 22/22, Contract 9/9, Security 19/19: 115/115, zero skip/todo, `npm audit --audit-level=high` with 0 vulnerabilities, plus format, lint, strict typecheck, contract, runtime coverage, Prisma validate, migration safety, drift, generated artifact check, build and `git diff --check` passing. Stage 12's submitted 85/85 evidence remains preserved as historical regression context; it is included in the current layer results and is not double-counted.

Teardown completed with `docker compose -p bnbu-roster-validation --env-file .env.stage13.local down -v --remove-orphans`. Validation containers, network and volumes remaining: 0. `backend/.env.stage13.local`, `.env.stage13.app.local`, and `.env.stage13.migrator.local` were deleted. No other Docker project, image, or volume was pruned.

## Gate matrix

After the final clean-worktree check, the following are **YES**: Roster File Import, Version History, Current Version, Rollback, Alignment Algorithm, Platform Snapshot, Resolution, and Roster Core. Roster Ignore remains **NO / DEFAULT DENY** by design. Official API Sync and Roster Production Retention remain **NO**. Enrollment Withdrawal/Rejoin, Session, Media, Record, Review, Score, Export, and Full Production remain **NO**. No production ADR was approved or changed. Stage 14 is only a documented handoff prompt; it was not started.

No push, Pull Request, merge, rebase, client modification, or production deployment was performed.
