-- Stage 14: server-authoritative ExerciseSession aggregate, recoverable intervals,
-- and append-only domain history. ExerciseRecord and Media remain out of scope.

-- Expand the existing audit action CHECK without rewriting any prior migration.
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
      'EXERCISE_SESSION_ENDED', 'EXERCISE_RECORD_SUBMITTED', 'EXERCISE_RECORD_WITHDRAWN',
      'MEDIA_BOUND', 'MEDIA_DELETED', 'MEDIA_ACCESSED', 'REVIEW_RESULT_CHANGED',
      'SCORE_RULE_CHANGED', 'SCORE_RECALCULATED', 'SCORE_ADJUSTED', 'SCORE_PUBLISHED',
      'SCORE_LOCKED', 'PERMISSION_CHANGED', 'SYSTEM_MODE_CHANGED', 'DATA_EXPORTED'
    )
  );

CREATE TABLE "exercise_sessions" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "enrollment_id" UUID NOT NULL,
  "class_section_id" UUID NOT NULL,
  "semester_id" UUID NOT NULL,
  "started_by_auth_session_id" UUID NOT NULL,
  "status" VARCHAR(16) NOT NULL,
  "started_at" TIMESTAMPTZ(6) NOT NULL,
  "business_date" DATE NOT NULL,
  "completed_at" TIMESTAMPTZ(6),
  "cancelled_at" TIMESTAMPTZ(6),
  "expired_at" TIMESTAMPTZ(6),
  "end_reason" VARCHAR(32),
  "actual_duration_seconds" BIGINT NOT NULL DEFAULT 0,
  "paused_duration_seconds" BIGINT NOT NULL DEFAULT 0,
  "current_interval_started_at" TIMESTAMPTZ(6),
  "last_heartbeat_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "exercise_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "exercise_sessions_status_check" CHECK ("status" IN ('IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED', 'EXPIRED')),
  CONSTRAINT "exercise_sessions_end_reason_check" CHECK ("end_reason" IS NULL OR "end_reason" IN ('USER_COMPLETED', 'DURATION_LIMIT_REACHED', 'USER_CANCELLED', 'SESSION_EXPIRED')),
  CONSTRAINT "exercise_sessions_actual_duration_check" CHECK ("actual_duration_seconds" BETWEEN 0 AND 7200),
  CONSTRAINT "exercise_sessions_paused_duration_check" CHECK ("paused_duration_seconds" >= 0),
  CONSTRAINT "exercise_sessions_version_check" CHECK ("version" >= 1),
  CONSTRAINT "exercise_sessions_interval_shape_check" CHECK (
    (("status" IN ('IN_PROGRESS', 'PAUSED')) AND "current_interval_started_at" IS NOT NULL)
    OR (("status" IN ('COMPLETED', 'CANCELLED', 'EXPIRED')) AND "current_interval_started_at" IS NULL)
  ),
  CONSTRAINT "exercise_sessions_terminal_shape_check" CHECK (
    ("status" = 'IN_PROGRESS' AND "completed_at" IS NULL AND "cancelled_at" IS NULL AND "expired_at" IS NULL AND "end_reason" IS NULL)
    OR ("status" = 'PAUSED' AND "completed_at" IS NULL AND "cancelled_at" IS NULL AND "expired_at" IS NULL AND "end_reason" IS NULL)
    OR ("status" = 'COMPLETED' AND "completed_at" IS NOT NULL AND "cancelled_at" IS NULL AND "expired_at" IS NULL AND "end_reason" IN ('USER_COMPLETED', 'DURATION_LIMIT_REACHED'))
    OR ("status" = 'CANCELLED' AND "completed_at" IS NULL AND "cancelled_at" IS NOT NULL AND "expired_at" IS NULL AND "end_reason" = 'USER_CANCELLED')
    OR ("status" = 'EXPIRED' AND "completed_at" IS NULL AND "cancelled_at" IS NULL AND "expired_at" IS NOT NULL AND "end_reason" = 'SESSION_EXPIRED')
  ),
  CONSTRAINT "exercise_sessions_terminal_after_start_check" CHECK (
    ("completed_at" IS NULL OR "completed_at" >= "started_at")
    AND ("cancelled_at" IS NULL OR "cancelled_at" >= "started_at")
    AND ("expired_at" IS NULL OR "expired_at" >= "started_at")
  )
);

