-- Stage 16: ExerciseRecord draft/submit core, immutable media association,
-- daily submission reservation, record history, and initial PENDING review fact.

ALTER TABLE "audit_logs"
  DROP CONSTRAINT "audit_logs_action_type_check",
  ADD CONSTRAINT "audit_logs_action_type_check" CHECK (
    "action_type" IN (
      'AUTHENTICATION_SUCCEEDED', 'AUTHENTICATION_FAILED', 'AUTH_SESSION_REVOKED',
      'USER_PROFILE_UPDATED', 'USER_STATUS_CHANGED',
      'COURSE_CREATED', 'COURSE_UPDATED', 'COURSE_STATUS_CHANGED',
      'CLASS_SECTION_CREATED', 'CLASS_SECTION_UPDATED', 'CLASS_SECTION_CLOSED',
      'COURSE_INVITE_CHANGED', 'ENROLLMENT_CREATED', 'ENROLLMENT_STATUS_CHANGED',
      'ROSTER_IMPORTED', 'ROSTER_ALIGNED', 'ROSTER_RESOLUTION_CHANGED', 'ROSTER_VERSION_ROLLED_BACK',
      'EXERCISE_SESSION_STARTED', 'EXERCISE_SESSION_PAUSED', 'EXERCISE_SESSION_RESUMED',
      'EXERCISE_SESSION_COMPLETED', 'EXERCISE_SESSION_CANCELLED', 'EXERCISE_SESSION_RECONCILED',
      'EXERCISE_SESSION_ENDED', 'EXERCISE_RECORD_DRAFT_CREATED', 'EXERCISE_RECORD_DRAFT_UPDATED',
      'EXERCISE_RECORD_SUBMITTED', 'EXERCISE_RECORD_DISCARDED', 'EXERCISE_RECORD_WITHDRAWN',
      'MEDIA_UPLOAD_INITIATED', 'MEDIA_UPLOAD_CONFIRMED', 'MEDIA_BOUND',
      'MEDIA_PROCESSING_CHANGED', 'MEDIA_DELETED', 'MEDIA_ACCESSED',
      'REVIEW_RESULT_CHANGED', 'SCORE_RULE_CHANGED', 'SCORE_RECALCULATED',
      'SCORE_ADJUSTED', 'SCORE_PUBLISHED', 'SCORE_LOCKED', 'PERMISSION_CHANGED',
      'SYSTEM_MODE_CHANGED', 'DATA_EXPORTED'
    )
  );

CREATE UNIQUE INDEX "class_sections_record_scope_key"
  ON "class_sections"("id", "course_id", "semester_id", "teacher_id", "organization_id");
CREATE UNIQUE INDEX "exercise_sessions_record_scope_key"
  ON "exercise_sessions"("id", "enrollment_id", "semester_id", "class_section_id", "student_id", "organization_id");
CREATE UNIQUE INDEX "media_evidence_record_scope_key"
  ON "media_evidence"("id", "session_id", "owner_student_id", "organization_id");

