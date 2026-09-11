-- 0018 updated the row shape and insert guard. This forward-only follow-up
-- also replaces the original table CHECK that named PENDING as the sole v1 result.

ALTER TABLE "review_records"
  DROP CONSTRAINT "review_records_initial_pending_check",
  ADD CONSTRAINT "review_records_initial_result_check" CHECK (
    "review_version" <> 1
    OR (
      "result" IN ('PENDING', 'VALID')
      AND "previous_review_id" IS NULL
      AND "teacher_id" IS NULL
    )
  );
