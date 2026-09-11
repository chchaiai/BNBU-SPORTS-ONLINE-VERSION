-- Stage 15: private MediaEvidence upload, verification, binding and restartable
-- processing history. ExerciseRecord and retention/deletion remain out of scope.

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
      'MEDIA_UPLOAD_INITIATED', 'MEDIA_UPLOAD_CONFIRMED', 'MEDIA_BOUND',
      'MEDIA_PROCESSING_CHANGED', 'MEDIA_DELETED', 'MEDIA_ACCESSED',
      'REVIEW_RESULT_CHANGED', 'SCORE_RULE_CHANGED', 'SCORE_RECALCULATED',
      'SCORE_ADJUSTED', 'SCORE_PUBLISHED', 'SCORE_LOCKED', 'PERMISSION_CHANGED',
      'SYSTEM_MODE_CHANGED', 'DATA_EXPORTED'
    )
  );

CREATE UNIQUE INDEX "exercise_sessions_id_student_organization_key"
  ON "exercise_sessions"("id", "student_id", "organization_id");

CREATE TABLE "media_evidence" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "owner_student_id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "initiated_by_user_id" UUID NOT NULL,
  "business_purpose" VARCHAR(32) NOT NULL,
  "media_type" VARCHAR(16) NOT NULL,
  "capture_source" VARCHAR(32) NOT NULL,
  "declared_mime_type" VARCHAR(127) NOT NULL,
  "verified_mime_type" VARCHAR(127),
  "declared_file_size_bytes" BIGINT NOT NULL,
  "verified_file_size_bytes" BIGINT,
  "declared_content_sha256" CHAR(64),
  "verified_content_sha256" CHAR(64),
  "declared_duration_seconds" INTEGER,
  "verified_duration_seconds" INTEGER,
  "upload_status" VARCHAR(24) NOT NULL,
  "storage_key" VARCHAR(512) NOT NULL,
  "uploaded_at" TIMESTAMPTZ(6),
  "bound_at" TIMESTAMPTZ(6),
  "processing_started_at" TIMESTAMPTZ(6),
  "available_at" TIMESTAMPTZ(6),
  "failed_at" TIMESTAMPTZ(6),
  "failure_code" VARCHAR(64),
  "created_at" TIMESTAMPTZ(6) NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "media_evidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "media_evidence_business_purpose_check" CHECK ("business_purpose" = 'EXERCISE_RECORD'),
  CONSTRAINT "media_evidence_media_type_check" CHECK ("media_type" IN ('IMAGE', 'VIDEO')),
  CONSTRAINT "media_evidence_capture_source_check" CHECK ("capture_source" = 'IN_APP_CAMERA'),
  CONSTRAINT "media_evidence_status_check" CHECK ("upload_status" IN ('PENDING_UPLOAD', 'UPLOADED', 'BOUND', 'PROCESSING', 'AVAILABLE', 'FAILED', 'DELETED')),
  CONSTRAINT "media_evidence_declared_size_check" CHECK ("declared_file_size_bytes" > 0),
  CONSTRAINT "media_evidence_verified_size_check" CHECK ("verified_file_size_bytes" IS NULL OR "verified_file_size_bytes" > 0),
  CONSTRAINT "media_evidence_declared_hash_check" CHECK ("declared_content_sha256" IS NULL OR "declared_content_sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "media_evidence_verified_hash_check" CHECK ("verified_content_sha256" IS NULL OR "verified_content_sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "media_evidence_duration_check" CHECK (
    ("media_type" = 'IMAGE' AND "declared_duration_seconds" IS NULL AND "verified_duration_seconds" IS NULL)
    OR ("media_type" = 'VIDEO' AND "declared_duration_seconds" > 0 AND ("verified_duration_seconds" IS NULL OR "verified_duration_seconds" > 0))
  ),
  CONSTRAINT "media_evidence_version_check" CHECK ("version" >= 1),
  CONSTRAINT "media_evidence_verified_facts_check" CHECK (
    ("upload_status" = 'PENDING_UPLOAD' AND "verified_mime_type" IS NULL AND "verified_file_size_bytes" IS NULL AND "verified_content_sha256" IS NULL AND "verified_duration_seconds" IS NULL)
    OR ("upload_status" <> 'PENDING_UPLOAD')
  ),
  CONSTRAINT "media_evidence_state_shape_check" CHECK (
    ("upload_status" = 'PENDING_UPLOAD' AND "uploaded_at" IS NULL AND "bound_at" IS NULL AND "processing_started_at" IS NULL AND "available_at" IS NULL AND "failed_at" IS NULL AND "failure_code" IS NULL)
    OR ("upload_status" = 'UPLOADED' AND "uploaded_at" IS NOT NULL AND "bound_at" IS NULL AND "processing_started_at" IS NULL AND "available_at" IS NULL AND "failed_at" IS NULL AND "failure_code" IS NULL)
    OR ("upload_status" = 'BOUND' AND "uploaded_at" IS NOT NULL AND "bound_at" IS NOT NULL AND "processing_started_at" IS NULL AND "available_at" IS NULL AND "failed_at" IS NULL AND "failure_code" IS NULL)
    OR ("upload_status" = 'PROCESSING' AND "uploaded_at" IS NOT NULL AND "bound_at" IS NOT NULL AND "processing_started_at" IS NOT NULL AND "available_at" IS NULL AND "failed_at" IS NULL AND "failure_code" IS NULL)
    OR ("upload_status" = 'AVAILABLE' AND "uploaded_at" IS NOT NULL AND "bound_at" IS NOT NULL AND "processing_started_at" IS NOT NULL AND "available_at" IS NOT NULL AND "failed_at" IS NULL AND "failure_code" IS NULL)
    OR ("upload_status" = 'FAILED' AND "available_at" IS NULL AND "failed_at" IS NOT NULL AND "failure_code" IS NOT NULL)
    OR ("upload_status" = 'DELETED')
  ),
  CONSTRAINT "media_evidence_verified_complete_check" CHECK (
    "upload_status" IN ('PENDING_UPLOAD', 'FAILED', 'DELETED')
    OR ("verified_mime_type" IS NOT NULL AND "verified_file_size_bytes" IS NOT NULL AND "verified_content_sha256" IS NOT NULL AND ("media_type" = 'IMAGE' OR "verified_duration_seconds" IS NOT NULL))
  )
);

