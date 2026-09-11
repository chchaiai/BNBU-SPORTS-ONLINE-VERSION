-- Stage 21: persistent client capabilities and privacy-preserving location evidence.
-- Generated table/index/foreign-key baseline from the authoritative Prisma schema.

CREATE TABLE "student_sign_in_challenges" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID,
    "channel" VARCHAR(16) NOT NULL,
    "locale" VARCHAR(16) NOT NULL,
    "account_digest" CHAR(64) NOT NULL,
    "source_ip_digest" CHAR(64),
    "code_digest" CHAR(64) NOT NULL,
    "code_key_version" INTEGER NOT NULL,
    "status" VARCHAR(24) NOT NULL,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL,
    "delivered_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "auth_session_id" UUID,
    "result_ciphertext" TEXT,
    "result_key_version" INTEGER,
    "result_replay_expires_at" TIMESTAMPTZ(6),
    "request_id" VARCHAR(64) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "student_sign_in_challenges_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "account_recovery_challenges" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID,
    "requested_role" VARCHAR(16) NOT NULL,
    "channel" VARCHAR(16) NOT NULL,
    "locale" VARCHAR(16) NOT NULL,
    "account_digest" CHAR(64) NOT NULL,
    "source_ip_digest" CHAR(64),
    "code_digest" CHAR(64) NOT NULL,
    "code_key_version" INTEGER NOT NULL,
    "status" VARCHAR(24) NOT NULL,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL,
    "delivered_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "request_id" VARCHAR(64) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "account_recovery_challenges_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auth_rate_limit_facts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "purpose" VARCHAR(32) NOT NULL,
    "scope_type" VARCHAR(16) NOT NULL,
    "scope_digest" CHAR(64) NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "auth_rate_limit_facts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_release_policies" (
    "id" UUID NOT NULL,
    "platform" VARCHAR(16) NOT NULL,
    "minimum_supported_version" VARCHAR(64) NOT NULL,
    "latest_version" VARCHAR(64) NOT NULL,
    "enforcement" VARCHAR(16) NOT NULL,
    "message" VARCHAR(1000),
    "download_url" VARCHAR(2048),
    "effective_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "policy_version" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "app_release_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "recipient_user_id" UUID NOT NULL,
    "notification_type" VARCHAR(64) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "target_type" VARCHAR(64),
    "target_id" UUID,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "event_type" VARCHAR(16) NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "auth_session_id" UUID NOT NULL,
    "request_id" VARCHAR(64) NOT NULL,
    "idempotency_key_reference" CHAR(64),
    "event_version" INTEGER NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "push_devices" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "auth_session_id" UUID NOT NULL,
    "platform" VARCHAR(16) NOT NULL,
    "app_version" VARCHAR(64) NOT NULL,
    "locale" VARCHAR(16) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "registration_token_hash" CHAR(64) NOT NULL,
    "registration_token_ciphertext" TEXT,
    "encryption_key_version" INTEGER NOT NULL,
    "registered_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "push_device_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "push_device_id" UUID NOT NULL,
    "event_type" VARCHAR(16) NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "auth_session_id" UUID NOT NULL,
    "request_id" VARCHAR(64) NOT NULL,
    "idempotency_key_reference" CHAR(64),
    "event_version" INTEGER NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "push_device_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_preferences" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "locale" VARCHAR(16) NOT NULL,
    "push_enabled" BOOLEAN NOT NULL,
    "email_enabled" BOOLEAN NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_preference_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_preference_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "auth_session_id" UUID NOT NULL,
    "request_id" VARCHAR(64) NOT NULL,
    "idempotency_key_reference" CHAR(64),
    "event_version" INTEGER NOT NULL,
    "changed_fields" VARCHAR(32)[] NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_preference_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "help_articles" (
    "id" UUID NOT NULL,
    "category" VARCHAR(64) NOT NULL,
    "locale" VARCHAR(16) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body_markdown" TEXT NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "published_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "help_articles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "feedback" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "category" VARCHAR(32) NOT NULL,
    "content" VARCHAR(2000) NOT NULL,
    "status" VARCHAR(24) NOT NULL,
    "public_reply" VARCHAR(2000),
    "client_platform" VARCHAR(16),
    "client_app_version" VARCHAR(64),
    "client_os_version" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "feedback_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "feedback_id" UUID NOT NULL,
    "event_type" VARCHAR(16) NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "auth_session_id" UUID NOT NULL,
    "request_id" VARCHAR(64) NOT NULL,
    "idempotency_key_reference" CHAR(64),
    "event_version" INTEGER NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "feedback_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "exemption_applications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "semester_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "class_section_id" UUID NOT NULL,
    "application_type" VARCHAR(32) NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "status" VARCHAR(24) NOT NULL,
    "public_comment" VARCHAR(1000),
    "submitted_at" TIMESTAMPTZ(6),
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "exemption_applications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "exemption_application_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "event_type" VARCHAR(24) NOT NULL,
    "from_status" VARCHAR(24),
    "to_status" VARCHAR(24) NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "auth_session_id" UUID NOT NULL,
    "request_id" VARCHAR(64) NOT NULL,
    "idempotency_key_reference" CHAR(64),
    "event_version" INTEGER NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exemption_application_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "exemption_review_records" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "review_version" INTEGER NOT NULL,
    "previous_review_id" UUID,
    "teacher_id" UUID NOT NULL,
    "decision" VARCHAR(24) NOT NULL,
    "public_comment" VARCHAR(1000) NOT NULL,
    "internal_note" VARCHAR(2000),
    "request_id" VARCHAR(64) NOT NULL,
    "reviewed_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exemption_review_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "exemption_application_media" (
    "organization_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exemption_application_media_pkey" PRIMARY KEY ("application_id","media_id")
);

CREATE TABLE "sport_catalog_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "sport_type" VARCHAR(64) NOT NULL,
    "display_name_key" VARCHAR(128) NOT NULL,
    "active" BOOLEAN NOT NULL,
    "requires_sport_name" BOOLEAN NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sport_catalog_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "location_privacy_policies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "policy_version" VARCHAR(64) NOT NULL,
    "purpose_code" VARCHAR(32) NOT NULL DEFAULT 'EXERCISE_EVIDENCE',
    "collection_enabled" BOOLEAN NOT NULL,
    "sample_interval_seconds" INTEGER,
    "maximum_accuracy_meters" INTEGER,
    "raw_retention_days" INTEGER,
    "coarse_retention_days" INTEGER,
    "coarse_projection_meters" INTEGER,
    "background_collection_enabled" BOOLEAN NOT NULL DEFAULT false,
    "revocation_disposition" VARCHAR(32),
    "effective_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "location_privacy_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "location_consents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "purpose_code" VARCHAR(32) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "policy_id" UUID NOT NULL,
    "policy_version" VARCHAR(64) NOT NULL,
    "consented_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "location_consents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "location_consent_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "consent_id" UUID NOT NULL,
    "event_type" VARCHAR(16) NOT NULL,
    "policy_version" VARCHAR(64) NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "auth_session_id" UUID NOT NULL,
    "request_id" VARCHAR(64) NOT NULL,
    "idempotency_key_reference" CHAR(64),
    "event_version" INTEGER NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "location_consent_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "location_tracks" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "class_section_id" UUID NOT NULL,
    "semester_id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "policy_version" VARCHAR(64) NOT NULL,
    "consent_id" UUID NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "accepted_sample_count" INTEGER NOT NULL DEFAULT 0,
    "rejected_sample_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "last_observed_at" TIMESTAMPTZ(6),
    "finalized_at" TIMESTAMPTZ(6),
    "interrupted_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "reason_code" VARCHAR(64),
    "raw_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "location_tracks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "location_track_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "track_id" UUID NOT NULL,
    "event_type" VARCHAR(24) NOT NULL,
    "from_status" VARCHAR(16),
    "to_status" VARCHAR(16) NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "auth_session_id" UUID NOT NULL,
    "request_id" VARCHAR(64) NOT NULL,
    "idempotency_key_reference" CHAR(64),
    "event_version" INTEGER NOT NULL,
    "accepted_sample_count" INTEGER NOT NULL DEFAULT 0,
    "rejected_sample_count" INTEGER NOT NULL DEFAULT 0,
    "reason_code" VARCHAR(64),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "location_track_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "location_samples" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "track_id" UUID NOT NULL,
    "sample_id" UUID NOT NULL,
    "observed_at" TIMESTAMPTZ(6) NOT NULL,
    "accuracy_meters" INTEGER NOT NULL,
    "payload_fingerprint" CHAR(64) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6) NOT NULL,
    "raw_expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "location_samples_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "location_sample_secrets" (
    "sample_row_id" UUID NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "key_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "location_sample_secrets_pkey" PRIMARY KEY ("sample_row_id")
);

