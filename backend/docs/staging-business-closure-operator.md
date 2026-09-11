# Staging business closure operator

This runbook covers the one-shot Phase 12 synthetic business closure operator. It is restricted to BNBU Sports staging and the exact public API base `https://api.verityai.cn/api/v1`. It does not authorize production use, real student data, cleanup, deployment, migration, or changes to cloud permissions.

## What the operator proves

The `run` command verifies one isolated synthetic organization through these boundaries:

1. ADMIN password login, authenticated dependency health, idempotent logout.
2. TEACHER password login, refresh rotation, old-refresh-token reuse rejection, and a new operational login.
3. STUDENT email-code request through Tencent SES, hidden operator entry of the code from a controlled mailbox, and code verification.
4. Course invite creation, public preview, join capability, QR join, replay protection, and active enrollment.
5. A real exercise-session API start/replay/stale-version/cancel check, followed by a deterministic 3,600-second synthetic completed-session fixture for the business closure. The fixture is database-derived test data; it is not evidence that a person exercised for one hour.
6. A real short-lived COS presigned PUT, confirm, bind, and media-worker transition to `AVAILABLE` using `TEST_SIGNATURE` scanning.
7. Draft record creation and submission, the initial automatic valid review, a teacher `INVALID` decision, reopen to `PENDING`, final `VALID` decision, stale `expectedVersion` rejection, student projection checks, score publication, student score readback, audit evidence, and idempotency evidence.

The command prints only fixed status labels, counts, and safe failure codes. It never prints mailbox addresses, passwords, tokens, signed URLs, COS keys, `storageKey`, internal database IDs, provider bodies, or secret-file values.

## Preconditions

- Phases 7–11 are already green and the immutable runtime image contains `dist/tools/staging-business-closure-operator.js`.
- The active runtime is `APP_ENV=staging`, uses the exact Guangzhou staging COS bucket through `TENCENT_CVM_ROLE`, Tencent SES in `ap-guangzhou`, and the enabled `TEST_SIGNATURE` media worker.
- The public certificate and `https://api.verityai.cn/api/v1` route are healthy.
- A dedicated controlled mailbox can receive the real SES code. Do not use a real student account or a reserved/example address.
- Nginx access logging has been changed and verified so the three `/api/v1/course-invites/{inviteToken}/...` routes log a fixed `:inviteToken` template, never the live token. The 2026-08-20 staging proof found the synthetic marker zero times across current and rotated access logs, found the fixed template, and reconfirmed live/ready `200`. Re-run that proof after any Nginx log-format change before setting the operator confirmation.
- The operator has an interactive TTY. The code is typed without echo and is never accepted from an environment variable or command-line argument.

## Isolated secret

Provision one UTF-8 JSON file outside Git with exactly these keys:

- `STAGING_BUSINESS_ADMIN_PASSWORD`
- `STAGING_BUSINESS_TEACHER_PASSWORD`
- `STAGING_BUSINESS_STUDENT_EMAIL`

The two passwords must be distinct, 24–128 characters, and not placeholders. The mailbox must be a lower-case controlled real delivery address. The loader rejects unknown/missing keys, malformed UTF-8/JSON, whitespace-normalized values, reserved `.invalid`, `.test`, `.example`, `example.*`, and localhost domains. Before reading any content it also fails closed unless the mounted path is a non-symlink regular file owned by `root:10001` with exact mode `0640`.

Do not place values in shell history, Compose YAML, an environment file, tickets, reports, or this repository. Create or edit the file through an approved root-only interactive secret workflow. On the Compose host it must be owned by `root:10001` with mode `0640`, matching the existing dedicated secret-reader boundary. Point `BNBU_STAGING_BUSINESS_FIXTURE_SECRET_FILE` at its absolute host path; Compose mounts it only into the one-shot business operator as `/run/secrets/bnbu_staging_business_fixture.json`.

The long-running Backend, migrator, and health operator do not receive this secret. The business operator does not receive the migrator or health-fixture secret.

## Preflight and execution

Run from the active immutable release directory. Keep all existing runtime image, runtime secret, CA, and staging environment variables set exactly as used by the healthy Backend. The confirmation value is a non-secret destructive-scope guard; it does not replace the staging checks inside the executable.

```bash
export STAGING_BUSINESS_CONFIRMATION=BNBU_SPORTS_STAGING_BUSINESS_CLOSURE_V1
export STAGING_QR_PATH_LOG_REDACTION_CONFIRMED=BNBU_QR_PATH_LOG_REDACTION_VERIFIED_V1
export BNBU_STAGING_BUSINESS_FIXTURE_SECRET_FILE=/absolute/root-managed/path/staging-business-fixture.json

docker compose --profile operations -f docker-compose.staging.yml run --rm business-operator bootstrap
docker compose --profile operations -f docker-compose.staging.yml run --rm business-operator run
```