CREATE TABLE "media_upload_sessions" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "media_id" UUID NOT NULL,
  "status" VARCHAR(16) NOT NULL,
  "capability_expires_at" TIMESTAMPTZ(6) NOT NULL,
  "client_entity_tag" VARCHAR(256),
  "observed_entity_tag" VARCHAR(256),
  "observed_file_size_bytes" BIGINT,
  "confirmed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "media_upload_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "media_upload_sessions_status_check" CHECK ("status" IN ('ACTIVE', 'CONFIRMED', 'EXPIRED', 'FAILED')),
  CONSTRAINT "media_upload_sessions_size_check" CHECK ("observed_file_size_bytes" IS NULL OR "observed_file_size_bytes" > 0),
  CONSTRAINT "media_upload_sessions_version_check" CHECK ("version" >= 1),
  CONSTRAINT "media_upload_sessions_shape_check" CHECK (
    ("status" = 'ACTIVE' AND "confirmed_at" IS NULL AND "client_entity_tag" IS NULL AND "observed_entity_tag" IS NULL AND "observed_file_size_bytes" IS NULL)
    OR ("status" = 'CONFIRMED' AND "confirmed_at" IS NOT NULL AND "client_entity_tag" IS NOT NULL AND "observed_file_size_bytes" IS NOT NULL)
    OR ("status" IN ('EXPIRED', 'FAILED'))
  )
);

CREATE TABLE "media_status_events" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "media_id" UUID NOT NULL,
  "event_version" INTEGER NOT NULL,
  "event_type" VARCHAR(32) NOT NULL,
  "from_status" VARCHAR(24),
  "to_status" VARCHAR(24) NOT NULL,
  "actor_type" VARCHAR(16) NOT NULL,
  "actor_user_id" UUID,
  "request_id" VARCHAR(64) NOT NULL,
  "idempotency_key_reference" CHAR(64),
  "safe_metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "media_status_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "media_status_events_version_check" CHECK ("event_version" >= 1),
  CONSTRAINT "media_status_events_type_check" CHECK ("event_type" IN ('INITIATED', 'CONFIRMED', 'BOUND', 'PROCESSING_STARTED', 'AVAILABLE', 'FAILED', 'DELETED')),
  CONSTRAINT "media_status_events_status_check" CHECK (
    ("from_status" IS NULL OR "from_status" IN ('PENDING_UPLOAD', 'UPLOADED', 'BOUND', 'PROCESSING', 'AVAILABLE', 'FAILED', 'DELETED'))
    AND "to_status" IN ('PENDING_UPLOAD', 'UPLOADED', 'BOUND', 'PROCESSING', 'AVAILABLE', 'FAILED', 'DELETED')
  ),
  CONSTRAINT "media_status_events_actor_check" CHECK (
    ("actor_type" = 'USER' AND "actor_user_id" IS NOT NULL)
    OR ("actor_type" = 'WORKER' AND "actor_user_id" IS NULL)
  )
);

