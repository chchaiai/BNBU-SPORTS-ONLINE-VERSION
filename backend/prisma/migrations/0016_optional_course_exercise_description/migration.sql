ALTER TABLE "exercise_records"
  DROP CONSTRAINT "exercise_records_description_check";

ALTER TABLE "exercise_records"
  ALTER COLUMN "description" DROP NOT NULL;

ALTER TABLE "exercise_records"
  ADD CONSTRAINT "exercise_records_description_by_credit_type_check"
  CHECK (
    (
      "credit_type" = 'GENERAL'
      AND "description" IS NOT NULL
      AND char_length(btrim("description")) BETWEEN 1 AND 200
    )
    OR
    (
      "credit_type" = 'COURSE_RELATED'
      AND (
        "description" IS NULL
        OR char_length(btrim("description")) BETWEEN 1 AND 200
      )
    )
  );