`bootstrap` creates or verifies only the isolated fixtures. It never updates, resets, or deletes conflicting rows. `run` pauses after requesting the SES code and displays `Controlled mailbox OTP (input hidden):`; type the code and press Enter. Do not paste it into logs or chat.

The QR path-log confirmation is operational evidence, not a bypass flag. Set it only in the shell used for the one-shot command after a synthetic invite proves that neither the current nor rotated Nginx access logs contain the token value. Backend application HTTP logs already use the generated route template; this separate gate covers the Nginx layer.

Expected final output is a single JSON object with `status: "PASS"`, fixed state labels, `totalValidDurationSeconds: 3600`, audit count, and the remaining manual gates. Any fixed `failureCode` is a failed Gate; do not claim Phase 12 passed and do not retry by changing fixture data manually.

## Idempotency and partial-run behavior

The fixture and completed-session components are create-or-verify and never mutate a conflict. Stable business mutations use stable idempotency keys only where their request body and recovery lifetime are stable. Authentication, OTP, and time-bearing session smoke requests use fresh keys and request IDs. The session smoke first finds any prior operator-owned `IN_PROGRESS` session from its event topology and finishes that cancellation, then always executes a fresh start/replay/stale-version/cancel sequence. Current-run audit evidence is therefore tied to the fresh request IDs and cannot be satisfied by an older successful smoke.

QR interruption recovery never reuses an invite or join-capability key across processes. Every invite has an explicit 15-minute expiry, only five minutes longer than the pinned 10-minute staging join-capability TTL. If execution stops after issuance but before join, the next run rotates to a new invite and capability, because their plaintext tokens cannot be recovered after the bounded replay/TTL window. Only the isolated synthetic class and teacher may own this history; the operator validates the version/replacement topology and allows at most three invite attempts. A conflicting owner/topology or exhausted attempt budget fails closed for operator review instead of creating unbounded credentials. A completed join is recovered through the unique active enrollment and does not create another invite.

A complete successful run is safe to rerun: it verifies existing enrollment, media, record, review history, score, audit, and idempotency evidence while still exercising fresh authentication/session controls. If a run stops after COS upload initiation but before completion, an unexpired `PENDING_UPLOAD` attempt is deliberately treated as a failed Gate rather than exposing or replaying its signed URL. After that capability expires, a rerun lets the Backend mark it failed and creates the next bounded attempt with a distinct deterministic idempotency key. At most three media attempts are allowed; reaching the limit is a failed Gate that requires review.

The flow creates a real private object under the staging `media/` prefix. It does not delete the COS object, database rows, audit records, or idempotency records. Cleanup is destructive and requires a separately reviewed, explicitly authorized plan.

## CORS boundary

This operator uploads from server-side Node and does not require COS browser CORS. The current staging bucket rule is already restricted to the exact `https://www.verityai.cn` origin; methods are `PUT`, `GET`, and `HEAD`; allowed headers are `Content-Type` and `Content-Length`; exposed headers are `ETag` and `Content-Length`; max age is `600`; and `Vary` is enabled. The positive `www` preflight returns `200` with the exact ACAO, while `https://admin.verityai.cn`, the retired HTTP IP origin, and unknown origins return `403` without ACAO. Preserve that baseline unless an actually deployed browser capability changes. Do not add `admin`, wildcard, apex, API, or reserved `.invalid` origins without a separate direct-upload requirement and positive/negative acceptance test.

The planned `www` and `admin` Web routes call same-origin `/api/v1`, so they do not need Backend CORS. If a separately approved browser client calls `https://api.verityai.cn` cross-origin, Backend CORS is runtime configuration: replace `CORS_ALLOWLIST` with a comma-separated list of only those exact deployed HTTPS origins and recreate the Backend container. No Backend source change is required, but the configuration change must still pass preflight and public positive/negative CORS checks.

## Evidence that remains manual

The operator cannot prove:

- Android/iOS camera permission dialogs and real-device QR scanning.
- A real 15-second audible exercise-video capture and device upload behavior.
- Mobile backgrounding, retries, and poor-network UX.
- Production malware/media safety scanning; staging remains `TEST_SIGNATURE`.
- Human teacher/student UI correctness and accessibility.

Record those as separate controlled-device evidence. Never convert their absence into an automated pass.
