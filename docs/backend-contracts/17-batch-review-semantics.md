# Stage 17 Batch Review Semantics

`batchReviewExerciseRecords` is one idempotent transport command containing independently executed review items.

## Envelope behavior

- The request contains 1–100 items and preserves input order in the response.
- `itemKey` is an opaque caller correlation key; it does not grant scope.
- The batch `Idempotency-Key` binds the complete normalized body. Exact replay returns the exact stored response. Reusing the key with a different body fails the whole request.
- Authentication, TEACHER role, principal organization, SystemMode, and request schema are envelope checks.

## Per-item behavior

- Every item independently resolves `recordId`, organization, and responsible teacher scope.
- Every item independently checks Record `expectedVersion` and current Review `expectedReviewVersion`.
- Each successful item commits its own serializable transaction containing the appended ReviewRecord, Record transition, RecordEvent, AuditLog, and Outbox event.
- A failed item rolls back all effects for that item and returns `status=FAILED`, `data=null`, and a safe `ErrorDetail`.
- A successful item remains committed if another item fails. Duplicate records in the same batch naturally cause the later stale item to fail.
- Infrastructure or integrity faults are never converted into a misleading domain success.

## Security and side effects

- Unauthorized, cross-organization, or foreign-teacher records use non-enumerating safe errors.
- Non-null credited duration override fails only that item with `REVIEW_CREDIT_OVERRIDE_NOT_APPROVED`.
- Batch review does not change authoritative durations, media facts/associations, Enrollment, or StudentProfile and does not create or update Score data.
