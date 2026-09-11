-- Email-only authentication and verified email binding.
-- Legacy phone columns and historical PHONE challenges remain untouched for audit retention,
-- but the application no longer maps, reads, writes, or exposes them.

ALTER TABLE "users" DROP CONSTRAINT "users_status_check";
ALTER TABLE "users"
  ADD CONSTRAINT "users_status_check"
  CHECK ("status" IN ('PENDING_CONTACT_BINDING', 'ACTIVE', 'LOCKED', 'DISABLED'));

CREATE TABLE "email_verification_challenges" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "mode" VARCHAR(16) NOT NULL,
  "locale" VARCHAR(16) NOT NULL,
  "target_email" VARCHAR(254) NOT NULL,
  "target_email_normalized" VARCHAR(254) NOT NULL,
  "current_email_code_digest" CHAR(64),
  "new_email_code_digest" CHAR(64) NOT NULL,
  "code_key_version" INTEGER NOT NULL,
  "status" VARCHAR(24) NOT NULL,
  "failed_attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL,
  "expected_user_version" INTEGER NOT NULL,
  "requested_at" TIMESTAMPTZ(6) NOT NULL,
  "delivered_at" TIMESTAMPTZ(6),
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  "request_id" VARCHAR(64) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "email_verification_challenges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_verification_challenges_id_organization_key" UNIQUE ("id", "organization_id"),
  CONSTRAINT "email_verification_challenges_organization_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "email_verification_challenges_user_fkey"
    FOREIGN KEY ("user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT,
  CONSTRAINT "email_verification_challenges_mode_check"
    CHECK ("mode" IN ('FIRST_BIND', 'REBIND')),
  CONSTRAINT "email_verification_challenges_locale_check"
    CHECK ("locale" IN ('zh-CN', 'en')),
  CONSTRAINT "email_verification_challenges_status_check"
    CHECK ("status" IN ('PENDING_DELIVERY', 'ACTIVE', 'FAILED', 'CONSUMED', 'EXPIRED', 'LOCKED')),
  CONSTRAINT "email_verification_challenges_attempts_check"
    CHECK ("failed_attempts" >= 0 AND "max_attempts" > 0 AND "failed_attempts" <= "max_attempts"),
  CONSTRAINT "email_verification_challenges_version_check" CHECK ("version" > 0),
  CONSTRAINT "email_verification_challenges_user_version_check" CHECK ("expected_user_version" > 0),
  CONSTRAINT "email_verification_challenges_time_check" CHECK ("expires_at" > "requested_at"),
  CONSTRAINT "email_verification_challenges_mode_code_check"
    CHECK (
      ("mode" = 'FIRST_BIND' AND "current_email_code_digest" IS NULL) OR
      ("mode" = 'REBIND' AND "current_email_code_digest" IS NOT NULL)
    )
);

CREATE INDEX "email_verification_challenges_user_requested_idx"
  ON "email_verification_challenges"("organization_id", "user_id", "requested_at");

CREATE INDEX "email_verification_challenges_status_expires_idx"
  ON "email_verification_challenges"("status", "expires_at");