CREATE TABLE "media_processing_attempts" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "media_id" UUID NOT NULL,
  "attempt_number" INTEGER NOT NULL,
  "phase" VARCHAR(16) NOT NULL,
  "worker_id" VARCHAR(128) NOT NULL,
  "scanner_mode" VARCHAR(32) NOT NULL,
  "result_code" VARCHAR(64),
  "safe_metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "media_processing_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "media_processing_attempts_number_check" CHECK ("attempt_number" >= 1),
  CONSTRAINT "media_processing_attempts_phase_check" CHECK ("phase" IN ('STARTED', 'SUCCEEDED', 'FAILED')),
  CONSTRAINT "media_processing_attempts_result_check" CHECK (("phase" = 'STARTED' AND "result_code" IS NULL) OR ("phase" <> 'STARTED' AND "result_code" IS NOT NULL))
);

CREATE UNIQUE INDEX "media_evidence_id_organization_id_key" ON "media_evidence"("id", "organization_id");
CREATE UNIQUE INDEX "media_evidence_storage_key_key" ON "media_evidence"("storage_key");
CREATE INDEX "media_evidence_owner_session_status_idx" ON "media_evidence"("organization_id", "owner_student_id", "session_id", "upload_status", "created_at", "id");
CREATE INDEX "media_evidence_processing_claim_idx" ON "media_evidence"("upload_status", "processing_started_at", "id");
CREATE UNIQUE INDEX "media_upload_sessions_id_organization_id_key" ON "media_upload_sessions"("id", "organization_id");
CREATE UNIQUE INDEX "media_upload_sessions_media_organization_key" ON "media_upload_sessions"("media_id", "organization_id");
CREATE INDEX "media_upload_sessions_status_expiry_idx" ON "media_upload_sessions"("status", "capability_expires_at", "id");
CREATE UNIQUE INDEX "media_status_events_media_version_key" ON "media_status_events"("media_id", "event_version");
CREATE INDEX "media_status_events_media_occurred_idx" ON "media_status_events"("organization_id", "media_id", "occurred_at", "id");
CREATE INDEX "media_status_events_request_id_idx" ON "media_status_events"("request_id");
CREATE UNIQUE INDEX "media_processing_attempts_media_attempt_phase_key" ON "media_processing_attempts"("media_id", "attempt_number", "phase");
CREATE INDEX "media_processing_attempts_media_attempt_idx" ON "media_processing_attempts"("organization_id", "media_id", "attempt_number", "occurred_at", "id");

ALTER TABLE "media_evidence" ADD CONSTRAINT "media_evidence_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "media_evidence" ADD CONSTRAINT "media_evidence_owner_organization_fkey" FOREIGN KEY ("owner_student_id", "organization_id") REFERENCES "student_profiles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "media_evidence" ADD CONSTRAINT "media_evidence_session_owner_organization_fkey" FOREIGN KEY ("session_id", "owner_student_id", "organization_id") REFERENCES "exercise_sessions"("id", "student_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "media_evidence" ADD CONSTRAINT "media_evidence_initiator_organization_fkey" FOREIGN KEY ("initiated_by_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "media_upload_sessions" ADD CONSTRAINT "media_upload_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "media_upload_sessions" ADD CONSTRAINT "media_upload_sessions_media_organization_fkey" FOREIGN KEY ("media_id", "organization_id") REFERENCES "media_evidence"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "media_status_events" ADD CONSTRAINT "media_status_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "media_status_events" ADD CONSTRAINT "media_status_events_media_organization_fkey" FOREIGN KEY ("media_id", "organization_id") REFERENCES "media_evidence"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "media_processing_attempts" ADD CONSTRAINT "media_processing_attempts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "media_processing_attempts" ADD CONSTRAINT "media_processing_attempts_media_organization_fkey" FOREIGN KEY ("media_id", "organization_id") REFERENCES "media_evidence"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "guard_media_evidence_quota"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  active_count INTEGER;
  allowed_count INTEGER;
BEGIN
  IF NEW."upload_status" NOT IN ('PENDING_UPLOAD', 'UPLOADED', 'BOUND', 'PROCESSING', 'AVAILABLE') THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."session_id"::text, 150006));
  allowed_count := CASE NEW."media_type" WHEN 'IMAGE' THEN 6 ELSE 1 END;
  SELECT COUNT(*) INTO active_count
    FROM "media_evidence"
   WHERE "session_id" = NEW."session_id"
     AND "organization_id" = NEW."organization_id"
     AND "media_type" = NEW."media_type"
     AND "upload_status" IN ('PENDING_UPLOAD', 'UPLOADED', 'BOUND', 'PROCESSING', 'AVAILABLE')
     AND "id" <> NEW."id";
  IF active_count >= allowed_count THEN
    RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'media_evidence_active_quota_check', MESSAGE = 'media session active quota exceeded';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "media_evidence_quota_trigger"