CREATE TABLE "exercise_session_segments" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "exercise_session_id" UUID NOT NULL,
  "sequence_number" INTEGER NOT NULL,
  "segment_type" VARCHAR(16) NOT NULL,
  "started_at" TIMESTAMPTZ(6) NOT NULL,
  "ended_at" TIMESTAMPTZ(6),
  "accepted_duration_seconds" BIGINT NOT NULL DEFAULT 0,
  "source" VARCHAR(16) NOT NULL DEFAULT 'SERVER',
  "created_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "exercise_session_segments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "exercise_session_segments_sequence_check" CHECK ("sequence_number" >= 1),
  CONSTRAINT "exercise_session_segments_type_check" CHECK ("segment_type" IN ('RUNNING', 'PAUSED')),
  CONSTRAINT "exercise_session_segments_source_check" CHECK ("source" = 'SERVER'),
  CONSTRAINT "exercise_session_segments_duration_check" CHECK ("accepted_duration_seconds" >= 0),
  CONSTRAINT "exercise_session_segments_time_check" CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at"),
  CONSTRAINT "exercise_session_segments_open_duration_check" CHECK ("ended_at" IS NOT NULL OR "accepted_duration_seconds" = 0)
);

CREATE TABLE "exercise_session_events" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "exercise_session_id" UUID NOT NULL,
  "event_version" INTEGER NOT NULL,
  "event_type" VARCHAR(32) NOT NULL,
  "from_status" VARCHAR(16),
  "to_status" VARCHAR(16) NOT NULL,
  "accepted_at" TIMESTAMPTZ(6) NOT NULL,
  "client_observed_at" TIMESTAMPTZ(6),
  "client_event_id" VARCHAR(128),
  "actor_user_id" UUID NOT NULL,
  "auth_session_id" UUID NOT NULL,
  "request_id" VARCHAR(64) NOT NULL,
  "idempotency_key_reference" CHAR(64),
  "safe_metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "exercise_session_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "exercise_session_events_version_check" CHECK ("event_version" >= 1),
  CONSTRAINT "exercise_session_events_type_check" CHECK ("event_type" IN ('STARTED', 'PAUSED', 'RESUMED', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'RECONCILED', 'RECONCILIATION_REQUIRED')),
  CONSTRAINT "exercise_session_events_from_status_check" CHECK ("from_status" IS NULL OR "from_status" IN ('IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED', 'EXPIRED')),
  CONSTRAINT "exercise_session_events_to_status_check" CHECK ("to_status" IN ('IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED', 'EXPIRED'))
);

CREATE UNIQUE INDEX "exercise_sessions_id_organization_id_key" ON "exercise_sessions"("id", "organization_id");
CREATE UNIQUE INDEX "exercise_sessions_one_active_student_key" ON "exercise_sessions"("organization_id", "student_id") WHERE "status" IN ('IN_PROGRESS', 'PAUSED');
CREATE INDEX "exercise_sessions_student_status_started_idx" ON "exercise_sessions"("organization_id", "student_id", "status", "started_at", "id");
CREATE INDEX "exercise_sessions_enrollment_started_idx" ON "exercise_sessions"("organization_id", "enrollment_id", "started_at", "id");
CREATE INDEX "exercise_sessions_class_business_date_idx" ON "exercise_sessions"("organization_id", "class_section_id", "business_date", "id");
CREATE INDEX "exercise_sessions_status_interval_idx" ON "exercise_sessions"("status", "current_interval_started_at");

CREATE UNIQUE INDEX "exercise_session_segments_id_organization_id_key" ON "exercise_session_segments"("id", "organization_id");
CREATE UNIQUE INDEX "exercise_session_segments_session_sequence_key" ON "exercise_session_segments"("exercise_session_id", "sequence_number");
CREATE UNIQUE INDEX "exercise_session_segments_one_open_key" ON "exercise_session_segments"("exercise_session_id") WHERE "ended_at" IS NULL;
CREATE INDEX "exercise_session_segments_session_started_idx" ON "exercise_session_segments"("organization_id", "exercise_session_id", "started_at", "id");

CREATE UNIQUE INDEX "exercise_session_events_id_organization_id_key" ON "exercise_session_events"("id", "organization_id");
CREATE UNIQUE INDEX "exercise_session_events_session_version_key" ON "exercise_session_events"("exercise_session_id", "event_version");
CREATE UNIQUE INDEX "exercise_session_events_session_client_event_key" ON "exercise_session_events"("exercise_session_id", "client_event_id") WHERE "client_event_id" IS NOT NULL;
CREATE INDEX "exercise_session_events_session_accepted_idx" ON "exercise_session_events"("organization_id", "exercise_session_id", "accepted_at", "id");
CREATE INDEX "exercise_session_events_request_id_idx" ON "exercise_session_events"("request_id");