CREATE TABLE "location_summaries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "track_id" UUID NOT NULL,
    "record_id" UUID,
    "availability" VARCHAR(24) NOT NULL,
    "coarse_route_polyline" TEXT,
    "coarse_distance_meters" INTEGER,
    "observed_start_at" TIMESTAMPTZ(6),
    "observed_end_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "policy_version" VARCHAR(64),
    "quality_flags" VARCHAR(64)[] DEFAULT ARRAY[]::VARCHAR(64)[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "location_summaries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "location_retention_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "track_id" UUID NOT NULL,
    "data_class" VARCHAR(16) NOT NULL,
    "deleted_row_count" INTEGER NOT NULL,
    "policy_version" VARCHAR(64) NOT NULL,
    "request_id" VARCHAR(64) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "location_retention_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "student_sign_in_challenges_account_requested_idx" ON "student_sign_in_challenges"("organization_id", "account_digest", "requested_at");

CREATE INDEX "student_sign_in_challenges_source_requested_idx" ON "student_sign_in_challenges"("source_ip_digest", "requested_at");

CREATE INDEX "student_sign_in_challenges_status_expires_idx" ON "student_sign_in_challenges"("status", "expires_at");

CREATE UNIQUE INDEX "student_sign_in_challenges_id_organization_key" ON "student_sign_in_challenges"("id", "organization_id");

CREATE INDEX "account_recovery_challenges_account_requested_idx" ON "account_recovery_challenges"("organization_id", "account_digest", "requested_at");

CREATE INDEX "account_recovery_challenges_source_requested_idx" ON "account_recovery_challenges"("source_ip_digest", "requested_at");

CREATE INDEX "account_recovery_challenges_status_expires_idx" ON "account_recovery_challenges"("status", "expires_at");

CREATE UNIQUE INDEX "account_recovery_challenges_id_organization_key" ON "account_recovery_challenges"("id", "organization_id");

CREATE INDEX "auth_rate_limit_facts_scope_occurred_idx" ON "auth_rate_limit_facts"("organization_id", "purpose", "scope_type", "scope_digest", "occurred_at");

CREATE INDEX "app_release_policies_platform_effective_idx" ON "app_release_policies"("platform", "effective_at", "expires_at");

CREATE UNIQUE INDEX "app_release_policies_platform_version_key" ON "app_release_policies"("platform", "policy_version");

CREATE INDEX "notifications_recipient_created_idx" ON "notifications"("organization_id", "recipient_user_id", "created_at", "id");

CREATE INDEX "notifications_recipient_unread_idx" ON "notifications"("organization_id", "recipient_user_id", "read_at", "created_at");

CREATE UNIQUE INDEX "notifications_id_organization_key" ON "notifications"("id", "organization_id");

CREATE INDEX "notification_events_request_id_idx" ON "notification_events"("request_id");

CREATE UNIQUE INDEX "notification_events_notification_version_key" ON "notification_events"("notification_id", "event_version");

CREATE UNIQUE INDEX "push_devices_registration_token_hash_key" ON "push_devices"("registration_token_hash");

CREATE INDEX "push_devices_owner_status_idx" ON "push_devices"("organization_id", "user_id", "status", "registered_at");

CREATE UNIQUE INDEX "push_devices_id_organization_key" ON "push_devices"("id", "organization_id");

CREATE INDEX "push_device_events_request_id_idx" ON "push_device_events"("request_id");

CREATE UNIQUE INDEX "push_device_events_device_version_key" ON "push_device_events"("push_device_id", "event_version");

CREATE UNIQUE INDEX "user_preferences_user_id_key" ON "user_preferences"("user_id");

CREATE UNIQUE INDEX "user_preferences_id_organization_key" ON "user_preferences"("id", "organization_id");

CREATE UNIQUE INDEX "user_preferences_user_organization_key" ON "user_preferences"("user_id", "organization_id");

CREATE INDEX "user_preference_events_request_id_idx" ON "user_preference_events"("request_id");

CREATE UNIQUE INDEX "user_preference_events_preference_version_key" ON "user_preference_events"("user_preference_id", "event_version");

CREATE INDEX "help_articles_locale_category_status_idx" ON "help_articles"("locale", "category", "status", "published_at");

CREATE INDEX "feedback_creator_created_idx" ON "feedback"("organization_id", "created_by_user_id", "created_at", "id");

CREATE INDEX "feedback_status_created_idx" ON "feedback"("organization_id", "status", "created_at", "id");

CREATE UNIQUE INDEX "feedback_id_organization_key" ON "feedback"("id", "organization_id");

CREATE INDEX "feedback_events_request_id_idx" ON "feedback_events"("request_id");

CREATE UNIQUE INDEX "feedback_events_feedback_version_key" ON "feedback_events"("feedback_id", "event_version");

CREATE INDEX "exemption_applications_student_created_idx" ON "exemption_applications"("organization_id", "student_id", "created_at", "id");

CREATE INDEX "exemption_applications_section_status_idx" ON "exemption_applications"("organization_id", "class_section_id", "status", "submitted_at", "id");

CREATE UNIQUE INDEX "exemption_applications_id_organization_key" ON "exemption_applications"("id", "organization_id");

CREATE INDEX "exemption_application_events_request_id_idx" ON "exemption_application_events"("request_id");

CREATE UNIQUE INDEX "exemption_application_events_application_version_key" ON "exemption_application_events"("application_id", "event_version");

CREATE INDEX "exemption_review_records_application_reviewed_idx" ON "exemption_review_records"("organization_id", "application_id", "reviewed_at");

CREATE UNIQUE INDEX "exemption_review_records_id_organization_key" ON "exemption_review_records"("id", "organization_id");

CREATE UNIQUE INDEX "exemption_review_records_application_version_key" ON "exemption_review_records"("application_id", "review_version");

CREATE UNIQUE INDEX "exemption_application_media_media_id_key" ON "exemption_application_media"("media_id");

CREATE UNIQUE INDEX "exemption_application_media_position_key" ON "exemption_application_media"("application_id", "position");

CREATE INDEX "sport_catalog_items_organization_active_idx" ON "sport_catalog_items"("organization_id", "active", "sport_type");

CREATE UNIQUE INDEX "sport_catalog_items_organization_sport_type_key" ON "sport_catalog_items"("organization_id", "sport_type");

CREATE INDEX "location_privacy_policies_effective_idx" ON "location_privacy_policies"("organization_id", "effective_at", "version");

CREATE UNIQUE INDEX "location_privacy_policies_id_organization_key" ON "location_privacy_policies"("id", "organization_id");

CREATE UNIQUE INDEX "location_privacy_policies_organization_policy_version_key" ON "location_privacy_policies"("organization_id", "policy_version");

CREATE UNIQUE INDEX "location_privacy_policies_organization_version_key" ON "location_privacy_policies"("organization_id", "version");

CREATE UNIQUE INDEX "location_consents_id_organization_key" ON "location_consents"("id", "organization_id");

CREATE UNIQUE INDEX "location_consents_student_purpose_key" ON "location_consents"("organization_id", "student_id", "purpose_code");

CREATE INDEX "location_consent_events_request_id_idx" ON "location_consent_events"("request_id");

CREATE UNIQUE INDEX "location_consent_events_consent_version_key" ON "location_consent_events"("consent_id", "event_version");

CREATE UNIQUE INDEX "location_tracks_session_id_key" ON "location_tracks"("session_id");

CREATE INDEX "location_tracks_student_status_idx" ON "location_tracks"("organization_id", "student_id", "status", "started_at", "id");

CREATE INDEX "location_tracks_retention_idx" ON "location_tracks"("status", "raw_expires_at", "id");

CREATE UNIQUE INDEX "location_tracks_id_organization_key" ON "location_tracks"("id", "organization_id");

CREATE UNIQUE INDEX "location_tracks_session_scope_key" ON "location_tracks"("session_id", "enrollment_id", "semester_id", "class_section_id", "student_id", "organization_id");

CREATE INDEX "location_track_events_request_id_idx" ON "location_track_events"("request_id");

CREATE UNIQUE INDEX "location_track_events_track_version_key" ON "location_track_events"("track_id", "event_version");

CREATE INDEX "location_samples_track_observed_idx" ON "location_samples"("track_id", "observed_at", "sample_id");

CREATE INDEX "location_samples_raw_expires_idx" ON "location_samples"("raw_expires_at", "id");

CREATE UNIQUE INDEX "location_samples_track_sample_key" ON "location_samples"("track_id", "sample_id");

CREATE UNIQUE INDEX "location_samples_id_organization_key" ON "location_samples"("id", "organization_id");

CREATE UNIQUE INDEX "location_summaries_track_id_key" ON "location_summaries"("track_id");

CREATE UNIQUE INDEX "location_summaries_record_id_key" ON "location_summaries"("record_id");

CREATE INDEX "location_summaries_availability_expires_idx" ON "location_summaries"("availability", "expires_at", "id");

CREATE UNIQUE INDEX "location_summaries_id_organization_key" ON "location_summaries"("id", "organization_id");

CREATE UNIQUE INDEX "location_summaries_track_organization_key" ON "location_summaries"("track_id", "organization_id");

CREATE UNIQUE INDEX "location_summaries_record_organization_key" ON "location_summaries"("record_id", "organization_id");

CREATE INDEX "location_retention_events_track_deleted_idx" ON "location_retention_events"("organization_id", "track_id", "deleted_at");

CREATE INDEX "location_retention_events_request_id_idx" ON "location_retention_events"("request_id");

ALTER TABLE "student_sign_in_challenges" ADD CONSTRAINT "student_sign_in_challenges_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "student_sign_in_challenges" ADD CONSTRAINT "student_sign_in_challenges_user_id_organization_id_fkey" FOREIGN KEY ("user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "account_recovery_challenges" ADD CONSTRAINT "account_recovery_challenges_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "account_recovery_challenges" ADD CONSTRAINT "account_recovery_challenges_user_id_organization_id_fkey" FOREIGN KEY ("user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "auth_rate_limit_facts" ADD CONSTRAINT "auth_rate_limit_facts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_organization_id_fkey" FOREIGN KEY ("recipient_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_notification_id_organization_id_fkey" FOREIGN KEY ("notification_id", "organization_id") REFERENCES "notifications"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_actor_user_id_organization_id_fkey" FOREIGN KEY ("actor_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_auth_session_id_organization_id_fkey" FOREIGN KEY ("auth_session_id", "organization_id") REFERENCES "auth_sessions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_user_id_organization_id_fkey" FOREIGN KEY ("user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_auth_session_id_organization_id_fkey" FOREIGN KEY ("auth_session_id", "organization_id") REFERENCES "auth_sessions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "push_device_events" ADD CONSTRAINT "push_device_events_push_device_id_organization_id_fkey" FOREIGN KEY ("push_device_id", "organization_id") REFERENCES "push_devices"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "push_device_events" ADD CONSTRAINT "push_device_events_actor_user_id_organization_id_fkey" FOREIGN KEY ("actor_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "push_device_events" ADD CONSTRAINT "push_device_events_auth_session_id_organization_id_fkey" FOREIGN KEY ("auth_session_id", "organization_id") REFERENCES "auth_sessions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_organization_id_fkey" FOREIGN KEY ("user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_preference_events" ADD CONSTRAINT "user_preference_events_user_preference_id_organization_id_fkey" FOREIGN KEY ("user_preference_id", "organization_id") REFERENCES "user_preferences"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_preference_events" ADD CONSTRAINT "user_preference_events_actor_user_id_organization_id_fkey" FOREIGN KEY ("actor_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_preference_events" ADD CONSTRAINT "user_preference_events_auth_session_id_organization_id_fkey" FOREIGN KEY ("auth_session_id", "organization_id") REFERENCES "auth_sessions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "feedback" ADD CONSTRAINT "feedback_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "feedback" ADD CONSTRAINT "feedback_created_by_user_id_organization_id_fkey" FOREIGN KEY ("created_by_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "feedback_events" ADD CONSTRAINT "feedback_events_feedback_id_organization_id_fkey" FOREIGN KEY ("feedback_id", "organization_id") REFERENCES "feedback"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "feedback_events" ADD CONSTRAINT "feedback_events_actor_user_id_organization_id_fkey" FOREIGN KEY ("actor_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "feedback_events" ADD CONSTRAINT "feedback_events_auth_session_id_organization_id_fkey" FOREIGN KEY ("auth_session_id", "organization_id") REFERENCES "auth_sessions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exemption_applications" ADD CONSTRAINT "exemption_applications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exemption_applications" ADD CONSTRAINT "exemption_applications_semester_id_organization_id_fkey" FOREIGN KEY ("semester_id", "organization_id") REFERENCES "semesters"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exemption_applications" ADD CONSTRAINT "exemption_applications_student_id_organization_id_fkey" FOREIGN KEY ("student_id", "organization_id") REFERENCES "student_profiles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exemption_applications" ADD CONSTRAINT "exemption_applications_enrollment_id_semester_id_class_sec_fkey" FOREIGN KEY ("enrollment_id", "semester_id", "class_section_id", "student_id", "organization_id") REFERENCES "enrollments"("id", "semester_id", "class_section_id", "student_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exemption_applications" ADD CONSTRAINT "exemption_applications_class_section_id_semester_id_organi_fkey" FOREIGN KEY ("class_section_id", "semester_id", "organization_id") REFERENCES "class_sections"("id", "semester_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exemption_application_events" ADD CONSTRAINT "exemption_application_events_application_id_organization_i_fkey" FOREIGN KEY ("application_id", "organization_id") REFERENCES "exemption_applications"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exemption_application_events" ADD CONSTRAINT "exemption_application_events_actor_user_id_organization_id_fkey" FOREIGN KEY ("actor_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exemption_application_events" ADD CONSTRAINT "exemption_application_events_auth_session_id_organization__fkey" FOREIGN KEY ("auth_session_id", "organization_id") REFERENCES "auth_sessions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exemption_review_records" ADD CONSTRAINT "exemption_review_records_application_id_organization_id_fkey" FOREIGN KEY ("application_id", "organization_id") REFERENCES "exemption_applications"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exemption_review_records" ADD CONSTRAINT "exemption_review_records_teacher_id_organization_id_fkey" FOREIGN KEY ("teacher_id", "organization_id") REFERENCES "teacher_profiles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exemption_review_records" ADD CONSTRAINT "exemption_review_records_previous_review_id_organization_i_fkey" FOREIGN KEY ("previous_review_id", "organization_id") REFERENCES "exemption_review_records"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exemption_application_media" ADD CONSTRAINT "exemption_application_media_application_id_organization_id_fkey" FOREIGN KEY ("application_id", "organization_id") REFERENCES "exemption_applications"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exemption_application_media" ADD CONSTRAINT "exemption_application_media_media_id_organization_id_fkey" FOREIGN KEY ("media_id", "organization_id") REFERENCES "media_evidence"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sport_catalog_items" ADD CONSTRAINT "sport_catalog_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "location_privacy_policies" ADD CONSTRAINT "location_privacy_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "location_privacy_policies" ADD CONSTRAINT "location_privacy_policies_created_by_user_id_organization__fkey" FOREIGN KEY ("created_by_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "location_consents" ADD CONSTRAINT "location_consents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "location_consents" ADD CONSTRAINT "location_consents_student_id_organization_id_fkey" FOREIGN KEY ("student_id", "organization_id") REFERENCES "student_profiles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "location_consents" ADD CONSTRAINT "location_consents_policy_id_organization_id_fkey" FOREIGN KEY ("policy_id", "organization_id") REFERENCES "location_privacy_policies"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "location_consent_events" ADD CONSTRAINT "location_consent_events_consent_id_organization_id_fkey" FOREIGN KEY ("consent_id", "organization_id") REFERENCES "location_consents"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "location_consent_events" ADD CONSTRAINT "location_consent_events_actor_user_id_organization_id_fkey" FOREIGN KEY ("actor_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "location_consent_events" ADD CONSTRAINT "location_consent_events_auth_session_id_organization_id_fkey" FOREIGN KEY ("auth_session_id", "organization_id") REFERENCES "auth_sessions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "location_tracks" ADD CONSTRAINT "location_tracks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "location_tracks" ADD CONSTRAINT "location_tracks_session_id_enrollment_id_semester_id_class_fkey" FOREIGN KEY ("session_id", "enrollment_id", "semester_id", "class_section_id", "student_id", "organization_id") REFERENCES "exercise_sessions"("id", "enrollment_id", "semester_id", "class_section_id", "student_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "location_tracks" ADD CONSTRAINT "location_tracks_student_id_organization_id_fkey" FOREIGN KEY ("student_id", "organization_id") REFERENCES "student_profiles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "location_tracks" ADD CONSTRAINT "location_tracks_enrollment_id_semester_id_class_section_id_fkey" FOREIGN KEY ("enrollment_id", "semester_id", "class_section_id", "student_id", "organization_id") REFERENCES "enrollments"("id", "semester_id", "class_section_id", "student_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "location_tracks" ADD CONSTRAINT "location_tracks_semester_id_organization_id_fkey" FOREIGN KEY ("semester_id", "organization_id") REFERENCES "semesters"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "location_tracks" ADD CONSTRAINT "location_tracks_class_section_id_semester_id_organization__fkey" FOREIGN KEY ("class_section_id", "semester_id", "organization_id") REFERENCES "class_sections"("id", "semester_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "location_tracks" ADD CONSTRAINT "location_tracks_policy_id_organization_id_fkey" FOREIGN KEY ("policy_id", "organization_id") REFERENCES "location_privacy_policies"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "location_tracks" ADD CONSTRAINT "location_tracks_consent_id_organization_id_fkey" FOREIGN KEY ("consent_id", "organization_id") REFERENCES "location_consents"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "location_track_events" ADD CONSTRAINT "location_track_events_track_id_organization_id_fkey" FOREIGN KEY ("track_id", "organization_id") REFERENCES "location_tracks"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "location_track_events" ADD CONSTRAINT "location_track_events_actor_user_id_organization_id_fkey" FOREIGN KEY ("actor_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "location_track_events" ADD CONSTRAINT "location_track_events_auth_session_id_organization_id_fkey" FOREIGN KEY ("auth_session_id", "organization_id") REFERENCES "auth_sessions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "location_samples" ADD CONSTRAINT "location_samples_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "location_samples" ADD CONSTRAINT "location_samples_track_id_organization_id_fkey" FOREIGN KEY ("track_id", "organization_id") REFERENCES "location_tracks"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "location_sample_secrets" ADD CONSTRAINT "location_sample_secrets_sample_row_id_fkey" FOREIGN KEY ("sample_row_id") REFERENCES "location_samples"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "location_summaries" ADD CONSTRAINT "location_summaries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "location_summaries" ADD CONSTRAINT "location_summaries_track_id_organization_id_fkey" FOREIGN KEY ("track_id", "organization_id") REFERENCES "location_tracks"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "location_summaries" ADD CONSTRAINT "location_summaries_record_id_organization_id_fkey" FOREIGN KEY ("record_id", "organization_id") REFERENCES "exercise_records"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "location_retention_events" ADD CONSTRAINT "location_retention_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "location_retention_events" ADD CONSTRAINT "location_retention_events_track_id_organization_id_fkey" FOREIGN KEY ("track_id", "organization_id") REFERENCES "location_tracks"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Expand the closed audit action catalog without changing prior migrations.
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
      'SYSTEM_MODE_CHANGED', 'DATA_EXPORTED', 'AUDIT_LOG_READ',
      'AUTH_CHALLENGE_ISSUED', 'AUTH_CREDENTIAL_RECOVERED',
      'NOTIFICATION_CREATED', 'NOTIFICATION_READ', 'PUSH_DEVICE_REGISTERED',
      'PUSH_DEVICE_UNREGISTERED', 'USER_PREFERENCES_UPDATED', 'FEEDBACK_CREATED',
      'EXEMPTION_APPLICATION_CHANGED',
      'LOCATION_POLICY_CHANGED', 'LOCATION_CONSENT_CHANGED', 'LOCATION_TRACK_CHANGED',
      'LOCATION_RETENTION_APPLIED'
    )
  );

ALTER TABLE "student_sign_in_challenges"
  ADD CONSTRAINT "student_sign_in_challenges_channel_check" CHECK ("channel" IN ('EMAIL', 'PHONE')),
  ADD CONSTRAINT "student_sign_in_challenges_locale_check" CHECK ("locale" IN ('zh-CN', 'en')),
  ADD CONSTRAINT "student_sign_in_challenges_status_check" CHECK (
    "status" IN ('PENDING_DELIVERY', 'ACTIVE', 'CONSUMED', 'LOCKED', 'EXPIRED', 'DELIVERY_FAILED')
  ),
  ADD CONSTRAINT "student_sign_in_challenges_attempts_check" CHECK (
    "max_attempts" >= 1 AND "failed_attempts" BETWEEN 0 AND "max_attempts"
  ),
  ADD CONSTRAINT "student_sign_in_challenges_time_check" CHECK (
    "expires_at" > "requested_at"
    AND ("delivered_at" IS NULL OR "delivered_at" >= "requested_at")
    AND ("consumed_at" IS NULL OR "consumed_at" >= "requested_at")
  ),
  ADD CONSTRAINT "student_sign_in_challenges_consumed_shape_check" CHECK (
    ("status" = 'CONSUMED') = ("consumed_at" IS NOT NULL)
  ),
  ADD CONSTRAINT "student_sign_in_challenges_result_shape_check" CHECK (
    ("result_ciphertext" IS NULL) = ("result_key_version" IS NULL)
    AND ("result_ciphertext" IS NULL) = ("result_replay_expires_at" IS NULL)
    AND ("result_ciphertext" IS NULL OR "auth_session_id" IS NOT NULL)
  );

ALTER TABLE "account_recovery_challenges"
  ADD CONSTRAINT "account_recovery_challenges_role_check" CHECK ("requested_role" IN ('STUDENT', 'TEACHER', 'ADMIN')),
  ADD CONSTRAINT "account_recovery_challenges_channel_check" CHECK ("channel" IN ('EMAIL', 'PHONE')),
  ADD CONSTRAINT "account_recovery_challenges_locale_check" CHECK ("locale" IN ('zh-CN', 'en')),
  ADD CONSTRAINT "account_recovery_challenges_status_check" CHECK (
    "status" IN ('PENDING_DELIVERY', 'ACTIVE', 'CONSUMED', 'LOCKED', 'EXPIRED', 'DELIVERY_FAILED')
  ),
  ADD CONSTRAINT "account_recovery_challenges_attempts_check" CHECK (
    "max_attempts" >= 1 AND "failed_attempts" BETWEEN 0 AND "max_attempts"
  ),
  ADD CONSTRAINT "account_recovery_challenges_time_check" CHECK (
    "expires_at" > "requested_at"
    AND ("delivered_at" IS NULL OR "delivered_at" >= "requested_at")
    AND ("consumed_at" IS NULL OR "consumed_at" >= "requested_at")
  ),
  ADD CONSTRAINT "account_recovery_challenges_consumed_shape_check" CHECK (
    ("status" = 'CONSUMED') = ("consumed_at" IS NOT NULL)
  );

ALTER TABLE "auth_rate_limit_facts"
  ADD CONSTRAINT "auth_rate_limit_facts_purpose_check" CHECK ("purpose" IN ('STUDENT_SIGN_IN', 'ACCOUNT_RECOVERY')),
  ADD CONSTRAINT "auth_rate_limit_facts_scope_type_check" CHECK ("scope_type" IN ('ACCOUNT', 'SOURCE'));

ALTER TABLE "app_release_policies"
  ADD CONSTRAINT "app_release_policies_platform_check" CHECK ("platform" IN ('ANDROID', 'WEB', 'IOS')),
  ADD CONSTRAINT "app_release_policies_enforcement_check" CHECK ("enforcement" IN ('NONE', 'RECOMMENDED', 'REQUIRED')),
  ADD CONSTRAINT "app_release_policies_time_check" CHECK ("expires_at" IS NULL OR "expires_at" > "effective_at"),
  ADD CONSTRAINT "app_release_policies_download_url_check" CHECK ("download_url" IS NULL OR "download_url" ~* '^https://');

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_target_shape_check" CHECK (("target_type" IS NULL) = ("target_id" IS NULL)),
  ADD CONSTRAINT "notifications_version_check" CHECK ("version" >= 1);

ALTER TABLE "notification_events"
  ADD CONSTRAINT "notification_events_type_check" CHECK ("event_type" IN ('CREATED', 'READ')),
  ADD CONSTRAINT "notification_events_version_check" CHECK ("event_version" >= 1);

ALTER TABLE "push_devices"
  ADD CONSTRAINT "push_devices_platform_check" CHECK ("platform" IN ('ANDROID', 'WEB', 'IOS')),
  ADD CONSTRAINT "push_devices_locale_check" CHECK ("locale" IN ('zh-CN', 'en')),
  ADD CONSTRAINT "push_devices_status_check" CHECK ("status" IN ('ACTIVE', 'REVOKED')),
  ADD CONSTRAINT "push_devices_state_shape_check" CHECK (
    (("status" = 'ACTIVE') AND "revoked_at" IS NULL AND "registration_token_ciphertext" IS NOT NULL)
    OR (("status" = 'REVOKED') AND "revoked_at" IS NOT NULL AND "registration_token_ciphertext" IS NULL)
  ),
  ADD CONSTRAINT "push_devices_version_check" CHECK ("version" >= 1);

ALTER TABLE "push_device_events"
  ADD CONSTRAINT "push_device_events_type_check" CHECK ("event_type" IN ('REGISTERED', 'REFRESHED', 'REVOKED')),
  ADD CONSTRAINT "push_device_events_version_check" CHECK ("event_version" >= 1);

ALTER TABLE "user_preferences"
  ADD CONSTRAINT "user_preferences_locale_check" CHECK ("locale" IN ('zh-CN', 'en')),
  ADD CONSTRAINT "user_preferences_version_check" CHECK ("version" >= 1);

ALTER TABLE "user_preference_events"
  ADD CONSTRAINT "user_preference_events_version_check" CHECK ("event_version" >= 1),
  ADD CONSTRAINT "user_preference_events_changed_fields_check" CHECK (
    cardinality("changed_fields") BETWEEN 1 AND 3
    AND "changed_fields" <@ ARRAY['locale', 'pushEnabled', 'emailEnabled']::VARCHAR(32)[]
  );

ALTER TABLE "help_articles"
  ADD CONSTRAINT "help_articles_locale_check" CHECK ("locale" IN ('zh-CN', 'en')),
  ADD CONSTRAINT "help_articles_status_check" CHECK ("status" IN ('DRAFT', 'PUBLISHED', 'WITHDRAWN')),
  ADD CONSTRAINT "help_articles_active_content_check" CHECK (
    "body_markdown" !~ '<' AND "body_markdown" !~* 'javascript:|data:text/html|https?://'
  );

ALTER TABLE "feedback"
  ADD CONSTRAINT "feedback_category_check" CHECK ("category" IN ('BUG', 'SUGGESTION', 'ACCESSIBILITY', 'PRIVACY', 'OTHER')),
  ADD CONSTRAINT "feedback_status_check" CHECK ("status" IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
  ADD CONSTRAINT "feedback_platform_check" CHECK ("client_platform" IS NULL OR "client_platform" IN ('ANDROID', 'WEB', 'IOS')),
  ADD CONSTRAINT "feedback_version_check" CHECK ("version" >= 1);

ALTER TABLE "feedback_events"
  ADD CONSTRAINT "feedback_events_type_check" CHECK ("event_type" IN ('CREATED', 'STATUS_CHANGED', 'REPLIED')),
  ADD CONSTRAINT "feedback_events_version_check" CHECK ("event_version" >= 1);

ALTER TABLE "exemption_applications"
  ADD CONSTRAINT "exemption_applications_type_check" CHECK (
    "application_type" IN ('PHYSICAL_TEST', 'EXERCISE_CHECK_IN', 'SPECIAL_CIRCUMSTANCE')
  ),
  ADD CONSTRAINT "exemption_applications_status_check" CHECK (
    "status" IN ('DRAFT', 'SUBMITTED', 'SUPPLEMENT_REQUIRED', 'APPROVED', 'REJECTED')
  ),
  ADD CONSTRAINT "exemption_applications_time_shape_check" CHECK (
    ("status" = 'DRAFT' AND "submitted_at" IS NULL AND "decided_at" IS NULL)
    OR ("status" IN ('SUBMITTED', 'SUPPLEMENT_REQUIRED') AND "submitted_at" IS NOT NULL AND "decided_at" IS NULL)
    OR ("status" IN ('APPROVED', 'REJECTED') AND "submitted_at" IS NOT NULL AND "decided_at" IS NOT NULL)
  ),
  ADD CONSTRAINT "exemption_applications_version_check" CHECK ("version" >= 1);

ALTER TABLE "exemption_application_events"
  ADD CONSTRAINT "exemption_application_events_type_check" CHECK ("event_type" IN ('CREATED', 'UPDATED', 'SUBMITTED', 'REVIEWED')),
  ADD CONSTRAINT "exemption_application_events_status_check" CHECK (
    "to_status" IN ('DRAFT', 'SUBMITTED', 'SUPPLEMENT_REQUIRED', 'APPROVED', 'REJECTED')
    AND ("from_status" IS NULL OR "from_status" IN ('DRAFT', 'SUBMITTED', 'SUPPLEMENT_REQUIRED', 'APPROVED', 'REJECTED'))
  ),
  ADD CONSTRAINT "exemption_application_events_version_check" CHECK ("event_version" >= 1);

ALTER TABLE "exemption_review_records"
  ADD CONSTRAINT "exemption_review_records_decision_check" CHECK ("decision" IN ('APPROVE', 'REJECT', 'REQUEST_SUPPLEMENT')),
  ADD CONSTRAINT "exemption_review_records_version_check" CHECK ("review_version" >= 1);

ALTER TABLE "exemption_application_media"
  ADD CONSTRAINT "exemption_application_media_position_check" CHECK ("position" BETWEEN 0 AND 19);

ALTER TABLE "sport_catalog_items"
  ADD CONSTRAINT "sport_catalog_items_type_check" CHECK ("sport_type" ~ '^[A-Z][A-Z0-9_]*$'),
  ADD CONSTRAINT "sport_catalog_items_version_check" CHECK ("version" >= 1);

ALTER TABLE "location_privacy_policies"
  ADD CONSTRAINT "location_privacy_policies_purpose_check" CHECK ("purpose_code" = 'EXERCISE_EVIDENCE'),
  ADD CONSTRAINT "location_privacy_policies_parameter_check" CHECK (
    (NOT "collection_enabled")
    OR (
      "sample_interval_seconds" >= 1
      AND "maximum_accuracy_meters" >= 1
      AND "raw_retention_days" >= 0
      AND "coarse_retention_days" >= "raw_retention_days"
      AND "coarse_projection_meters" >= 1
      AND "revocation_disposition" IN ('DELETE_RAW', 'DELETE_ALL', 'RETAIN_UNTIL_EXPIRY')
    )
  ),
  ADD CONSTRAINT "location_privacy_policies_background_check" CHECK (NOT "background_collection_enabled" OR "collection_enabled"),
  ADD CONSTRAINT "location_privacy_policies_version_check" CHECK ("version" >= 1);

ALTER TABLE "location_consents"
  ADD CONSTRAINT "location_consents_purpose_check" CHECK ("purpose_code" = 'EXERCISE_EVIDENCE'),
  ADD CONSTRAINT "location_consents_status_check" CHECK ("status" IN ('ACTIVE', 'REVOKED')),
  ADD CONSTRAINT "location_consents_state_shape_check" CHECK (("status" = 'REVOKED') = ("revoked_at" IS NOT NULL)),
  ADD CONSTRAINT "location_consents_version_check" CHECK ("version" >= 1);

ALTER TABLE "location_consent_events"
  ADD CONSTRAINT "location_consent_events_type_check" CHECK ("event_type" IN ('CONSENTED', 'REVOKED')),
  ADD CONSTRAINT "location_consent_events_version_check" CHECK ("event_version" >= 1);

ALTER TABLE "location_tracks"
  ADD CONSTRAINT "location_tracks_status_check" CHECK ("status" IN ('COLLECTING', 'FINALIZED', 'INTERRUPTED', 'REJECTED', 'DELETED')),
  ADD CONSTRAINT "location_tracks_counts_check" CHECK ("accepted_sample_count" >= 0 AND "rejected_sample_count" >= 0),
  ADD CONSTRAINT "location_tracks_time_check" CHECK (
    "raw_expires_at" >= "started_at"
    AND ("last_observed_at" IS NULL OR "last_observed_at" >= "started_at")
    AND ("finalized_at" IS NULL OR "finalized_at" >= "started_at")
    AND ("interrupted_at" IS NULL OR "interrupted_at" >= "started_at")
    AND ("deleted_at" IS NULL OR "deleted_at" >= "started_at")
  ),
  ADD CONSTRAINT "location_tracks_state_shape_check" CHECK (
    ("status" = 'COLLECTING' AND "finalized_at" IS NULL AND "interrupted_at" IS NULL AND "deleted_at" IS NULL)
    OR ("status" = 'FINALIZED' AND "finalized_at" IS NOT NULL AND "interrupted_at" IS NULL AND "deleted_at" IS NULL)
    OR ("status" IN ('INTERRUPTED', 'REJECTED') AND "interrupted_at" IS NOT NULL AND "deleted_at" IS NULL)
    OR ("status" = 'DELETED' AND "deleted_at" IS NOT NULL)
  ),
  ADD CONSTRAINT "location_tracks_version_check" CHECK ("version" >= 1);

ALTER TABLE "location_track_events"
  ADD CONSTRAINT "location_track_events_type_check" CHECK ("event_type" IN ('STARTED', 'SAMPLES_APPENDED', 'FINALIZED', 'INTERRUPTED', 'REJECTED', 'DELETED')),
  ADD CONSTRAINT "location_track_events_status_check" CHECK (
    "to_status" IN ('COLLECTING', 'FINALIZED', 'INTERRUPTED', 'REJECTED', 'DELETED')
    AND ("from_status" IS NULL OR "from_status" IN ('COLLECTING', 'FINALIZED', 'INTERRUPTED', 'REJECTED'))
  ),
  ADD CONSTRAINT "location_track_events_counts_check" CHECK ("accepted_sample_count" >= 0 AND "rejected_sample_count" >= 0),
  ADD CONSTRAINT "location_track_events_version_check" CHECK ("event_version" >= 1);

ALTER TABLE "location_samples"
  ADD CONSTRAINT "location_samples_accuracy_check" CHECK ("accuracy_meters" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "location_samples_time_check" CHECK ("raw_expires_at" >= "observed_at" AND "accepted_at" >= "observed_at");

ALTER TABLE "location_sample_secrets"
  ADD CONSTRAINT "location_sample_secrets_ciphertext_check" CHECK (octet_length("ciphertext") BETWEEN 32 AND 16384),
  ADD CONSTRAINT "location_sample_secrets_key_version_check" CHECK ("key_version" >= 1);

ALTER TABLE "location_summaries"
  ADD CONSTRAINT "location_summaries_availability_check" CHECK (
    "availability" IN ('NOT_COLLECTED', 'PROCESSING', 'AVAILABLE', 'EXPIRED', 'WITHHELD')
  ),
  ADD CONSTRAINT "location_summaries_distance_check" CHECK ("coarse_distance_meters" IS NULL OR "coarse_distance_meters" >= 0),
  ADD CONSTRAINT "location_summaries_available_shape_check" CHECK (
    ("availability" = 'AVAILABLE') = (
      "coarse_route_polyline" IS NOT NULL
      AND "coarse_distance_meters" IS NOT NULL
      AND "observed_start_at" IS NOT NULL
      AND "observed_end_at" IS NOT NULL
      AND "expires_at" IS NOT NULL
      AND "policy_version" IS NOT NULL
    )
  ),
  ADD CONSTRAINT "location_summaries_version_check" CHECK ("version" >= 1);

ALTER TABLE "location_retention_events"
  ADD CONSTRAINT "location_retention_events_data_class_check" CHECK ("data_class" IN ('RAW', 'COARSE')),
  ADD CONSTRAINT "location_retention_events_count_check" CHECK ("deleted_row_count" >= 0);

CREATE FUNCTION reject_stage21_append_only_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'append-only Stage 21 history cannot be changed';
END;
$$;

CREATE FUNCTION reject_stage21_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'sensitive Stage 21 rows cannot be updated';
END;
$$;

CREATE FUNCTION guard_notification_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'notifications cannot be deleted before retention policy approval';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."organization_id" IS DISTINCT FROM OLD."organization_id"
    OR NEW."recipient_user_id" IS DISTINCT FROM OLD."recipient_user_id"
    OR NEW."notification_type" IS DISTINCT FROM OLD."notification_type"
    OR NEW."title" IS DISTINCT FROM OLD."title"
    OR NEW."body" IS DISTINCT FROM OLD."body"
    OR NEW."target_type" IS DISTINCT FROM OLD."target_type"
    OR NEW."target_id" IS DISTINCT FROM OLD."target_id"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'notification scope and content are immutable';
  END IF;
  IF OLD."read_at" IS NOT NULL OR NEW."read_at" IS NULL
    OR NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'notification update must be one unread-to-read version transition';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION guard_push_device_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'push devices cannot be deleted before retention policy approval';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."organization_id" IS DISTINCT FROM OLD."organization_id"
    OR NEW."user_id" IS DISTINCT FROM OLD."user_id"
    OR NEW."registered_at" IS DISTINCT FROM OLD."registered_at"
    OR NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'push device scope is immutable and version must increase by one';
  END IF;
  IF OLD."status" <> 'ACTIVE' THEN
    RAISE EXCEPTION 'revoked push devices are immutable';
  END IF;
  IF NEW."status" = 'ACTIVE' THEN
    IF NEW."registration_token_hash" IS DISTINCT FROM OLD."registration_token_hash"
      OR NEW."registration_token_ciphertext" IS NULL
      OR NEW."revoked_at" IS NOT NULL THEN
      RAISE EXCEPTION 'active push refresh has an invalid shape';
    END IF;
  ELSIF NEW."status" = 'REVOKED' THEN
    IF NEW."registration_token_hash" IS NOT DISTINCT FROM OLD."registration_token_hash"
      OR NEW."registration_token_ciphertext" IS NOT NULL
      OR NEW."revoked_at" IS NULL THEN
      RAISE EXCEPTION 'push revocation must tombstone token material';
    END IF;
  ELSE
    RAISE EXCEPTION 'unsupported push device transition';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION guard_user_preference_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'user preferences cannot be deleted';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."organization_id" IS DISTINCT FROM OLD."organization_id"
    OR NEW."user_id" IS DISTINCT FROM OLD."user_id"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
    OR NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'user preference scope is immutable and version must increase by one';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION reject_feedback_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'feedback mutation is unavailable until workflow approval';
END;
$$;

CREATE TRIGGER app_release_policies_append_only_trigger
  BEFORE UPDATE OR DELETE ON "app_release_policies"
  FOR EACH ROW EXECUTE FUNCTION reject_stage21_append_only_mutation();
CREATE TRIGGER notifications_guard_trigger
  BEFORE UPDATE OR DELETE ON "notifications"
  FOR EACH ROW EXECUTE FUNCTION guard_notification_mutation();
CREATE TRIGGER notification_events_append_only_trigger
  BEFORE UPDATE OR DELETE ON "notification_events"
  FOR EACH ROW EXECUTE FUNCTION reject_stage21_append_only_mutation();
CREATE TRIGGER push_device_events_append_only_trigger
  BEFORE UPDATE OR DELETE ON "push_device_events"
  FOR EACH ROW EXECUTE FUNCTION reject_stage21_append_only_mutation();
CREATE TRIGGER push_devices_guard_trigger
  BEFORE UPDATE OR DELETE ON "push_devices"
  FOR EACH ROW EXECUTE FUNCTION guard_push_device_mutation();
CREATE TRIGGER user_preference_events_append_only_trigger
  BEFORE UPDATE OR DELETE ON "user_preference_events"
  FOR EACH ROW EXECUTE FUNCTION reject_stage21_append_only_mutation();
CREATE TRIGGER user_preferences_guard_trigger
  BEFORE UPDATE OR DELETE ON "user_preferences"
  FOR EACH ROW EXECUTE FUNCTION guard_user_preference_mutation();
CREATE TRIGGER feedback_events_append_only_trigger
  BEFORE UPDATE OR DELETE ON "feedback_events"
  FOR EACH ROW EXECUTE FUNCTION reject_stage21_append_only_mutation();
CREATE TRIGGER feedback_guard_trigger
  BEFORE UPDATE OR DELETE ON "feedback"
  FOR EACH ROW EXECUTE FUNCTION reject_feedback_mutation();
CREATE TRIGGER exemption_application_events_append_only_trigger
  BEFORE UPDATE OR DELETE ON "exemption_application_events"
  FOR EACH ROW EXECUTE FUNCTION reject_stage21_append_only_mutation();
CREATE TRIGGER exemption_review_records_append_only_trigger
  BEFORE UPDATE OR DELETE ON "exemption_review_records"
  FOR EACH ROW EXECUTE FUNCTION reject_stage21_append_only_mutation();
CREATE TRIGGER location_privacy_policies_append_only_trigger
  BEFORE UPDATE OR DELETE ON "location_privacy_policies"
  FOR EACH ROW EXECUTE FUNCTION reject_stage21_append_only_mutation();
CREATE TRIGGER location_consent_events_append_only_trigger
  BEFORE UPDATE OR DELETE ON "location_consent_events"
  FOR EACH ROW EXECUTE FUNCTION reject_stage21_append_only_mutation();
CREATE TRIGGER location_track_events_append_only_trigger
  BEFORE UPDATE OR DELETE ON "location_track_events"
  FOR EACH ROW EXECUTE FUNCTION reject_stage21_append_only_mutation();
CREATE TRIGGER location_retention_events_append_only_trigger
  BEFORE UPDATE OR DELETE ON "location_retention_events"
  FOR EACH ROW EXECUTE FUNCTION reject_stage21_append_only_mutation();
CREATE TRIGGER location_samples_no_update_trigger
  BEFORE UPDATE ON "location_samples"
  FOR EACH ROW EXECUTE FUNCTION reject_stage21_update();
CREATE TRIGGER location_sample_secrets_no_update_trigger
  BEFORE UPDATE ON "location_sample_secrets"
  FOR EACH ROW EXECUTE FUNCTION reject_stage21_update();

CREATE FUNCTION guard_exemption_application_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."organization_id" <> OLD."organization_id"
    OR NEW."semester_id" <> OLD."semester_id"
    OR NEW."student_id" <> OLD."student_id"
    OR NEW."enrollment_id" <> OLD."enrollment_id"
    OR NEW."class_section_id" <> OLD."class_section_id"
    OR NEW."application_type" <> OLD."application_type" THEN
    RAISE EXCEPTION 'exemption application scope is immutable';
  END IF;
  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'exemption application version must increase by one';
  END IF;
  IF NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" IN ('DRAFT', 'SUBMITTED'))
    OR (OLD."status" = 'SUPPLEMENT_REQUIRED' AND NEW."status" IN ('SUPPLEMENT_REQUIRED', 'SUBMITTED'))
    OR (OLD."status" = 'SUBMITTED' AND NEW."status" IN ('SUPPLEMENT_REQUIRED', 'APPROVED', 'REJECTED'))
  ) THEN
    RAISE EXCEPTION 'unsupported exemption application transition';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER exemption_applications_mutation_guard_trigger
  BEFORE UPDATE ON "exemption_applications"
  FOR EACH ROW EXECUTE FUNCTION guard_exemption_application_mutation();

CREATE FUNCTION guard_location_consent_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."organization_id" <> OLD."organization_id"
    OR NEW."student_id" <> OLD."student_id"
    OR NEW."purpose_code" <> OLD."purpose_code" THEN
    RAISE EXCEPTION 'location consent scope is immutable';
  END IF;
  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'location consent version must increase by one';
  END IF;
  IF NOT (
    (OLD."status" = 'ACTIVE' AND NEW."status" IN ('ACTIVE', 'REVOKED'))
    OR (OLD."status" = 'REVOKED' AND NEW."status" = 'ACTIVE')
  ) THEN
    RAISE EXCEPTION 'unsupported location consent transition';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER location_consents_mutation_guard_trigger
  BEFORE UPDATE ON "location_consents"
  FOR EACH ROW EXECUTE FUNCTION guard_location_consent_mutation();

CREATE FUNCTION guard_location_track_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."organization_id" <> OLD."organization_id"
    OR NEW."session_id" <> OLD."session_id"
    OR NEW."student_id" <> OLD."student_id"
    OR NEW."enrollment_id" <> OLD."enrollment_id"
    OR NEW."class_section_id" <> OLD."class_section_id"
    OR NEW."semester_id" <> OLD."semester_id"
    OR NEW."policy_id" <> OLD."policy_id"
    OR NEW."policy_version" <> OLD."policy_version"
    OR NEW."consent_id" <> OLD."consent_id" THEN
    RAISE EXCEPTION 'location track scope and policy are immutable';
  END IF;
  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'location track version must increase by one';
  END IF;
  IF NOT (
    (OLD."status" = 'COLLECTING' AND NEW."status" IN ('COLLECTING', 'FINALIZED', 'INTERRUPTED', 'REJECTED', 'DELETED'))
    OR (OLD."status" IN ('FINALIZED', 'INTERRUPTED', 'REJECTED') AND NEW."status" = 'DELETED')
  ) THEN
    RAISE EXCEPTION 'unsupported location track transition';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER location_tracks_mutation_guard_trigger
  BEFORE UPDATE ON "location_tracks"
  FOR EACH ROW EXECUTE FUNCTION guard_location_track_mutation();
