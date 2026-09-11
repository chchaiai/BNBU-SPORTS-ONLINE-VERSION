-- Stage 17: append-only review decisions, reopen transitions, and strict review chains.
-- This migration adds no business tables and preserves every existing ReviewRecord.

ALTER TABLE "review_records"
  DROP CONSTRAINT "review_records_shape_check",
  ADD CONSTRAINT "review_records_shape_check" CHECK (
    (
      "result" = 'PENDING'
      AND "teacher_id" IS NULL
      AND "reason_code" IS NULL
      AND "public_comment" IS NULL
      AND "internal_note" IS NULL
      AND "credited_duration_override_seconds" IS NULL
      AND "reviewed_at" IS NULL
      AND (
        ("review_version" = 1 AND "reason" IS NULL)
        OR ("review_version" > 1 AND "reason" IS NOT NULL AND BTRIM("reason") <> '')
      )
    )
    OR (
      "result" = 'VALID'
      AND "teacher_id" IS NOT NULL
      AND "reason_code" IS NULL
      AND "credited_duration_override_seconds" IS NULL
      AND "reviewed_at" IS NOT NULL
    )
    OR (
      "result" = 'INVALID'
      AND "teacher_id" IS NOT NULL
      AND "reason_code" IS NOT NULL
      AND "reason_code" IN (
        'INSUFFICIENT_EVIDENCE', 'INVALID_MEDIA', 'DURATION_INCONSISTENT',
        'IDENTITY_MISMATCH', 'DUPLICATE_SUBMISSION', 'OUTSIDE_ALLOWED_SCOPE', 'OTHER'
      )
      AND ("reason_code" <> 'OTHER' OR ("reason" IS NOT NULL AND BTRIM("reason") <> ''))
      AND "credited_duration_override_seconds" IS NULL
      AND "reviewed_at" IS NOT NULL
    )
  );

ALTER TABLE "exercise_record_events"
  DROP CONSTRAINT "exercise_record_events_type_check",
  ADD CONSTRAINT "exercise_record_events_type_check" CHECK (
    "event_type" IN ('CREATED', 'UPDATED', 'SUBMITTED', 'DISCARDED', 'REVIEWED', 'REOPENED')
  );

CREATE OR REPLACE FUNCTION "guard_exercise_record_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."organization_id" <> NEW."organization_id"
     OR OLD."semester_id" <> NEW."semester_id"
     OR OLD."student_id" <> NEW."student_id"
     OR OLD."enrollment_id" <> NEW."enrollment_id"
     OR OLD."class_section_id" <> NEW."class_section_id"
     OR OLD."course_id" <> NEW."course_id"
     OR OLD."teacher_id" <> NEW."teacher_id"
     OR OLD."session_id" <> NEW."session_id"
     OR OLD."business_date" <> NEW."business_date"
     OR OLD."actual_duration_seconds" <> NEW."actual_duration_seconds"
     OR OLD."paused_duration_seconds" <> NEW."paused_duration_seconds"
     OR OLD."credited_duration_seconds" <> NEW."credited_duration_seconds"
     OR OLD."client_request_id" <> NEW."client_request_id"
     OR OLD."created_at" <> NEW."created_at" THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'exercise record authoritative facts are immutable';
  END IF;
  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'exercise record version advance is invalid';
  END IF;
  IF OLD."status" = 'DRAFT' AND NEW."status" = 'DRAFT' THEN
    RETURN NEW;
  END IF;
  IF NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" IN ('SUBMITTED', 'CANCELLED'))
    OR (OLD."status" = 'SUBMITTED' AND NEW."status" = 'REVIEWED')
    OR (OLD."status" = 'REVIEWED' AND NEW."status" = 'SUBMITTED')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'exercise record transition is not allowed';
  END IF;
  IF OLD."credit_type" <> NEW."credit_type"
     OR OLD."sport_type" <> NEW."sport_type"
     OR OLD."sport_name" IS DISTINCT FROM NEW."sport_name"
     OR OLD."description" <> NEW."description"
     OR OLD."student_remark" IS DISTINCT FROM NEW."student_remark" THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'submitted exercise record content is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION "guard_review_record_insert"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  previous_version INTEGER;
BEGIN
  IF NEW."review_version" = 1 THEN
    IF NEW."previous_review_id" IS NOT NULL OR NEW."result" <> 'PENDING' THEN
      RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'review_records_initial_pending_check', MESSAGE = 'initial review must be pending';
    END IF;
    RETURN NEW;
  END IF;

  SELECT "review_version"
    INTO previous_version
    FROM "review_records"
   WHERE "id" = NEW."previous_review_id"
     AND "record_id" = NEW."record_id"
     AND "organization_id" = NEW."organization_id"
   FOR KEY SHARE;
  IF NOT FOUND OR previous_version <> NEW."review_version" - 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'review_records_previous_version_check', MESSAGE = 'previous review must be the immediately preceding version';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "review_records_insert_guard_trigger"
BEFORE INSERT ON "review_records"
FOR EACH ROW EXECUTE FUNCTION "guard_review_record_insert"();