ALTER TABLE "exercise_sessions" ADD CONSTRAINT "exercise_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exercise_sessions" ADD CONSTRAINT "exercise_sessions_student_organization_fkey" FOREIGN KEY ("student_id", "organization_id") REFERENCES "student_profiles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exercise_sessions" ADD CONSTRAINT "exercise_sessions_enrollment_scope_fkey" FOREIGN KEY ("enrollment_id", "semester_id", "class_section_id", "student_id", "organization_id") REFERENCES "enrollments"("id", "semester_id", "class_section_id", "student_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exercise_sessions" ADD CONSTRAINT "exercise_sessions_class_section_scope_fkey" FOREIGN KEY ("class_section_id", "semester_id", "organization_id") REFERENCES "class_sections"("id", "semester_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exercise_sessions" ADD CONSTRAINT "exercise_sessions_semester_organization_fkey" FOREIGN KEY ("semester_id", "organization_id") REFERENCES "semesters"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exercise_sessions" ADD CONSTRAINT "exercise_sessions_auth_session_organization_fkey" FOREIGN KEY ("started_by_auth_session_id", "organization_id") REFERENCES "auth_sessions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exercise_session_segments" ADD CONSTRAINT "exercise_session_segments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exercise_session_segments" ADD CONSTRAINT "exercise_session_segments_session_organization_fkey" FOREIGN KEY ("exercise_session_id", "organization_id") REFERENCES "exercise_sessions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exercise_session_events" ADD CONSTRAINT "exercise_session_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exercise_session_events" ADD CONSTRAINT "exercise_session_events_session_organization_fkey" FOREIGN KEY ("exercise_session_id", "organization_id") REFERENCES "exercise_sessions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exercise_session_events" ADD CONSTRAINT "exercise_session_events_actor_organization_fkey" FOREIGN KEY ("actor_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exercise_session_events" ADD CONSTRAINT "exercise_session_events_auth_session_organization_fkey" FOREIGN KEY ("auth_session_id", "organization_id") REFERENCES "auth_sessions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "guard_exercise_session_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.organization_id <> NEW.organization_id
     OR OLD.student_id <> NEW.student_id
     OR OLD.enrollment_id <> NEW.enrollment_id
     OR OLD.class_section_id <> NEW.class_section_id
     OR OLD.semester_id <> NEW.semester_id
     OR OLD.started_by_auth_session_id <> NEW.started_by_auth_session_id
     OR OLD.started_at <> NEW.started_at
     OR OLD.business_date <> NEW.business_date
     OR OLD.created_at <> NEW.created_at THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'exercise session identity facts are immutable';
  END IF;
  IF (NEW.status <> OLD.status AND NEW.version <> OLD.version + 1)
     OR (NEW.status = OLD.status AND NEW.version <= OLD.version) THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'exercise session version advance is invalid';
  END IF;
  IF NEW.actual_duration_seconds < OLD.actual_duration_seconds
     OR NEW.paused_duration_seconds < OLD.paused_duration_seconds THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'exercise session durations are monotonic';
  END IF;
  IF NEW.status = OLD.status AND (
       NEW.actual_duration_seconds <> OLD.actual_duration_seconds
       OR NEW.paused_duration_seconds <> OLD.paused_duration_seconds
       OR NEW.current_interval_started_at IS DISTINCT FROM OLD.current_interval_started_at
       OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
       OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
       OR NEW.expired_at IS DISTINCT FROM OLD.expired_at
       OR NEW.end_reason IS DISTINCT FROM OLD.end_reason
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'same-state reconciliation cannot rewrite session facts';
  END IF;
  IF NEW.status <> OLD.status AND NOT (
    (OLD.status = 'IN_PROGRESS' AND NEW.status IN ('PAUSED', 'COMPLETED', 'CANCELLED'))
    OR (OLD.status = 'PAUSED' AND NEW.status IN ('IN_PROGRESS', 'COMPLETED', 'CANCELLED'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'exercise session transition is not allowed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "exercise_sessions_mutation_guard_trigger"
BEFORE UPDATE ON "exercise_sessions"
FOR EACH ROW EXECUTE FUNCTION "guard_exercise_session_mutation"();

CREATE FUNCTION "guard_exercise_session_segment_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'exercise session segments cannot be deleted';
  END IF;
  IF OLD.ended_at IS NOT NULL
     OR NEW.ended_at IS NULL
     OR OLD.id <> NEW.id
     OR OLD.organization_id <> NEW.organization_id
     OR OLD.exercise_session_id <> NEW.exercise_session_id
     OR OLD.sequence_number <> NEW.sequence_number
     OR OLD.segment_type <> NEW.segment_type
     OR OLD.started_at <> NEW.started_at
     OR OLD.source <> NEW.source
     OR OLD.created_at <> NEW.created_at
     OR NEW.accepted_duration_seconds <> FLOOR(EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at)))::bigint THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'exercise session segment may only be closed once';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "exercise_session_segments_mutation_guard_trigger"
BEFORE UPDATE OR DELETE ON "exercise_session_segments"
FOR EACH ROW EXECUTE FUNCTION "guard_exercise_session_segment_mutation"();

CREATE FUNCTION "prevent_exercise_session_event_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'exercise session events are append-only';
END;
$$;

CREATE TRIGGER "exercise_session_events_append_only_trigger"
BEFORE UPDATE OR DELETE ON "exercise_session_events"
FOR EACH ROW EXECUTE FUNCTION "prevent_exercise_session_event_mutation"();
