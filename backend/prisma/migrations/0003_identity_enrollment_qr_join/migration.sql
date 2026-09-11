-- Stage 12 student identity, CourseInvite, JoinCapability, and Enrollment persistence.
-- Forward-only: Foundation and teaching-structure migrations remain immutable.

CREATE TABLE "course_invites" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "class_section_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "secret_ciphertext" TEXT,
    "secret_key_version" INTEGER NOT NULL,
    "secret_replay_expires_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by" UUID,
    "revoke_reason" VARCHAR(1000),
    "replaced_by_invite_id" UUID,
    "row_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "course_invites_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "enrollments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "semester_id" UUID NOT NULL,
    "class_section_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "source" VARCHAR(32) NOT NULL,
    "source_reference_id" UUID,
    "status" VARCHAR(16) NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6),
    "end_reason" VARCHAR(1000),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "enrollment_status_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "from_status" VARCHAR(16),
    "to_status" VARCHAR(16) NOT NULL,
    "source" VARCHAR(32) NOT NULL,
    "reason" VARCHAR(1000),
    "actor_user_id" UUID NOT NULL,
    "actor_role_snapshot" VARCHAR(32) NOT NULL,
    "request_id" VARCHAR(64) NOT NULL,
    "idempotency_key_reference" CHAR(64),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "enrollment_version" INTEGER NOT NULL,

    CONSTRAINT "enrollment_status_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "join_capabilities" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "course_invite_id" UUID NOT NULL,
    "class_section_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "secret_ciphertext" TEXT,
    "secret_key_version" INTEGER NOT NULL,
    "secret_replay_expires_at" TIMESTAMPTZ(6),
    "status" VARCHAR(16) NOT NULL,
    "identity_fingerprint" CHAR(64) NOT NULL,
    "device_challenge_hash" CHAR(64),
    "encrypted_identity_snapshot" TEXT NOT NULL,
    "identity_key_version" INTEGER NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "consumed_by_user_id" UUID,
    "enrollment_id" UUID,
    "auth_session_id" UUID,
    "result_ciphertext" TEXT,
    "result_key_version" INTEGER,
    "result_replay_expires_at" TIMESTAMPTZ(6),
    "created_request_id" VARCHAR(64) NOT NULL,
    "consumed_request_id" VARCHAR(64),
    "consumed_idempotency_key_hash" CHAR(64),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "join_capabilities_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "course_invites"
    ADD CONSTRAINT "course_invites_version_number_check"
        CHECK ("version_number" >= 1),
    ADD CONSTRAINT "course_invites_status_check"
        CHECK ("status" IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
    ADD CONSTRAINT "course_invites_token_hash_check"
        CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT "course_invites_secret_key_version_check"
        CHECK ("secret_key_version" = 1),
    ADD CONSTRAINT "course_invites_secret_replay_shape_check"
        CHECK (
            ("secret_ciphertext" IS NULL AND "secret_replay_expires_at" IS NULL)
            OR
            ("secret_ciphertext" IS NOT NULL AND "secret_replay_expires_at" IS NOT NULL AND "secret_replay_expires_at" > "created_at")
        ),
    ADD CONSTRAINT "course_invites_expiry_check"
        CHECK ("expires_at" > "created_at"),
    ADD CONSTRAINT "course_invites_revoke_shape_check"
        CHECK (
            ("status" = 'ACTIVE' AND "revoked_at" IS NULL AND "revoked_by" IS NULL AND "revoke_reason" IS NULL AND "replaced_by_invite_id" IS NULL)
            OR
            ("status" = 'REVOKED' AND "revoked_at" IS NOT NULL AND "revoked_by" IS NOT NULL AND "revoke_reason" IS NOT NULL AND "replaced_by_invite_id" IS NOT NULL)
            OR
            ("status" = 'EXPIRED' AND "revoked_at" IS NULL AND "revoked_by" IS NULL AND "revoke_reason" IS NULL AND "replaced_by_invite_id" IS NULL)
        ),
    ADD CONSTRAINT "course_invites_revoke_reason_check"
        CHECK ("revoke_reason" IS NULL OR (char_length("revoke_reason") BETWEEN 1 AND 1000 AND "revoke_reason" = btrim("revoke_reason"))),
    ADD CONSTRAINT "course_invites_row_version_check"
        CHECK ("row_version" >= 1);

ALTER TABLE "enrollments"
    ADD CONSTRAINT "enrollments_source_check"
        CHECK ("source" IN ('QR_CODE', 'MANUAL', 'OFFICIAL_IMPORT', 'SYSTEM_SYNC')),
    ADD CONSTRAINT "enrollments_status_check"
        CHECK ("status" IN ('ACTIVE', 'WITHDRAWN', 'REMOVED')),
    ADD CONSTRAINT "enrollments_source_reference_check"
        CHECK (("source" = 'QR_CODE' AND "source_reference_id" IS NOT NULL) OR "source" <> 'QR_CODE'),
    ADD CONSTRAINT "enrollments_status_shape_check"
        CHECK (
            ("status" = 'ACTIVE' AND "ended_at" IS NULL AND "end_reason" IS NULL)
            OR
            ("status" IN ('WITHDRAWN', 'REMOVED') AND "ended_at" IS NOT NULL AND "end_reason" IS NOT NULL)
        ),
    ADD CONSTRAINT "enrollments_end_reason_check"
        CHECK ("end_reason" IS NULL OR (char_length("end_reason") BETWEEN 1 AND 1000 AND "end_reason" = btrim("end_reason"))),
    ADD CONSTRAINT "enrollments_timestamp_order_check"
        CHECK ("updated_at" >= "created_at" AND "joined_at" >= "created_at" AND ("ended_at" IS NULL OR "ended_at" >= "joined_at")),
    ADD CONSTRAINT "enrollments_version_check"
        CHECK ("version" >= 1);

ALTER TABLE "enrollment_status_events"
    ADD CONSTRAINT "enrollment_status_events_from_status_check"
        CHECK ("from_status" IS NULL OR "from_status" IN ('ACTIVE', 'WITHDRAWN', 'REMOVED')),
    ADD CONSTRAINT "enrollment_status_events_to_status_check"
        CHECK ("to_status" IN ('ACTIVE', 'WITHDRAWN', 'REMOVED')),
    ADD CONSTRAINT "enrollment_status_events_transition_check"
        CHECK (
            ("from_status" IS NULL AND "to_status" = 'ACTIVE')
            OR ("from_status" = 'ACTIVE' AND "to_status" IN ('WITHDRAWN', 'REMOVED'))
            OR ("from_status" IN ('WITHDRAWN', 'REMOVED') AND "to_status" = 'ACTIVE')
        ),
    ADD CONSTRAINT "enrollment_status_events_source_check"
        CHECK ("source" IN ('QR_JOIN', 'MANUAL_ENROLLMENT', 'TEACHER_REMOVAL', 'TEACHER_RESTORE', 'STUDENT_WITHDRAWAL', 'SYSTEM')),
    ADD CONSTRAINT "enrollment_status_events_reason_check"
        CHECK (
            (
                "from_status" IS NULL
                AND (
                    ("source" = 'QR_JOIN' AND "reason" IS NULL)
                    OR
                    ("source" = 'MANUAL_ENROLLMENT' AND "reason" IS NOT NULL AND char_length("reason") BETWEEN 1 AND 1000 AND "reason" = btrim("reason"))
                )
            )
            OR
            ("from_status" IS NOT NULL AND "reason" IS NOT NULL AND char_length("reason") BETWEEN 1 AND 1000 AND "reason" = btrim("reason"))
        ),
    ADD CONSTRAINT "enrollment_status_events_actor_role_check"
        CHECK ("actor_role_snapshot" IN ('STUDENT', 'TEACHER', 'ADMIN')),
    ADD CONSTRAINT "enrollment_status_events_request_id_check"
        CHECK (char_length("request_id") BETWEEN 1 AND 64),
    ADD CONSTRAINT "enrollment_status_events_enrollment_version_check"
        CHECK ("enrollment_version" >= 1);

ALTER TABLE "join_capabilities"
    ADD CONSTRAINT "join_capabilities_status_check"
        CHECK ("status" IN ('ACTIVE', 'CONSUMED', 'EXPIRED')),
    ADD CONSTRAINT "join_capabilities_token_hash_check"
        CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT "join_capabilities_secret_key_version_check"
        CHECK ("secret_key_version" = 1),
    ADD CONSTRAINT "join_capabilities_secret_replay_shape_check"
        CHECK (
            ("secret_ciphertext" IS NULL AND "secret_replay_expires_at" IS NULL)
            OR
            ("secret_ciphertext" IS NOT NULL AND "secret_replay_expires_at" IS NOT NULL AND "secret_replay_expires_at" > "issued_at")
        ),
    ADD CONSTRAINT "join_capabilities_identity_fingerprint_check"
        CHECK ("identity_fingerprint" ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT "join_capabilities_device_challenge_hash_check"
        CHECK ("device_challenge_hash" IS NULL OR "device_challenge_hash" ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT "join_capabilities_identity_key_version_check"
        CHECK ("identity_key_version" = 1),
    ADD CONSTRAINT "join_capabilities_expiry_check"
        CHECK ("expires_at" > "issued_at"),
    ADD CONSTRAINT "join_capabilities_consumed_shape_check"
        CHECK (
            ("status" IN ('ACTIVE', 'EXPIRED')
                AND "consumed_at" IS NULL
                AND "consumed_by_user_id" IS NULL
                AND "enrollment_id" IS NULL
                AND "auth_session_id" IS NULL
                AND "result_ciphertext" IS NULL
                AND "result_key_version" IS NULL
                AND "result_replay_expires_at" IS NULL
                AND "consumed_request_id" IS NULL
                AND "consumed_idempotency_key_hash" IS NULL)
            OR
            ("status" = 'CONSUMED'
                AND "consumed_at" IS NOT NULL
                AND "consumed_by_user_id" IS NOT NULL
                AND "enrollment_id" IS NOT NULL
                AND "auth_session_id" IS NOT NULL
                AND "result_ciphertext" IS NOT NULL
                AND "result_key_version" = 1
                AND "result_replay_expires_at" IS NOT NULL
                AND "result_replay_expires_at" > "consumed_at"
                AND "consumed_request_id" IS NOT NULL
                AND "consumed_idempotency_key_hash" IS NOT NULL)
        ),
    ADD CONSTRAINT "join_capabilities_version_check"
        CHECK ("version" >= 1);

CREATE UNIQUE INDEX "student_profiles_id_organization_id_key"
    ON "student_profiles"("id", "organization_id");
CREATE UNIQUE INDEX "class_sections_id_semester_organization_key"
    ON "class_sections"("id", "semester_id", "organization_id");

CREATE UNIQUE INDEX "course_invites_token_hash_key"
    ON "course_invites"("token_hash");
CREATE UNIQUE INDEX "course_invites_id_organization_id_key"
    ON "course_invites"("id", "organization_id");
CREATE UNIQUE INDEX "course_invites_id_section_organization_key"
    ON "course_invites"("id", "class_section_id", "organization_id");
CREATE UNIQUE INDEX "course_invites_section_version_key"
    ON "course_invites"("class_section_id", "version_number");
CREATE UNIQUE INDEX "course_invites_one_active_per_section_idx"
    ON "course_invites"("class_section_id") WHERE "status" = 'ACTIVE';
CREATE INDEX "course_invites_organization_section_status_created_idx"
    ON "course_invites"("organization_id", "class_section_id", "status", "created_at");
CREATE INDEX "course_invites_expires_at_idx"
    ON "course_invites"("expires_at");
CREATE INDEX "course_invites_secret_replay_expires_at_idx"
    ON "course_invites"("secret_replay_expires_at");

CREATE UNIQUE INDEX "enrollments_id_organization_id_key"
    ON "enrollments"("id", "organization_id");
CREATE UNIQUE INDEX "enrollments_class_section_student_key"
    ON "enrollments"("class_section_id", "student_id");
CREATE UNIQUE INDEX "enrollments_one_active_per_semester_student_idx"
    ON "enrollments"("organization_id", "semester_id", "student_id") WHERE "status" = 'ACTIVE';
CREATE INDEX "enrollments_organization_section_status_joined_id_idx"
    ON "enrollments"("organization_id", "class_section_id", "status", "joined_at", "id");
CREATE INDEX "enrollments_organization_student_status_joined_id_idx"
    ON "enrollments"("organization_id", "student_id", "status", "joined_at", "id");
CREATE INDEX "enrollments_organization_semester_status_idx"
    ON "enrollments"("organization_id", "semester_id", "status");

CREATE UNIQUE INDEX "enrollment_status_events_enrollment_version_key"
    ON "enrollment_status_events"("enrollment_id", "enrollment_version");
CREATE INDEX "enrollment_status_events_organization_enrollment_occurred_idx"
    ON "enrollment_status_events"("organization_id", "enrollment_id", "occurred_at", "id");
CREATE INDEX "enrollment_status_events_request_id_idx"
    ON "enrollment_status_events"("request_id");

CREATE UNIQUE INDEX "join_capabilities_token_hash_key"
    ON "join_capabilities"("token_hash");
CREATE UNIQUE INDEX "join_capabilities_id_organization_id_key"
    ON "join_capabilities"("id", "organization_id");
CREATE INDEX "join_capabilities_organization_invite_status_expires_idx"
    ON "join_capabilities"("organization_id", "course_invite_id", "status", "expires_at");
CREATE INDEX "join_capabilities_organization_section_identity_idx"
    ON "join_capabilities"("organization_id", "class_section_id", "identity_fingerprint");
CREATE INDEX "join_capabilities_secret_replay_expires_at_idx"
    ON "join_capabilities"("secret_replay_expires_at");
CREATE INDEX "join_capabilities_result_replay_expires_at_idx"
    ON "join_capabilities"("result_replay_expires_at");

ALTER TABLE "course_invites"
    ADD CONSTRAINT "course_invites_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "course_invites_class_section_id_organization_id_fkey"
        FOREIGN KEY ("class_section_id", "organization_id") REFERENCES "class_sections"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "course_invites_created_by_organization_id_fkey"
        FOREIGN KEY ("created_by", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "course_invites_revoked_by_organization_id_fkey"
        FOREIGN KEY ("revoked_by", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "course_invites_replaced_by_organization_id_fkey"
        FOREIGN KEY ("replaced_by_invite_id", "organization_id") REFERENCES "course_invites"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "enrollments"
    ADD CONSTRAINT "enrollments_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "enrollments_semester_id_organization_id_fkey"
        FOREIGN KEY ("semester_id", "organization_id") REFERENCES "semesters"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "enrollments_class_section_semester_organization_fkey"
        FOREIGN KEY ("class_section_id", "semester_id", "organization_id") REFERENCES "class_sections"("id", "semester_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "enrollments_student_id_organization_id_fkey"
        FOREIGN KEY ("student_id", "organization_id") REFERENCES "student_profiles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "enrollments_created_by_organization_id_fkey"
        FOREIGN KEY ("created_by", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "enrollments_updated_by_organization_id_fkey"
        FOREIGN KEY ("updated_by", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "enrollment_status_events"
    ADD CONSTRAINT "enrollment_status_events_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "enrollment_status_events_enrollment_id_organization_id_fkey"
        FOREIGN KEY ("enrollment_id", "organization_id") REFERENCES "enrollments"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "enrollment_status_events_actor_user_id_organization_id_fkey"
        FOREIGN KEY ("actor_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "join_capabilities"
    ADD CONSTRAINT "join_capabilities_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "join_capabilities_invite_section_organization_fkey"
        FOREIGN KEY ("course_invite_id", "class_section_id", "organization_id") REFERENCES "course_invites"("id", "class_section_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "join_capabilities_class_section_id_organization_id_fkey"
        FOREIGN KEY ("class_section_id", "organization_id") REFERENCES "class_sections"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "join_capabilities_consumed_by_user_organization_id_fkey"
        FOREIGN KEY ("consumed_by_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "join_capabilities_enrollment_id_organization_id_fkey"
        FOREIGN KEY ("enrollment_id", "organization_id") REFERENCES "enrollments"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "join_capabilities_auth_session_id_organization_id_fkey"
        FOREIGN KEY ("auth_session_id", "organization_id") REFERENCES "auth_sessions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "prevent_enrollment_status_event_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'enrollment status events are append-only';
END;
$function$;

CREATE TRIGGER "enrollment_status_events_append_only_trigger"
  BEFORE UPDATE OR DELETE ON "enrollment_status_events"
  FOR EACH ROW EXECUTE FUNCTION "prevent_enrollment_status_event_mutation"();
