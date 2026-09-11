# Stage 15 MediaEvidence authority and privacy boundary

This document fixes the implementation boundary for the MediaEvidence core. It does not accept any proposed production, privacy, retention, moderation, or ExerciseRecord decision.

## Server-authoritative aggregate

- `initiateMediaUpload` allocates one stable `mediaId`, one upload-session identity, and one opaque storage key. An exact idempotent replay returns the same identities and capability semantics.
- The client may declare media type, MIME type, size, hash, duration, purpose, and capture source. Declared facts never become verified facts merely because the direct upload or confirmation succeeded.
- Confirmation verifies the private object through server credentials and persists observed size and ETag. Hash, decoded media type/MIME, dimensions or duration, safety result, and final availability are produced only by the trusted processing path.
- Public `contentSha256`, size, MIME, and duration facts represent verified values only. Declared and verified facts are persisted separately.
- Stage 15 binds media only to the same owned `ExerciseSession`. It does not create an ExerciseRecord relation. Public `recordId` is therefore `null`.
- State transitions are monotonic: `PENDING_UPLOAD -> UPLOADED -> BOUND -> PROCESSING -> AVAILABLE | FAILED`. `DELETED` remains read compatibility only and is not written by a Stage 15 command.
- Append-only status events and processing attempts are distinct from operational AuditLog. AuditLog and Outbox remain required mutation evidence.

## Quota and state boundary

The V1 purpose is `EXERCISE_RECORD` and capture source is `IN_APP_CAMERA`. Allowed media types are `IMAGE` and `VIDEO`. Per ExerciseSession, active candidates are capped at six images and one video across `PENDING_UPLOAD`, `UPLOADED`, `BOUND`, `PROCESSING`, and `AVAILABLE`; `FAILED` and historical `DELETED` do not consume quota. Creation is permitted only while the owned Session is `IN_PROGRESS`, `PAUSED`, or `COMPLETED`, and is rejected for `CANCELLED` or `EXPIRED`.

## Private storage boundary

- The Media namespace, bucket identity, and least-privilege credentials are isolated from Roster source storage.
- Buckets remain private: no anonymous GET, PUT, LIST, permanent public URL, directory traversal, or raw storage key exposure is permitted.
- Direct upload and download capabilities are short-lived, object-scoped, method-scoped, and issued only after authorization. Their query strings and headers must not enter HTTP logs, AuditLog metadata, Outbox payloads, plain idempotency snapshots, or public projections.
- The App never uses MinIO root credentials. Local MinIO root credentials are initialization-only synthetic secrets.
- Production storage, signing, scanner, and retention settings have no implicit fallback. Missing required production configuration fails fast.

## Processing and privacy boundary

The worker is database-driven, idempotent, restartable, and safe under duplicate delivery. It validates object size and SHA-256 from bytes, uses magic/container structure rather than filename or claimed MIME, safely decodes JPEG/PNG, parses MP4/MOV/3GP or WebM duration and track metadata, rejects mismatches, and fails closed when the configured scanner is unavailable. Exercise videos require at least one video track, one audio track, and trusted duration in `(0, 15]` seconds. Recognized GPS IFD, EXIF location or video-container location metadata is rejected with `MEDIA_LOCATION_METADATA_NOT_ALLOWED` and is never extracted into a business fact. Processing attempts contain bounded diagnostic codes, never object bodies, signed URLs, storage keys, tokens, coordinates, full student numbers, email addresses, or phone numbers.

Stage 15 local validation may use an explicit deterministic test scanner. Production cannot use that fallback. Contract 1.5 accepts the transport MIME set `image/jpeg`, `image/png`, `video/mp4`, `video/quicktime`, `video/3gpp`, and `video/webm`; this is not permission to trust the declaration or transcode unsupported bytes. Scanner vendor, retention/deletion, moderation, and original-download governance remain gated by their existing ADRs. Evidence upload never requires location permission or coordinate collection; the separate GPS API remains default deny.

## Deferred boundaries

Stage 15 does not create or claim completion of ExerciseRecord, teacher review, admin original-media access, score, export, production backup/recovery, object lifecycle deletion, or permanent public delivery. A generic 404 for later APIs is not implementation evidence.