CREATE TABLE "exercise_records" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "semester_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "enrollment_id" UUID NOT NULL,
  "class_section_id" UUID NOT NULL,
  "course_id" UUID NOT NULL,
  "teacher_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "business_date" DATE NOT NULL,
  "credit_type" VARCHAR(32) NOT NULL,
  "sport_type" VARCHAR(64) NOT NULL,
  "sport_name" VARCHAR(100),
  "description" VARCHAR(200) NOT NULL,
  "student_remark" VARCHAR(200),
  "actual_duration_seconds" BIGINT NOT NULL,
  "paused_duration_seconds" BIGINT NOT NULL,
  "credited_duration_seconds" BIGINT NOT NULL,
  "status" VARCHAR(32) NOT NULL,
  "submitted_at" TIMESTAMPTZ(6),
  "cancelled_at" TIMESTAMPTZ(6),
  "client_request_id" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "exercise_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "exercise_records_credit_type_check" CHECK ("credit_type" IN ('COURSE_RELATED', 'GENERAL')),
  CONSTRAINT "exercise_records_sport_type_check" CHECK ("sport_type" ~ '^[A-Z][A-Z0-9_]*$'),
  CONSTRAINT "exercise_records_sport_name_check" CHECK (
    ("sport_type" = 'OTHER' AND "sport_name" IS NOT NULL AND btrim("sport_name") <> '')
    OR ("sport_type" <> 'OTHER' AND "sport_name" IS NULL)
  ),
  CONSTRAINT "exercise_records_description_check" CHECK (btrim("description") <> ''),
  CONSTRAINT "exercise_records_student_remark_check" CHECK ("student_remark" IS NULL OR btrim("student_remark") <> ''),
  CONSTRAINT "exercise_records_client_request_id_check" CHECK ("client_request_id" ~ '^[A-Za-z0-9._:-]{1,64}$'),
  CONSTRAINT "exercise_records_duration_range_check" CHECK (
    "actual_duration_seconds" BETWEEN 0 AND 7200
    AND "paused_duration_seconds" BETWEEN 0 AND 7200
    AND "credited_duration_seconds" IN (0, 3600, 7200)
  ),
  CONSTRAINT "exercise_records_duration_credit_check" CHECK (
    ("actual_duration_seconds" BETWEEN 0 AND 3599 AND "credited_duration_seconds" = 0)
    OR ("actual_duration_seconds" BETWEEN 3600 AND 7199 AND "credited_duration_seconds" = 3600)
    OR ("actual_duration_seconds" = 7200 AND "credited_duration_seconds" = 7200)
  ),
  CONSTRAINT "exercise_records_status_check" CHECK ("status" IN ('DRAFT', 'SUBMITTED', 'REVIEWED', 'CANCELLED')),
  CONSTRAINT "exercise_records_state_shape_check" CHECK (
    ("status" = 'DRAFT' AND "submitted_at" IS NULL AND "cancelled_at" IS NULL)
    OR ("status" IN ('SUBMITTED', 'REVIEWED') AND "submitted_at" IS NOT NULL AND "cancelled_at" IS NULL)
    OR ("status" = 'CANCELLED' AND "submitted_at" IS NULL AND "cancelled_at" IS NOT NULL)
  ),
  CONSTRAINT "exercise_records_version_check" CHECK ("version" >= 1)
);

CREATE TABLE "exercise_record_media" (
  "organization_id" UUID NOT NULL,
  "record_id" UUID NOT NULL,
  "media_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "owner_student_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "exercise_record_media_pkey" PRIMARY KEY ("record_id", "media_id"),
  CONSTRAINT "exercise_record_media_position_check" CHECK ("position" BETWEEN 1 AND 7)
);

CREATE TABLE "exercise_record_daily_slots" (
  "organization_id" UUID NOT NULL,
  "enrollment_id" UUID NOT NULL,
  "business_date" DATE NOT NULL,
  "record_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "exercise_record_daily_slots_pkey" PRIMARY KEY ("enrollment_id", "business_date")
);

CREATE TABLE "exercise_record_events" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "record_id" UUID NOT NULL,
  "event_version" INTEGER NOT NULL,
  "event_type" VARCHAR(32) NOT NULL,
  "from_status" VARCHAR(32),
  "to_status" VARCHAR(32) NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "auth_session_id" UUID NOT NULL,
  "request_id" VARCHAR(64) NOT NULL,
  "idempotency_key_reference" CHAR(64),
  "safe_metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "exercise_record_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "exercise_record_events_version_check" CHECK ("event_version" >= 1),
  CONSTRAINT "exercise_record_events_type_check" CHECK ("event_type" IN ('CREATED', 'UPDATED', 'SUBMITTED', 'DISCARDED')),
  CONSTRAINT "exercise_record_events_status_check" CHECK (
    ("from_status" IS NULL OR "from_status" IN ('DRAFT', 'SUBMITTED', 'REVIEWED', 'CANCELLED'))
    AND "to_status" IN ('DRAFT', 'SUBMITTED', 'REVIEWED', 'CANCELLED')
  )
);

