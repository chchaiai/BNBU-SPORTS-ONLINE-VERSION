-- Shared fixed-window counters for authentication and public QR join protection.
-- Scope values are keyed HMAC digests; raw credentials, tokens, IP addresses,
-- student identifiers, email addresses, and phone numbers are never stored.

CREATE TABLE "rate_limit_windows" (
  "purpose" VARCHAR(32) NOT NULL,
  "scope_digest" CHAR(64) NOT NULL,
  "count" INTEGER NOT NULL,
  "reset_at" TIMESTAMPTZ(6) NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "rate_limit_windows_pkey" PRIMARY KEY ("purpose", "scope_digest"),
  CONSTRAINT "rate_limit_windows_purpose_check"
    CHECK ("purpose" IN ('AUTHENTICATION', 'QR_JOIN')),
  CONSTRAINT "rate_limit_windows_scope_digest_check"
    CHECK ("scope_digest" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "rate_limit_windows_count_check" CHECK ("count" >= 1),
  CONSTRAINT "rate_limit_windows_time_check" CHECK ("reset_at" > "updated_at")
);

CREATE INDEX "rate_limit_windows_reset_at_idx"
  ON "rate_limit_windows"("reset_at");
