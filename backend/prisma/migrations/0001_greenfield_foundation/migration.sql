-- Migration: 0001_greenfield_foundation
-- Authority: docs/backend-contracts plus accepted Greenfield ADRs.
-- Scope: a new empty PostgreSQL 18 database; no legacy schema or data is inferred.
-- Prisma generates the structural baseline. The named checks, partial index, composite
-- tenant constraints, and invariant triggers below are intentionally maintained SQL.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "organization_code" VARCHAR(32) NOT NULL,
    "legal_name" VARCHAR(300) NOT NULL,
    "display_name" VARCHAR(200) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "default_locale" VARCHAR(35) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_policies" (
    "organization_id" UUID NOT NULL,
    "system_mode" VARCHAR(32) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "changed_by" UUID NOT NULL,
    "change_reason" VARCHAR(500) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "system_policies_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "role" VARCHAR(32) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "primary_email" VARCHAR(254),
    "primary_email_normalized" VARCHAR(254),
    "email_verified_at" TIMESTAMPTZ(6),
    "primary_phone" VARCHAR(32),
    "primary_phone_normalized" VARCHAR(32),
    "phone_verified_at" TIMESTAMPTZ(6),
    "password_hash" VARCHAR(255),
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "last_authenticated_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_profiles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "student_number" VARCHAR(32) NOT NULL,
    "full_name" VARCHAR(100) NOT NULL,
    "gender" VARCHAR(32) NOT NULL,
    "grade_year" INTEGER NOT NULL,
    "college_name" VARCHAR(200),
    "major_name" VARCHAR(200),
    "administrative_class_name" VARCHAR(200),
    "status" VARCHAR(32) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_profiles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "employee_number" VARCHAR(32) NOT NULL,
    "full_name" VARCHAR(100) NOT NULL,
    "college_name" VARCHAR(200),
    "department_name" VARCHAR(200),
    "title" VARCHAR(100),
    "status" VARCHAR(32) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "teacher_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_profiles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "employee_number" VARCHAR(32) NOT NULL,
    "full_name" VARCHAR(100) NOT NULL,
    "department_name" VARCHAR(200),
    "status" VARCHAR(32) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "admin_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_id_hash" CHAR(64),
    "status" VARCHAR(32) NOT NULL,
    "token_family_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "absolute_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "idle_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoke_reason_code" VARCHAR(64),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "auth_session_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "parent_token_id" UUID,
    "replaced_by_token_id" UUID,
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "reuse_detected_at" TIMESTAMPTZ(6),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semesters" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "academic_year" VARCHAR(9) NOT NULL,
    "term_code" VARCHAR(32) NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "created_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "semesters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "principal_id" UUID,
    "auth_session_id" UUID,
    "operation_id" VARCHAR(128) NOT NULL,
    "scope_hash" CHAR(64) NOT NULL,
    "key_hash" CHAR(64) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "lease_owner" VARCHAR(128),
    "lease_expires_at" TIMESTAMPTZ(6),
    "response_status" INTEGER,
    "response_body_encrypted_or_reference" TEXT,
    "resource_type" VARCHAR(64),
    "resource_id" UUID,
    "request_id" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "actor_role_snapshot" VARCHAR(32),
    "permission_id" VARCHAR(128) NOT NULL,
    "action_type" VARCHAR(64) NOT NULL,
    "target_type" VARCHAR(64) NOT NULL,
    "target_id" UUID,
    "request_id" VARCHAR(64) NOT NULL,
    "idempotency_key_reference" CHAR(64),
    "outcome" VARCHAR(32) NOT NULL,
    "reason_code" VARCHAR(64),
    "safe_metadata" JSONB NOT NULL,
    "source_ip_hash" CHAR(64),
    "device_fingerprint_hash" CHAR(64),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "aggregate_type" VARCHAR(64) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "event_type" VARCHAR(128) NOT NULL,
    "event_version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "available_at" TIMESTAMPTZ(6) NOT NULL,
    "locked_at" TIMESTAMPTZ(6),
    "locked_by" VARCHAR(128),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error_code" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_organization_code_key" ON "organizations"("organization_code");

-- CreateIndex
CREATE INDEX "system_policies_changed_by_idx" ON "system_policies"("changed_by");