CREATE TABLE "review_records" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "record_id" UUID NOT NULL,
  "review_version" INTEGER NOT NULL,
  "previous_review_id" UUID,
  "teacher_id" UUID,
  "result" VARCHAR(16) NOT NULL,
  "reason_code" VARCHAR(64),
  "reason" VARCHAR(500),
  "public_comment" VARCHAR(1000),
  "internal_note" VARCHAR(2000),
  "credited_duration_override_seconds" BIGINT,
  "reviewed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "review_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "review_records_version_check" CHECK ("review_version" >= 1),
  CONSTRAINT "review_records_result_check" CHECK ("result" IN ('PENDING', 'VALID', 'INVALID')),
  CONSTRAINT "review_records_override_check" CHECK (
    "credited_duration_override_seconds" IS NULL
    OR "credited_duration_override_seconds" IN (0, 3600, 7200)
  ),
  CONSTRAINT "review_records_shape_check" CHECK (
    ("result" = 'PENDING' AND "reason_code" IS NULL AND "reason" IS NULL AND "public_comment" IS NULL
      AND "internal_note" IS NULL AND "credited_duration_override_seconds" IS NULL AND "reviewed_at" IS NULL)
    OR ("result" = 'VALID' AND "teacher_id" IS NOT NULL AND "reason_code" IS NULL AND "reviewed_at" IS NOT NULL)
    OR ("result" = 'INVALID' AND "teacher_id" IS NOT NULL AND "reason_code" IS NOT NULL AND "reviewed_at" IS NOT NULL)
  ),
  CONSTRAINT "review_records_initial_pending_check" CHECK (
    "review_version" <> 1
    OR ("result" = 'PENDING' AND "previous_review_id" IS NULL AND "teacher_id" IS NULL)
  ),
  CONSTRAINT "review_records_followup_check" CHECK (
    "review_version" = 1 OR "previous_review_id" IS NOT NULL
  )
);

CREATE UNIQUE INDEX "exercise_records_id_organization_id_key" ON "exercise_records"("id", "organization_id");
CREATE UNIQUE INDEX "exercise_records_session_id_key" ON "exercise_records"("session_id");
CREATE UNIQUE INDEX "exercise_records_media_scope_key" ON "exercise_records"("id", "session_id", "student_id", "organization_id");
CREATE UNIQUE INDEX "exercise_records_daily_slot_scope_key" ON "exercise_records"("id", "enrollment_id", "organization_id", "business_date");
CREATE UNIQUE INDEX "exercise_records_session_scope_key" ON "exercise_records"("session_id", "enrollment_id", "semester_id", "class_section_id", "student_id", "organization_id");
CREATE INDEX "exercise_records_student_business_date_idx" ON "exercise_records"("organization_id", "student_id", "business_date", "id");
CREATE INDEX "exercise_records_class_business_date_idx" ON "exercise_records"("organization_id", "class_section_id", "business_date", "id");
CREATE INDEX "exercise_records_status_submitted_idx" ON "exercise_records"("organization_id", "status", "submitted_at", "id");

CREATE UNIQUE INDEX "exercise_record_media_media_id_key" ON "exercise_record_media"("media_id");
CREATE UNIQUE INDEX "exercise_record_media_media_scope_key" ON "exercise_record_media"("media_id", "session_id", "owner_student_id", "organization_id");
CREATE UNIQUE INDEX "exercise_record_media_record_position_key" ON "exercise_record_media"("record_id", "position");
CREATE INDEX "exercise_record_media_record_position_idx" ON "exercise_record_media"("organization_id", "record_id", "position");

CREATE UNIQUE INDEX "exercise_record_daily_slots_record_id_key" ON "exercise_record_daily_slots"("record_id");
CREATE UNIQUE INDEX "exercise_record_daily_slots_record_scope_key" ON "exercise_record_daily_slots"("record_id", "enrollment_id", "organization_id", "business_date");
CREATE INDEX "exercise_record_daily_slots_organization_date_idx" ON "exercise_record_daily_slots"("organization_id", "business_date", "record_id");

CREATE UNIQUE INDEX "exercise_record_events_id_organization_id_key" ON "exercise_record_events"("id", "organization_id");
CREATE UNIQUE INDEX "exercise_record_events_record_version_key" ON "exercise_record_events"("record_id", "event_version");
CREATE INDEX "exercise_record_events_record_occurred_idx" ON "exercise_record_events"("organization_id", "record_id", "occurred_at", "id");
CREATE INDEX "exercise_record_events_request_id_idx" ON "exercise_record_events"("request_id");

