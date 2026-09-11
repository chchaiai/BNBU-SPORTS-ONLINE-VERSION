# Stage 17 Exercise Review Operation Inventory

Authoritative source: `docs/backend-contracts/openapi.yaml`. This inventory does not add routes or broaden roles.

| operationId | method | path | policyId | roles | organizationScope | resourceScope | resolver | requestSchema | successSchema | stable domain errors | before Stage 17 | Stage 17 target |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `listExerciseRecordReviews` | GET | `/api/v1/exercise-records/{recordId}/reviews` | `EXERCISE-REVIEW-LIST` | TEACHER | PRINCIPAL_ORGANIZATION | TEACHER_CLASS_SECTION | EXERCISE_RECORD_FROM_PATH | cursor/limit/sort | ReviewListSuccess | `EXERCISE_RECORD_NOT_FOUND`, `VALIDATION_FORMAT_INVALID` | NOT_IMPLEMENTED | IMPLEMENTED_VERIFIED |
| `reviewExerciseRecord` | POST | `/api/v1/exercise-records/{recordId}/reviews` | `EXERCISE-REVIEW-CREATE` | TEACHER | PRINCIPAL_ORGANIZATION | TEACHER_CLASS_SECTION | EXERCISE_RECORD_FROM_PATH | CreateReviewRequest | ReviewSuccess (201) | `CONFLICT_VERSION_MISMATCH`, `REVIEW_ALREADY_COMPLETED`, `REVIEW_CREDIT_OVERRIDE_NOT_APPROVED`, `REVIEW_INVALID_REASON_REQUIRED` | NOT_IMPLEMENTED | IMPLEMENTED_VERIFIED |
| `reopenExerciseRecordReview` | POST | `/api/v1/exercise-records/{recordId}/reviews/reopen` | `EXERCISE-REVIEW-REOPEN` | TEACHER | PRINCIPAL_ORGANIZATION | TEACHER_CLASS_SECTION | EXERCISE_RECORD_FROM_PATH | ReopenReviewRequest | ReviewSuccess (201) | `CONFLICT_VERSION_MISMATCH`, `REVIEW_NOT_FOUND`, `REVIEW_CHANGE_NOT_ALLOWED` | NOT_IMPLEMENTED | IMPLEMENTED_VERIFIED |
| `batchReviewExerciseRecords` | POST | `/api/v1/exercise-reviews/batch` | `EXERCISE-REVIEW-BATCH` | TEACHER | PRINCIPAL_ORGANIZATION | TEACHER_CLASS_SECTION | BATCH_EXERCISE_RECORDS_FROM_BODY | BatchReviewRequest | BatchSuccess | envelope-level idempotency errors; item-level safe domain errors | NOT_IMPLEMENTED | IMPLEMENTED_VERIFIED |

## Frozen boundaries

- There is no claim, lease, release, `CLAIM_REVIEW`, or writable `UNDER_REVIEW` operation.
- Review history is teacher-only and record-scoped. STUDENT and ADMIN cannot call these operations.
- Responsibility is resolved from `ExerciseRecord.classSectionId -> ClassSection.teacherId`; request fields cannot select a teacher or organization.
- Non-null `creditedDurationOverrideSeconds` is field-level fail-closed with `REVIEW_CREDIT_OVERRIDE_NOT_APPROVED`; it is not a new operation-level default deny.
- The four operations become verified only after controller, policy, persistence, five-layer tests, and Docker runtime evidence exist.