BEFORE INSERT OR UPDATE OF "upload_status" ON "media_evidence"
FOR EACH ROW EXECUTE FUNCTION "guard_media_evidence_quota"();

CREATE FUNCTION "guard_media_evidence_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."organization_id" <> NEW."organization_id"
     OR OLD."owner_student_id" <> NEW."owner_student_id"
     OR OLD."session_id" <> NEW."session_id"
     OR OLD."initiated_by_user_id" <> NEW."initiated_by_user_id"
     OR OLD."business_purpose" <> NEW."business_purpose"
     OR OLD."media_type" <> NEW."media_type"
     OR OLD."capture_source" <> NEW."capture_source"
     OR OLD."declared_mime_type" <> NEW."declared_mime_type"
     OR OLD."declared_file_size_bytes" <> NEW."declared_file_size_bytes"
     OR OLD."declared_content_sha256" IS DISTINCT FROM NEW."declared_content_sha256"
     OR OLD."declared_duration_seconds" IS DISTINCT FROM NEW."declared_duration_seconds"
     OR OLD."storage_key" <> NEW."storage_key"
     OR OLD."created_at" <> NEW."created_at" THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'media identity and declared facts are immutable';
  END IF;
  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'media version advance is invalid';
  END IF;
  IF NEW."upload_status" <> OLD."upload_status" AND NOT (
    (OLD."upload_status" = 'PENDING_UPLOAD' AND NEW."upload_status" IN ('UPLOADED', 'FAILED'))
    OR (OLD."upload_status" = 'UPLOADED' AND NEW."upload_status" IN ('BOUND', 'FAILED'))
    OR (OLD."upload_status" = 'BOUND' AND NEW."upload_status" IN ('PROCESSING', 'FAILED'))
    OR (OLD."upload_status" = 'PROCESSING' AND NEW."upload_status" IN ('AVAILABLE', 'FAILED'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'media transition is not allowed';
  END IF;
  IF OLD."verified_content_sha256" IS NOT NULL AND (
    OLD."verified_mime_type" IS DISTINCT FROM NEW."verified_mime_type"
    OR OLD."verified_file_size_bytes" IS DISTINCT FROM NEW."verified_file_size_bytes"
    OR OLD."verified_content_sha256" IS DISTINCT FROM NEW."verified_content_sha256"
    OR OLD."verified_duration_seconds" IS DISTINCT FROM NEW."verified_duration_seconds"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'verified media facts are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "media_evidence_mutation_guard_trigger"
BEFORE UPDATE ON "media_evidence"
FOR EACH ROW EXECUTE FUNCTION "guard_media_evidence_mutation"();

CREATE FUNCTION "guard_media_upload_session_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."organization_id" <> NEW."organization_id" OR OLD."media_id" <> NEW."media_id" OR OLD."created_at" <> NEW."created_at" THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'media upload session identity is immutable';
  END IF;
  IF NEW."version" <> OLD."version" + 1 OR OLD."status" <> 'ACTIVE' OR NEW."status" NOT IN ('CONFIRMED', 'EXPIRED', 'FAILED') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'media upload session transition is not allowed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "media_upload_sessions_mutation_guard_trigger"
BEFORE UPDATE ON "media_upload_sessions"
FOR EACH ROW EXECUTE FUNCTION "guard_media_upload_session_mutation"();

CREATE FUNCTION "prevent_media_history_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'media history is append-only';
END;
$$;

CREATE TRIGGER "media_status_events_append_only_trigger"
BEFORE UPDATE OR DELETE ON "media_status_events"
FOR EACH ROW EXECUTE FUNCTION "prevent_media_history_mutation"();

CREATE TRIGGER "media_processing_attempts_append_only_trigger"
BEFORE UPDATE OR DELETE ON "media_processing_attempts"
FOR EACH ROW EXECUTE FUNCTION "prevent_media_history_mutation"();