CREATE UNIQUE INDEX "review_records_id_organization_id_key" ON "review_records"("id", "organization_id");
CREATE UNIQUE INDEX "review_records_id_record_organization_key" ON "review_records"("id", "record_id", "organization_id");
CREATE UNIQUE INDEX "review_records_record_version_key" ON "review_records"("record_id", "review_version");
CREATE INDEX "review_records_record_version_idx" ON "review_records"("organization_id", "record_id", "review_version");

ALTER TABLE "exercise_records" ADD CONSTRAINT "exercise_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exercise_records" ADD CONSTRAINT "exercise_records_semester_organization_fkey" FOREIGN KEY ("semester_id", "organization_id") REFERENCES "semesters"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exercise_records" ADD CONSTRAINT "exercise_records_student_organization_fkey" FOREIGN KEY ("student_id", "organization_id") REFERENCES "student_profiles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exercise_records" ADD CONSTRAINT "exercise_records_enrollment_scope_fkey" FOREIGN KEY ("enrollment_id", "semester_id", "class_section_id", "student_id", "organization_id") REFERENCES "enrollments"("id", "semester_id", "class_section_id", "student_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exercise_records" ADD CONSTRAINT "exercise_records_class_section_scope_fkey" FOREIGN KEY ("class_section_id", "course_id", "semester_id", "teacher_id", "organization_id") REFERENCES "class_sections"("id", "course_id", "semester_id", "teacher_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exercise_records" ADD CONSTRAINT "exercise_records_course_organization_fkey" FOREIGN KEY ("course_id", "organization_id") REFERENCES "courses"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exercise_records" ADD CONSTRAINT "exercise_records_teacher_organization_fkey" FOREIGN KEY ("teacher_id", "organization_id") REFERENCES "teacher_profiles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exercise_records" ADD CONSTRAINT "exercise_records_session_scope_fkey" FOREIGN KEY ("session_id", "enrollment_id", "semester_id", "class_section_id", "student_id", "organization_id") REFERENCES "exercise_sessions"("id", "enrollment_id", "semester_id", "class_section_id", "student_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exercise_record_media" ADD CONSTRAINT "exercise_record_media_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exercise_record_media" ADD CONSTRAINT "exercise_record_media_record_scope_fkey" FOREIGN KEY ("record_id", "session_id", "owner_student_id", "organization_id") REFERENCES "exercise_records"("id", "session_id", "student_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exercise_record_media" ADD CONSTRAINT "exercise_record_media_media_scope_fkey" FOREIGN KEY ("media_id", "session_id", "owner_student_id", "organization_id") REFERENCES "media_evidence"("id", "session_id", "owner_student_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exercise_record_daily_slots" ADD CONSTRAINT "exercise_record_daily_slots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exercise_record_daily_slots" ADD CONSTRAINT "exercise_record_daily_slots_enrollment_organization_fkey" FOREIGN KEY ("enrollment_id", "organization_id") REFERENCES "enrollments"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exercise_record_daily_slots" ADD CONSTRAINT "exercise_record_daily_slots_record_scope_fkey" FOREIGN KEY ("record_id", "enrollment_id", "organization_id", "business_date") REFERENCES "exercise_records"("id", "enrollment_id", "organization_id", "business_date") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exercise_record_events" ADD CONSTRAINT "exercise_record_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exercise_record_events" ADD CONSTRAINT "exercise_record_events_record_organization_fkey" FOREIGN KEY ("record_id", "organization_id") REFERENCES "exercise_records"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exercise_record_events" ADD CONSTRAINT "exercise_record_events_actor_organization_fkey" FOREIGN KEY ("actor_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exercise_record_events" ADD CONSTRAINT "exercise_record_events_auth_session_organization_fkey" FOREIGN KEY ("auth_session_id", "organization_id") REFERENCES "auth_sessions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "review_records" ADD CONSTRAINT "review_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "review_records" ADD CONSTRAINT "review_records_record_organization_fkey" FOREIGN KEY ("record_id", "organization_id") REFERENCES "exercise_records"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "review_records" ADD CONSTRAINT "review_records_teacher_organization_fkey" FOREIGN KEY ("teacher_id", "organization_id") REFERENCES "teacher_profiles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "review_records" ADD CONSTRAINT "review_records_previous_scope_fkey" FOREIGN KEY ("previous_review_id", "record_id", "organization_id") REFERENCES "review_records"("id", "record_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "guard_exercise_record_mutation"() RETURNS trigger
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
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'exercise record transition is not allowed';
  END IF;
  IF NOT (OLD."status" = 'DRAFT' AND NEW."status" = 'DRAFT') AND (
    OLD."credit_type" <> NEW."credit_type"
    OR OLD."sport_type" <> NEW."sport_type"
    OR OLD."sport_name" IS DISTINCT FROM NEW."sport_name"
    OR OLD."description" <> NEW."description"
    OR OLD."student_remark" IS DISTINCT FROM NEW."student_remark"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'submitted exercise record content is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "exercise_records_mutation_guard_trigger"
BEFORE UPDATE ON "exercise_records"
FOR EACH ROW EXECUTE FUNCTION "guard_exercise_record_mutation"();

CREATE FUNCTION "guard_exercise_record_media_insert"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  evidence_type VARCHAR(16);
  evidence_status VARCHAR(24);
  evidence_purpose VARCHAR(32);
  type_count INTEGER;
BEGIN
  PERFORM 1 FROM "exercise_records" WHERE "id" = NEW."record_id" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'exercise record does not exist';
  END IF;
  SELECT "media_type", "upload_status", "business_purpose"
    INTO evidence_type, evidence_status, evidence_purpose
    FROM "media_evidence"
   WHERE "id" = NEW."media_id"
     AND "session_id" = NEW."session_id"
     AND "owner_student_id" = NEW."owner_student_id"
     AND "organization_id" = NEW."organization_id"
   FOR UPDATE;
  IF NOT FOUND OR evidence_status <> 'AVAILABLE' OR evidence_purpose <> 'EXERCISE_RECORD' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'exercise_record_media_available_check', MESSAGE = 'record media must be available';
  END IF;
  SELECT COUNT(*) INTO type_count
    FROM "exercise_record_media" association
    JOIN "media_evidence" evidence ON evidence."id" = association."media_id"
   WHERE association."record_id" = NEW."record_id" AND evidence."media_type" = evidence_type;
  IF (evidence_type = 'IMAGE' AND type_count >= 6) OR (evidence_type = 'VIDEO' AND type_count >= 1) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'exercise_record_media_type_quota_check', MESSAGE = 'record media type quota exceeded';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "exercise_record_media_insert_guard_trigger"
BEFORE INSERT ON "exercise_record_media"
FOR EACH ROW EXECUTE FUNCTION "guard_exercise_record_media_insert"();

CREATE FUNCTION "prevent_exercise_record_history_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'exercise record history is append-only';
END;
$$;

CREATE TRIGGER "exercise_records_no_delete_trigger"
BEFORE DELETE ON "exercise_records"
FOR EACH ROW EXECUTE FUNCTION "prevent_exercise_record_history_mutation"();
CREATE TRIGGER "exercise_record_media_append_only_trigger"
BEFORE UPDATE OR DELETE ON "exercise_record_media"
FOR EACH ROW EXECUTE FUNCTION "prevent_exercise_record_history_mutation"();
CREATE TRIGGER "exercise_record_daily_slots_append_only_trigger"
BEFORE UPDATE OR DELETE ON "exercise_record_daily_slots"
FOR EACH ROW EXECUTE FUNCTION "prevent_exercise_record_history_mutation"();
CREATE TRIGGER "exercise_record_events_append_only_trigger"
BEFORE UPDATE OR DELETE ON "exercise_record_events"
FOR EACH ROW EXECUTE FUNCTION "prevent_exercise_record_history_mutation"();
CREATE TRIGGER "review_records_append_only_trigger"
BEFORE UPDATE OR DELETE ON "review_records"
FOR EACH ROW EXECUTE FUNCTION "prevent_exercise_record_history_mutation"();
