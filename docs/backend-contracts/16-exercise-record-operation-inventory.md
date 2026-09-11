# Stage 16 ExerciseRecord Operation Inventory

## Authority and scope

This inventory is derived from `docs/backend-contracts/openapi.yaml`, the accepted business rules and ADRs. It freezes the Stage 16 implementation boundary; it does not add API operations or approve Review, Score, Export, client, or production capabilities.

`ExerciseSession` is the server-authoritative timing fact. `ExerciseRecord` is the separate student submission fact. One completed Session may create at most one Record. A DRAFT has no media association and no ReviewRecord. Successful submit freezes the media association and atomically appends ReviewRecord version 1 with `result=PENDING` and `teacherId=null`.

There is no claim-review workflow, `CLAIM_REVIEW`, writable `UNDER_REVIEW`, claimant, lease, release, or reclaim state. Teacher Review decisions remain outside Stage 16.

## OpenAPI operation inventory

| operationId                 | method and path                              | roles and scope                                                        | Stage 16 classification    | implementation boundary                                                                                                                                                                                                                                                      |
| --------------------------- | -------------------------------------------- | ---------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listExerciseRecords`       | `GET /exercise-records`                      | STUDENT self; TEACHER responsible ClassSection; ADMIN own organization | `IMPLEMENTED_VERIFIED`     | Role-scoped stable cursor list; no media original, storage fact, internal review note, or cross-organization result.                                                                                                                                                         |
| `createExerciseRecordDraft` | `POST /exercise-records`                     | STUDENT self through owned Session                                     | `IMPLEMENTED_VERIFIED`     | Only an owned `COMPLETED` Session; server derives organization, student, Enrollment, ClassSection, Semester, teacher, business date and duration facts. `GENERAL` requires a trimmed 1..200 character description; `COURSE_RELATED` may store null.                          |
| `getExerciseRecord`         | `GET /exercise-records/{recordId}`           | STUDENT self; TEACHER responsible ClassSection; ADMIN own organization | `IMPLEMENTED_VERIFIED`     | Role-scoped projection. DRAFT returns `currentReview=null`; submitted records return only the safe current-review projection.                                                                                                                                                |
| `updateExerciseRecordDraft` | `PATCH /exercise-records/{recordId}`         | STUDENT self                                                           | `IMPLEMENTED_VERIFIED`     | Only OpenAPI-whitelisted editable fields on DRAFT with `expectedVersion`; the final credit-type/description pair must satisfy the ADR-103 conditional rule. No identity, time, duration, status, media, or review mass assignment.                                           |
| `submitExerciseRecord`      | `POST /exercise-records/{recordId}/submit`   | STUDENT self                                                           | `IMPLEMENTED_VERIFIED`     | Serializable transaction locks/revalidates Record, Session and media; freezes 1..6 IMAGE and 0..1 VIDEO, reserves the Enrollment/business-date slot, changes DRAFT to SUBMITTED, appends history/Audit/Outbox and creates initial PENDING Review version 1.                  |
| `discardExerciseRecord`     | `POST /exercise-records/{recordId}/discard`  | STUDENT self                                                           | `IMPLEMENTED_VERIFIED`     | Cancels only DRAFT with optimistic versioning; retains the Record and event history and never releases a submitted daily slot.                                                                                                                                               |
| `withdrawExerciseRecord`    | `POST /exercise-records/{recordId}/withdraw` | STUDENT self                                                           | `IMPLEMENTED_DEFAULT_DENY` | Real authenticated, scoped route that validates ownership and version, then always returns `EXERCISE_RECORD_WITHDRAWAL_NOT_ALLOWED` with zero Record event, successful AuditLog, business Outbox, idempotency completion, version, media, review, or daily-slot side effect. |

## Frozen domain boundaries

- Record status is exactly `DRAFT`, `SUBMITTED`, `REVIEWED`, or `CANCELLED`; Stage 16 writes only DRAFT, SUBMITTED and DRAFT-to-CANCELLED.
- `description` is conditionally required: `GENERAL` must contain 1..200 non-whitespace characters; `COURSE_RELATED` may be null. DTO, domain normalization, Prisma nullability and the forward-only database CHECK enforce the same final-state rule.
- Duration is copied from the Session. `0..3599` seconds is not creditable, `3600..7199` credits 3600 seconds, and exactly 7200 credits 7200 seconds. Values above 7200 fail closed as inconsistent.
- A DRAFT does not occupy `(enrollmentId, businessDate)`. The database uniqueness boundary is acquired only by successful submit and is never released by Stage 16.
- Submit requires an ACTIVE Enrollment, consistent active teaching scope, a valid submission deadline, one or more unique AVAILABLE media items owned by the student and bound to the same Session with purpose `EXERCISE_RECORD`.
- Media verified facts are immutable. Stage 16 creates a separate append-only `exercise_record_media` association and may set only the internal parent association protected by database constraints; public projections never expose `storageKey`.
- The initial ReviewRecord is an append-only system fact: review version 1, PENDING, no teacher identity, no reason, reason code, public comment, internal note, credited-duration override, or reviewed timestamp.
- Review decision/reopen/list/batch operations, Score and Export remain unimplemented. Generic 404 responses do not count as default-deny coverage.

## Expected runtime coverage transition

The Stage 15 baseline is 88 operations: 53 verified, 2 implemented default deny, 28 not implemented and 5 blocked by ADR. After all seven Record operations have real Controller, policy, persistence and test evidence, Stage 16 is expected to be 59 verified, 3 implemented default deny, 22 not implemented and 4 blocked by ADR. These numbers must be generated from the unchanged OpenAPI and the evidence manifest; they must not be edited directly into the generated roadmap.
