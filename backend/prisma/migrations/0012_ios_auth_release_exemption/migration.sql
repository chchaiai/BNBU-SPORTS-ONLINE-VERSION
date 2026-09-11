-- Stage 21B: organization-scoped OTP/recovery, numeric iOS build policy,
-- and private exemption-application media. Forward-only; 0001-0011 remain immutable.

ALTER TABLE "account_recovery_challenges"
  DROP CONSTRAINT "account_recovery_challenges_role_check",
  ADD CONSTRAINT "account_recovery_challenges_role_check"
    CHECK ("requested_role" IN ('TEACHER', 'ADMIN'));

ALTER TABLE "app_release_policies"
  ADD COLUMN "minimum_supported_build_number" INTEGER,
  ADD COLUMN "latest_build_number" INTEGER;

ALTER TABLE "app_release_policies"
  ADD CONSTRAINT "app_release_policies_build_number_shape_check" CHECK (
    ("minimum_supported_build_number" IS NULL AND "latest_build_number" IS NULL)
    OR (
      "minimum_supported_build_number" >= 1
      AND "latest_build_number" >= "minimum_supported_build_number"
    )
  ) NOT VALID,
  ADD CONSTRAINT "app_release_policies_ios_build_number_required_check" CHECK (
    "platform" <> 'IOS'
    OR (
      "minimum_supported_build_number" IS NOT NULL
      AND "latest_build_number" IS NOT NULL
    )
  ) NOT VALID;

CREATE UNIQUE INDEX "enrollments_id_student_organization_key"
  ON "enrollments"("id", "student_id", "organization_id");

ALTER TABLE "media_evidence"
  DROP CONSTRAINT "media_evidence_session_owner_organization_fkey",
  ALTER COLUMN "session_id" DROP NOT NULL,
  ADD COLUMN "enrollment_id" UUID;

ALTER TABLE "media_evidence"
  ADD CONSTRAINT "media_evidence_session_owner_organization_fkey"
    FOREIGN KEY ("session_id", "owner_student_id", "organization_id")
    REFERENCES "exercise_sessions"("id", "student_id", "organization_id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "media_evidence_enrollment_owner_organization_fkey"
    FOREIGN KEY ("enrollment_id", "owner_student_id", "organization_id")
    REFERENCES "enrollments"("id", "student_id", "organization_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "media_evidence"
  DROP CONSTRAINT "media_evidence_business_purpose_check",
  DROP CONSTRAINT "media_evidence_capture_source_check",
  ADD CONSTRAINT "media_evidence_business_purpose_check"
    CHECK ("business_purpose" IN ('EXERCISE_RECORD', 'EXEMPTION_APPLICATION')),
  ADD CONSTRAINT "media_evidence_capture_source_check" CHECK (
    ("business_purpose" = 'EXERCISE_RECORD' AND "capture_source" = 'IN_APP_CAMERA')
    OR (
      "business_purpose" = 'EXEMPTION_APPLICATION'
      AND "capture_source" IN ('IN_APP_CAMERA', 'FILE_PICKER')
    )
  ),
  ADD CONSTRAINT "media_evidence_target_shape_check" CHECK (
    (
      "business_purpose" = 'EXERCISE_RECORD'
      AND "session_id" IS NOT NULL
      AND "enrollment_id" IS NULL
    )
    OR (
      "business_purpose" = 'EXEMPTION_APPLICATION'
      AND "session_id" IS NULL
      AND "enrollment_id" IS NOT NULL
    )
  );

CREATE UNIQUE INDEX "media_evidence_exemption_scope_key"
  ON "media_evidence"("id", "enrollment_id", "owner_student_id", "organization_id");

CREATE INDEX "media_evidence_owner_enrollment_status_idx"
  ON "media_evidence"(
    "organization_id",
    "owner_student_id",
    "enrollment_id",
    "upload_status",
    "created_at",
    "id"
  );

CREATE OR REPLACE FUNCTION "guard_media_evidence_quota"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  active_count INTEGER;
  allowed_count INTEGER;
  scope_key TEXT;
BEGIN
  IF NEW."upload_status" NOT IN ('PENDING_UPLOAD', 'UPLOADED', 'BOUND', 'PROCESSING', 'AVAILABLE') THEN
    RETURN NEW;
  END IF;

  scope_key := CASE NEW."business_purpose"
    WHEN 'EXERCISE_RECORD' THEN 'session:' || NEW."session_id"::text
    ELSE 'enrollment:' || NEW."enrollment_id"::text
  END;
  PERFORM pg_advisory_xact_lock(hashtextextended(scope_key, 150006));

  IF NEW."business_purpose" = 'EXERCISE_RECORD' THEN
    allowed_count := CASE NEW."media_type" WHEN 'IMAGE' THEN 6 ELSE 1 END;
    SELECT COUNT(*) INTO active_count
      FROM "media_evidence"
     WHERE "session_id" = NEW."session_id"
       AND "organization_id" = NEW."organization_id"
       AND "business_purpose" = 'EXERCISE_RECORD'
       AND "media_type" = NEW."media_type"
       AND "upload_status" IN ('PENDING_UPLOAD', 'UPLOADED', 'BOUND', 'PROCESSING', 'AVAILABLE')
       AND "id" <> NEW."id";
  ELSE
    allowed_count := 20;
    SELECT COUNT(*) INTO active_count
      FROM "media_evidence"
     WHERE "enrollment_id" = NEW."enrollment_id"
       AND "organization_id" = NEW."organization_id"
       AND "business_purpose" = 'EXEMPTION_APPLICATION'
       AND "upload_status" IN ('PENDING_UPLOAD', 'UPLOADED', 'BOUND', 'PROCESSING', 'AVAILABLE')
       AND "id" <> NEW."id";
  END IF;

  IF active_count >= allowed_count THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'media_evidence_active_quota_check',
      MESSAGE = 'media target active quota exceeded';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "guard_media_evidence_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."organization_id" <> NEW."organization_id"
     OR OLD."owner_student_id" <> NEW."owner_student_id"
     OR OLD."session_id" IS DISTINCT FROM NEW."session_id"
     OR OLD."enrollment_id" IS DISTINCT FROM NEW."enrollment_id"
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

CREATE FUNCTION "guard_exemption_application_media_scope"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  application_row RECORD;
  media_row RECORD;
BEGIN
  SELECT "organization_id", "student_id", "enrollment_id", "status"
    INTO application_row
    FROM "exemption_applications"
   WHERE "id" = NEW."application_id";
  SELECT "organization_id", "owner_student_id", "enrollment_id", "business_purpose", "upload_status"
    INTO media_row
    FROM "media_evidence"
   WHERE "id" = NEW."media_id";

  IF application_row IS NULL OR media_row IS NULL
     OR application_row."organization_id" <> NEW."organization_id"
     OR media_row."organization_id" <> NEW."organization_id"
     OR application_row."student_id" <> media_row."owner_student_id"
     OR application_row."enrollment_id" <> media_row."enrollment_id"
     OR media_row."business_purpose" <> 'EXEMPTION_APPLICATION'
     OR media_row."upload_status" NOT IN ('UPLOADED', 'BOUND', 'PROCESSING', 'AVAILABLE')
     OR application_row."status" NOT IN ('DRAFT', 'SUPPLEMENT_REQUIRED') THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'exemption_application_media_scope_check',
      MESSAGE = 'exemption application media scope is invalid';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "exemption_application_media_scope_guard_trigger"
BEFORE INSERT OR UPDATE ON "exemption_application_media"
FOR EACH ROW EXECUTE FUNCTION "guard_exemption_application_media_scope"();