-- CreateIndex
CREATE INDEX "users_organization_role_status_idx" ON "users"("organization_id", "role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "users_id_organization_id_key" ON "users"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_organization_email_normalized_key" ON "users"("organization_id", "primary_email_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "users_organization_phone_normalized_key" ON "users"("organization_id", "primary_phone_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_user_id_key" ON "student_profiles"("user_id");

-- CreateIndex
CREATE INDEX "student_profiles_organization_full_name_idx" ON "student_profiles"("organization_id", "full_name");

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_organization_student_number_key" ON "student_profiles"("organization_id", "student_number");

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_user_id_organization_id_key" ON "student_profiles"("user_id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_profiles_user_id_key" ON "teacher_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_profiles_organization_employee_number_key" ON "teacher_profiles"("organization_id", "employee_number");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_profiles_user_id_organization_id_key" ON "teacher_profiles"("user_id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_profiles_user_id_key" ON "admin_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_profiles_organization_employee_number_key" ON "admin_profiles"("organization_id", "employee_number");

-- CreateIndex
CREATE UNIQUE INDEX "admin_profiles_user_id_organization_id_key" ON "admin_profiles"("user_id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_token_family_id_key" ON "auth_sessions"("token_family_id");

-- CreateIndex
CREATE INDEX "auth_sessions_organization_user_status_idx" ON "auth_sessions"("organization_id", "user_id", "status");

-- CreateIndex
CREATE INDEX "auth_sessions_idle_expires_at_idx" ON "auth_sessions"("idle_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_id_organization_id_key" ON "auth_sessions"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_parent_token_id_key" ON "refresh_tokens"("parent_token_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_replaced_by_token_id_key" ON "refresh_tokens"("replaced_by_token_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_session_issued_at_idx" ON "refresh_tokens"("auth_session_id", "issued_at");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_id_organization_id_key" ON "refresh_tokens"("id", "organization_id");

-- CreateIndex
CREATE INDEX "semesters_organization_status_idx" ON "semesters"("organization_id", "status");

-- CreateIndex
CREATE INDEX "semesters_created_by_idx" ON "semesters"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "semesters_organization_academic_year_term_code_key" ON "semesters"("organization_id", "academic_year", "term_code");

-- CreateIndex
CREATE INDEX "idempotency_records_status_lease_expires_at_idx" ON "idempotency_records"("status", "lease_expires_at");

-- CreateIndex
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_scope_hash_key_hash_key" ON "idempotency_records"("scope_hash", "key_hash");

-- CreateIndex
CREATE INDEX "audit_logs_organization_occurred_at_id_idx" ON "audit_logs"("organization_id", "occurred_at", "id");

-- CreateIndex
CREATE INDEX "audit_logs_request_id_idx" ON "audit_logs"("request_id");

-- CreateIndex
CREATE INDEX "audit_logs_target_idx" ON "audit_logs"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "outbox_events_claim_idx" ON "outbox_events"("status", "available_at", "id");

-- CreateIndex
CREATE INDEX "outbox_events_aggregate_idx" ON "outbox_events"("aggregate_type", "aggregate_id", "event_version");

-- AddForeignKey
ALTER TABLE "system_policies" ADD CONSTRAINT "system_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_policies" ADD CONSTRAINT "system_policies_changed_by_organization_id_fkey" FOREIGN KEY ("changed_by", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_user_id_organization_id_fkey" FOREIGN KEY ("user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_user_id_organization_id_fkey" FOREIGN KEY ("user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_profiles" ADD CONSTRAINT "admin_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_profiles" ADD CONSTRAINT "admin_profiles_user_id_organization_id_fkey" FOREIGN KEY ("user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_organization_id_fkey" FOREIGN KEY ("user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_auth_session_id_organization_id_fkey" FOREIGN KEY ("auth_session_id", "organization_id") REFERENCES "auth_sessions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semesters" ADD CONSTRAINT "semesters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semesters" ADD CONSTRAINT "semesters_created_by_organization_id_fkey" FOREIGN KEY ("created_by", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_principal_id_organization_id_fkey" FOREIGN KEY ("principal_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_auth_session_id_organization_id_fkey" FOREIGN KEY ("auth_session_id", "organization_id") REFERENCES "auth_sessions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_organization_id_fkey" FOREIGN KEY ("actor_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Contract checks
ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_code_format_check"
    CHECK ("organization_code" ~ '^[A-Z0-9_-]{2,32}$'),
  ADD CONSTRAINT "organizations_legal_name_nonblank_check"
    CHECK (btrim("legal_name") <> ''),
  ADD CONSTRAINT "organizations_display_name_nonblank_check"
    CHECK (btrim("display_name") <> ''),
  ADD CONSTRAINT "organizations_timezone_nonblank_check"
    CHECK (btrim("timezone") <> ''),
  ADD CONSTRAINT "organizations_default_locale_format_check"
    CHECK ("default_locale" ~ '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$'),
  ADD CONSTRAINT "organizations_status_check"
    CHECK ("status" IN ('ACTIVE')),
  ADD CONSTRAINT "organizations_version_check"
    CHECK ("version" >= 1),
  ADD CONSTRAINT "organizations_timestamps_check"
    CHECK ("updated_at" >= "created_at");

ALTER TABLE "system_policies"
  ADD CONSTRAINT "system_policies_mode_check"
    CHECK ("system_mode" IN ('NORMAL', 'READ_ONLY', 'MAINTENANCE')),
  ADD CONSTRAINT "system_policies_version_check"
    CHECK ("version" >= 1),
  ADD CONSTRAINT "system_policies_change_reason_check"
    CHECK (btrim("change_reason") <> '');

ALTER TABLE "users"
  ADD CONSTRAINT "users_role_check"
    CHECK ("role" IN ('STUDENT', 'TEACHER', 'ADMIN')),
  ADD CONSTRAINT "users_status_check"
    CHECK ("status" IN ('ACTIVE', 'LOCKED', 'DISABLED')),
  ADD CONSTRAINT "users_email_pair_check"
    CHECK (("primary_email" IS NULL) = ("primary_email_normalized" IS NULL)),
  ADD CONSTRAINT "users_email_normalization_check"
    CHECK (
      "primary_email" IS NULL
      OR (
        btrim("primary_email") <> ''
        AND "primary_email_normalized" = lower(btrim("primary_email"))
      )
    ),
  ADD CONSTRAINT "users_email_verification_check"
    CHECK ("email_verified_at" IS NULL OR "primary_email_normalized" IS NOT NULL),
  ADD CONSTRAINT "users_phone_pair_check"
    CHECK (("primary_phone" IS NULL) = ("primary_phone_normalized" IS NULL)),
  ADD CONSTRAINT "users_phone_normalization_check"
    CHECK (
      "primary_phone" IS NULL
      OR (
        btrim("primary_phone") <> ''
        AND "primary_phone_normalized" ~ '^\+[1-9][0-9]{7,14}$'
      )
    ),
  ADD CONSTRAINT "users_phone_verification_check"
    CHECK ("phone_verified_at" IS NULL OR "primary_phone_normalized" IS NOT NULL),
  ADD CONSTRAINT "users_password_hash_check"
    CHECK ("password_hash" IS NULL OR "password_hash" LIKE '$argon2id$%'),
  ADD CONSTRAINT "users_token_version_check"
    CHECK ("token_version" >= 0),
  ADD CONSTRAINT "users_version_check"
    CHECK ("version" >= 1),
  ADD CONSTRAINT "users_timestamps_check"
    CHECK (
      "updated_at" >= "created_at"
      AND ("last_authenticated_at" IS NULL OR "last_authenticated_at" >= "created_at")
      AND ("deleted_at" IS NULL OR "deleted_at" >= "created_at")
    );

ALTER TABLE "student_profiles"
  ADD CONSTRAINT "student_profiles_student_number_check"
    CHECK (
      btrim("student_number") <> ''
      AND "student_number" = upper(btrim("student_number"))
    ),
  ADD CONSTRAINT "student_profiles_full_name_check"
    CHECK (btrim("full_name") <> ''),
  ADD CONSTRAINT "student_profiles_gender_check"
    CHECK ("gender" IN ('MALE', 'FEMALE', 'OTHER')),
  ADD CONSTRAINT "student_profiles_grade_year_check"
    CHECK ("grade_year" BETWEEN 2000 AND 2027),
  ADD CONSTRAINT "student_profiles_optional_names_check"
    CHECK (
      ("college_name" IS NULL OR btrim("college_name") <> '')
      AND ("major_name" IS NULL OR btrim("major_name") <> '')
      AND ("administrative_class_name" IS NULL OR btrim("administrative_class_name") <> '')
    ),
  ADD CONSTRAINT "student_profiles_status_check"
    CHECK ("status" IN ('ACTIVE')),
  ADD CONSTRAINT "student_profiles_version_check"
    CHECK ("version" >= 1),
  ADD CONSTRAINT "student_profiles_timestamps_check"
    CHECK (
      "updated_at" >= "created_at"
      AND ("deleted_at" IS NULL OR "deleted_at" >= "created_at")
    );

ALTER TABLE "teacher_profiles"
  ADD CONSTRAINT "teacher_profiles_employee_number_check"
    CHECK (btrim("employee_number") <> '' AND "employee_number" = btrim("employee_number")),
  ADD CONSTRAINT "teacher_profiles_full_name_check"
    CHECK (btrim("full_name") <> ''),
  ADD CONSTRAINT "teacher_profiles_optional_names_check"
    CHECK (
      ("college_name" IS NULL OR btrim("college_name") <> '')
      AND ("department_name" IS NULL OR btrim("department_name") <> '')
      AND ("title" IS NULL OR btrim("title") <> '')
    ),
  ADD CONSTRAINT "teacher_profiles_status_check"
    CHECK ("status" IN ('ACTIVE')),
  ADD CONSTRAINT "teacher_profiles_version_check"
    CHECK ("version" >= 1),
  ADD CONSTRAINT "teacher_profiles_timestamps_check"
    CHECK (
      "updated_at" >= "created_at"
      AND ("deleted_at" IS NULL OR "deleted_at" >= "created_at")
    );

ALTER TABLE "admin_profiles"
  ADD CONSTRAINT "admin_profiles_employee_number_check"
    CHECK (btrim("employee_number") <> '' AND "employee_number" = btrim("employee_number")),
  ADD CONSTRAINT "admin_profiles_full_name_check"
    CHECK (btrim("full_name") <> ''),
  ADD CONSTRAINT "admin_profiles_optional_names_check"
    CHECK ("department_name" IS NULL OR btrim("department_name") <> ''),
  ADD CONSTRAINT "admin_profiles_status_check"
    CHECK ("status" IN ('ACTIVE')),
  ADD CONSTRAINT "admin_profiles_version_check"
    CHECK ("version" >= 1),
  ADD CONSTRAINT "admin_profiles_timestamps_check"
    CHECK (
      "updated_at" >= "created_at"
      AND ("deleted_at" IS NULL OR "deleted_at" >= "created_at")
    );

ALTER TABLE "auth_sessions"
  ADD CONSTRAINT "auth_sessions_device_hash_check"
    CHECK ("device_id_hash" IS NULL OR "device_id_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "auth_sessions_status_check"
    CHECK ("status" IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
  ADD CONSTRAINT "auth_sessions_lifetime_check"
    CHECK (
      "last_seen_at" >= "created_at"
      AND "absolute_expires_at" > "created_at"
      AND "idle_expires_at" >= "created_at"
      AND "idle_expires_at" <= "absolute_expires_at"
    ),
  ADD CONSTRAINT "auth_sessions_revocation_check"
    CHECK (
      ("status" = 'REVOKED') = ("revoked_at" IS NOT NULL)
      AND (("revoke_reason_code" IS NULL) = ("revoked_at" IS NULL))
      AND ("revoke_reason_code" IS NULL OR "revoke_reason_code" ~ '^[A-Z][A-Z0-9_]*$')
      AND ("revoked_at" IS NULL OR "revoked_at" >= "created_at")
    ),
  ADD CONSTRAINT "auth_sessions_version_check"
    CHECK ("version" >= 1);

ALTER TABLE "refresh_tokens"
  ADD CONSTRAINT "refresh_tokens_hash_check"
    CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "refresh_tokens_lifetime_check"
    CHECK (
      "expires_at" > "issued_at"
      AND ("consumed_at" IS NULL OR "consumed_at" >= "issued_at")
      AND ("revoked_at" IS NULL OR "revoked_at" >= "issued_at")
      AND ("reuse_detected_at" IS NULL OR "reuse_detected_at" >= "issued_at")
    ),
  ADD CONSTRAINT "refresh_tokens_rotation_check"
    CHECK (
      ("consumed_at" IS NULL) = ("replaced_by_token_id" IS NULL)
      AND ("parent_token_id" IS NULL OR "parent_token_id" <> "id")
      AND ("replaced_by_token_id" IS NULL OR "replaced_by_token_id" <> "id")
    ),
  ADD CONSTRAINT "refresh_tokens_parent_token_id_organization_id_fkey"
    FOREIGN KEY ("parent_token_id", "organization_id")
    REFERENCES "refresh_tokens"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "refresh_tokens_replaced_by_token_id_organization_id_fkey"
    FOREIGN KEY ("replaced_by_token_id", "organization_id")
    REFERENCES "refresh_tokens"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "semesters"
  ADD CONSTRAINT "semesters_academic_year_check"
    CHECK (
      CASE
        WHEN "academic_year" ~ '^[0-9]{4}-[0-9]{4}$'
          THEN substring("academic_year" FROM 1 FOR 4)::integer + 1 = substring("academic_year" FROM 6 FOR 4)::integer
        ELSE false
      END
    ),
  ADD CONSTRAINT "semesters_term_code_check"
    CHECK ("term_code" IN ('FIRST', 'SECOND', 'SUMMER')),
  ADD CONSTRAINT "semesters_display_name_check"
    CHECK (btrim("display_name") <> ''),
  ADD CONSTRAINT "semesters_date_range_check"
    CHECK ("end_date" >= "start_date"),
  ADD CONSTRAINT "semesters_status_check"
    CHECK ("status" IN ('UPCOMING', 'CURRENT', 'ARCHIVED')),
  ADD CONSTRAINT "semesters_version_check"
    CHECK ("version" >= 1),
  ADD CONSTRAINT "semesters_timestamps_check"
    CHECK ("updated_at" >= "created_at");

CREATE UNIQUE INDEX "semesters_one_current_per_organization_idx"
  ON "semesters"("organization_id")
  WHERE "status" = 'CURRENT';

ALTER TABLE "idempotency_records"
  ADD CONSTRAINT "idempotency_records_operation_id_check"
    CHECK (btrim("operation_id") <> ''),
  ADD CONSTRAINT "idempotency_records_hashes_check"
    CHECK (
      "scope_hash" ~ '^[0-9a-f]{64}$'
      AND "key_hash" ~ '^[0-9a-f]{64}$'
      AND "request_hash" ~ '^[0-9a-f]{64}$'
    ),
  ADD CONSTRAINT "idempotency_records_status_check"
    CHECK ("status" IN ('IN_PROGRESS', 'COMPLETED', 'RETRYABLE_FAILURE')),
  ADD CONSTRAINT "idempotency_records_lease_pair_check"
    CHECK (("lease_owner" IS NULL) = ("lease_expires_at" IS NULL)),
  ADD CONSTRAINT "idempotency_records_response_status_check"
    CHECK ("response_status" IS NULL OR "response_status" BETWEEN 100 AND 599),
  ADD CONSTRAINT "idempotency_records_resource_pair_check"
    CHECK (("resource_type" IS NULL) = ("resource_id" IS NULL)),
  ADD CONSTRAINT "idempotency_records_request_id_check"
    CHECK (btrim("request_id") <> ''),
  ADD CONSTRAINT "idempotency_records_lifetime_check"
    CHECK (
      "expires_at" > "created_at"
      AND ("completed_at" IS NULL OR "completed_at" >= "created_at")
    ),
  ADD CONSTRAINT "idempotency_records_state_shape_check"
    CHECK (
      (
        "status" = 'IN_PROGRESS'
        AND "lease_owner" IS NOT NULL
        AND "completed_at" IS NULL
        AND "response_status" IS NULL
        AND "response_body_encrypted_or_reference" IS NULL
      )
      OR (
        "status" IN ('COMPLETED', 'RETRYABLE_FAILURE')
        AND "lease_owner" IS NULL
        AND "completed_at" IS NOT NULL
        AND "response_status" IS NOT NULL
      )
    );

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_actor_snapshot_check"
    CHECK (("actor_user_id" IS NULL) = ("actor_role_snapshot" IS NULL)),
  ADD CONSTRAINT "audit_logs_actor_role_check"
    CHECK ("actor_role_snapshot" IS NULL OR "actor_role_snapshot" IN ('STUDENT', 'TEACHER', 'ADMIN')),
  ADD CONSTRAINT "audit_logs_permission_id_check"
    CHECK ("permission_id" ~ '^[A-Z][A-Z0-9-]*$'),
  ADD CONSTRAINT "audit_logs_action_type_check"
    CHECK (
      "action_type" IN (
        'AUTHENTICATION_SUCCEEDED',
        'AUTHENTICATION_FAILED',
        'AUTH_SESSION_REVOKED',
        'USER_PROFILE_UPDATED',
        'USER_STATUS_CHANGED',
        'COURSE_CREATED',
        'CLASS_SECTION_CREATED',
        'CLASS_SECTION_UPDATED',
        'CLASS_SECTION_CLOSED',
        'COURSE_INVITE_CHANGED',
        'ENROLLMENT_CREATED',
        'ENROLLMENT_STATUS_CHANGED',
        'ROSTER_IMPORTED',
        'ROSTER_ALIGNED',
        'ROSTER_RESOLUTION_CHANGED',
        'ROSTER_VERSION_ROLLED_BACK',
        'EXERCISE_SESSION_STARTED',
        'EXERCISE_SESSION_ENDED',
        'EXERCISE_RECORD_SUBMITTED',
        'EXERCISE_RECORD_WITHDRAWN',
        'MEDIA_BOUND',
        'MEDIA_DELETED',
        'MEDIA_ACCESSED',
        'REVIEW_RESULT_CHANGED',
        'SCORE_RULE_CHANGED',
        'SCORE_RECALCULATED',
        'SCORE_ADJUSTED',
        'SCORE_PUBLISHED',
        'SCORE_LOCKED',
        'PERMISSION_CHANGED',
        'SYSTEM_MODE_CHANGED',
        'DATA_EXPORTED'
      )
    ),
  ADD CONSTRAINT "audit_logs_target_type_check"
    CHECK ("target_type" ~ '^[A-Z][A-Z0-9_]*$'),
  ADD CONSTRAINT "audit_logs_request_id_check"
    CHECK (btrim("request_id") <> ''),
  ADD CONSTRAINT "audit_logs_idempotency_reference_check"
    CHECK ("idempotency_key_reference" IS NULL OR "idempotency_key_reference" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "audit_logs_outcome_check"
    CHECK ("outcome" IN ('SUCCEEDED', 'REJECTED', 'FAILED')),
  ADD CONSTRAINT "audit_logs_reason_code_check"
    CHECK ("reason_code" IS NULL OR "reason_code" ~ '^[A-Z][A-Z0-9_]*$'),
  ADD CONSTRAINT "audit_logs_safe_metadata_check"
    CHECK (jsonb_typeof("safe_metadata") = 'object'),
  ADD CONSTRAINT "audit_logs_security_hashes_check"
    CHECK (
      ("source_ip_hash" IS NULL OR "source_ip_hash" ~ '^[0-9a-f]{64}$')
      AND ("device_fingerprint_hash" IS NULL OR "device_fingerprint_hash" ~ '^[0-9a-f]{64}$')
    );

ALTER TABLE "outbox_events"
  ADD CONSTRAINT "outbox_events_aggregate_type_check"
    CHECK (btrim("aggregate_type") <> ''),
  ADD CONSTRAINT "outbox_events_event_type_check"
    CHECK (btrim("event_type") <> ''),
  ADD CONSTRAINT "outbox_events_event_version_check"
    CHECK ("event_version" >= 1),
  ADD CONSTRAINT "outbox_events_payload_check"
    CHECK (jsonb_typeof("payload") = 'object'),
  ADD CONSTRAINT "outbox_events_status_check"
    CHECK ("status" IN ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED')),
  ADD CONSTRAINT "outbox_events_lock_pair_check"
    CHECK (("locked_at" IS NULL) = ("locked_by" IS NULL)),
  ADD CONSTRAINT "outbox_events_attempts_check"
    CHECK ("attempts" >= 0),
  ADD CONSTRAINT "outbox_events_error_code_check"
    CHECK ("last_error_code" IS NULL OR "last_error_code" ~ '^[A-Z][A-Z0-9_]*$'),
  ADD CONSTRAINT "outbox_events_timestamps_check"
    CHECK (
      "available_at" >= "created_at"
      AND ("locked_at" IS NULL OR "locked_at" >= "created_at")
      AND ("processed_at" IS NULL OR "processed_at" >= "created_at")
    ),
  ADD CONSTRAINT "outbox_events_state_shape_check"
    CHECK (
      ("status" = 'PROCESSING') = ("locked_at" IS NOT NULL)
      AND ("status" = 'PROCESSED') = ("processed_at" IS NOT NULL)
    );

-- V1 single-role/single-profile invariants. The transaction advisory lock closes
-- the race between concurrent inserts into different profile tables.
CREATE FUNCTION "enforce_profile_role_and_exclusivity"()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  expected_role text;
  actual_role text;
BEGIN
  expected_role := CASE TG_TABLE_NAME
    WHEN 'student_profiles' THEN 'STUDENT'
    WHEN 'teacher_profiles' THEN 'TEACHER'
    WHEN 'admin_profiles' THEN 'ADMIN'
    ELSE NULL
  END;

  IF expected_role IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'unknown profile table';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 0));

  SELECT "role" INTO actual_role
  FROM "users"
  WHERE "id" = NEW.user_id AND "organization_id" = NEW.organization_id;

  IF actual_role IS DISTINCT FROM expected_role THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'profile role does not match user role';
  END IF;

  IF (TG_TABLE_NAME <> 'student_profiles' AND EXISTS (
        SELECT 1 FROM "student_profiles" WHERE "user_id" = NEW.user_id
      ))
    OR (TG_TABLE_NAME <> 'teacher_profiles' AND EXISTS (
        SELECT 1 FROM "teacher_profiles" WHERE "user_id" = NEW.user_id
      ))
    OR (TG_TABLE_NAME <> 'admin_profiles' AND EXISTS (
        SELECT 1 FROM "admin_profiles" WHERE "user_id" = NEW.user_id
      )) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'user already owns another profile kind';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER "student_profiles_role_exclusivity_trigger"
  BEFORE INSERT OR UPDATE OF "user_id", "organization_id" ON "student_profiles"
  FOR EACH ROW EXECUTE FUNCTION "enforce_profile_role_and_exclusivity"();

CREATE TRIGGER "teacher_profiles_role_exclusivity_trigger"
  BEFORE INSERT OR UPDATE OF "user_id", "organization_id" ON "teacher_profiles"
  FOR EACH ROW EXECUTE FUNCTION "enforce_profile_role_and_exclusivity"();

CREATE TRIGGER "admin_profiles_role_exclusivity_trigger"
  BEFORE INSERT OR UPDATE OF "user_id", "organization_id" ON "admin_profiles"
  FOR EACH ROW EXECUTE FUNCTION "enforce_profile_role_and_exclusivity"();

CREATE FUNCTION "enforce_user_role_profile_consistency"()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.id::text, 0));

  IF (NEW.role <> 'STUDENT' AND EXISTS (
        SELECT 1 FROM "student_profiles" WHERE "user_id" = NEW.id
      ))
    OR (NEW.role <> 'TEACHER' AND EXISTS (
        SELECT 1 FROM "teacher_profiles" WHERE "user_id" = NEW.id
      ))
    OR (NEW.role <> 'ADMIN' AND EXISTS (
        SELECT 1 FROM "admin_profiles" WHERE "user_id" = NEW.id
      )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'user role conflicts with existing profile';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER "users_role_profile_consistency_trigger"
  BEFORE UPDATE OF "role", "organization_id" ON "users"
  FOR EACH ROW EXECUTE FUNCTION "enforce_user_role_profile_consistency"();

-- Audit rows are immutable after insertion, including for the application role.
CREATE FUNCTION "prevent_audit_log_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'audit logs are append-only';
END;
$function$;

CREATE TRIGGER "audit_logs_append_only_trigger"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "prevent_audit_log_mutation"();
