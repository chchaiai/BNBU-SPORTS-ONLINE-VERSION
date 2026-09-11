-- Migration: 0009_score
-- Authority: approved Stage 18 Score contract dated 2026-08-04.
-- Scope: ClassSection ScoreRule, immutable score revisions/contributions,
-- dual approvals, publication history, and durable recalculation attempts.

-- CreateTable
CREATE TABLE "score_rules" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "class_section_id" UUID NOT NULL,
    "semester_id" UUID NOT NULL,
    "rule_code" VARCHAR(64) NOT NULL,
    "rule_version" INTEGER NOT NULL,
    "display_name" VARCHAR(200) NOT NULL,
    "total_required_seconds" BIGINT NOT NULL DEFAULT 72000,
    "calculation_definition" JSONB NOT NULL,
    "rounding_mode" VARCHAR(16) NOT NULL DEFAULT 'HALF_UP',
    "rounding_scale" INTEGER NOT NULL DEFAULT 2,
    "status" VARCHAR(32) NOT NULL,
    "created_by" UUID NOT NULL,
    "submitted_at" TIMESTAMPTZ(6),
    "activated_at" TIMESTAMPTZ(6),
    "superseded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "score_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_rule_approval_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "score_rule_id" UUID NOT NULL,
    "action" VARCHAR(16) NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "reason" VARCHAR(500),
    "request_id" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "score_rule_approval_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_scores" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "semester_id" UUID NOT NULL,
    "class_section_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "current_working_revision_id" UUID,
    "published_revision_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "student_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_score_revisions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_score_id" UUID NOT NULL,
    "score_rule_id" UUID NOT NULL,
    "calculation_revision" INTEGER NOT NULL,
    "total_valid_credited_seconds" BIGINT NOT NULL,
    "scoring_seconds" BIGINT NOT NULL,
    "excess_seconds" BIGINT NOT NULL,
    "qualification_status" VARCHAR(32) NOT NULL,
    "calculated_score" DECIMAL(5,2) NOT NULL,
    "adjusted_score" DECIMAL(5,2) NOT NULL,
    "final_score" DECIMAL(5,2) NOT NULL,
    "source_fingerprint" CHAR(64) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "calculated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "student_score_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_contributions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_score_revision_id" UUID NOT NULL,
    "record_id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "score_rule_id" UUID NOT NULL,
    "credit_type" VARCHAR(32) NOT NULL,
    "contribution_seconds" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "score_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_adjustments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_score_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "adjustment_type" VARCHAR(32) NOT NULL,
    "adjustment_value" DECIMAL(6,2) NOT NULL,
    "reason_code" VARCHAR(64) NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "evidence_reference" VARCHAR(256) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "requested_by" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL,
    "decided_at" TIMESTAMPTZ(6),
    "request_id" VARCHAR(64) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "score_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_adjustment_approval_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "score_adjustment_id" UUID NOT NULL,
    "action" VARCHAR(16) NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "reason" VARCHAR(500),
    "request_id" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "score_adjustment_approval_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_publication_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_score_id" UUID NOT NULL,
    "student_score_revision_id" UUID NOT NULL,
    "action" VARCHAR(16) NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "request_id" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "score_publication_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_recalculation_attempts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "student_score_id" UUID NOT NULL,
    "score_rule_id" UUID NOT NULL,
    "source_fingerprint" CHAR(64) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(6) NOT NULL,
    "locked_at" TIMESTAMPTZ(6),
    "locked_by" VARCHAR(128),
    "last_error_code" VARCHAR(64),
    "processed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "score_recalculation_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "score_rules_section_status_version_idx" ON "score_rules"("organization_id", "class_section_id", "status", "rule_version");

-- CreateIndex
CREATE UNIQUE INDEX "score_rules_id_organization_id_key" ON "score_rules"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "score_rules_section_version_key" ON "score_rules"("class_section_id", "rule_version");

-- CreateIndex
CREATE INDEX "score_rule_approval_events_rule_created_idx" ON "score_rule_approval_events"("organization_id", "score_rule_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "score_rule_approval_events_actor_action_key" ON "score_rule_approval_events"("score_rule_id", "actor_user_id", "action");

-- CreateIndex
CREATE UNIQUE INDEX "student_scores_enrollment_id_key" ON "student_scores"("enrollment_id");

-- CreateIndex
CREATE INDEX "student_scores_section_updated_idx" ON "student_scores"("organization_id", "class_section_id", "updated_at", "id");

-- CreateIndex
CREATE INDEX "student_scores_student_updated_idx" ON "student_scores"("organization_id", "student_id", "updated_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "student_scores_id_organization_id_key" ON "student_scores"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_scores_enrollment_scope_key" ON "student_scores"("enrollment_id", "semester_id", "class_section_id", "student_id", "organization_id");

-- CreateIndex
CREATE INDEX "student_score_revisions_score_calculated_idx" ON "student_score_revisions"("organization_id", "student_score_id", "calculated_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "student_score_revisions_id_score_organization_key" ON "student_score_revisions"("id", "student_score_id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_score_revisions_id_organization_id_key" ON "student_score_revisions"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_score_revisions_score_revision_key" ON "student_score_revisions"("student_score_id", "calculation_revision");

-- CreateIndex
CREATE UNIQUE INDEX "student_score_revisions_source_key" ON "student_score_revisions"("student_score_id", "score_rule_id", "source_fingerprint");

-- CreateIndex
CREATE INDEX "score_contributions_revision_created_idx" ON "score_contributions"("organization_id", "student_score_revision_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "score_contributions_revision_record_key" ON "score_contributions"("student_score_revision_id", "record_id");

-- CreateIndex
CREATE INDEX "score_adjustments_score_requested_idx" ON "score_adjustments"("organization_id", "student_score_id", "requested_at", "id");

-- CreateIndex
CREATE INDEX "score_adjustments_status_requested_idx" ON "score_adjustments"("organization_id", "status", "requested_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "score_adjustments_id_organization_id_key" ON "score_adjustments"("id", "organization_id");

-- CreateIndex
CREATE INDEX "score_adjustment_approval_events_adjustment_created_idx" ON "score_adjustment_approval_events"("organization_id", "score_adjustment_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "score_adjustment_approval_events_actor_action_key" ON "score_adjustment_approval_events"("score_adjustment_id", "actor_user_id", "action");

-- CreateIndex
CREATE INDEX "score_publication_events_score_created_idx" ON "score_publication_events"("organization_id", "student_score_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "score_publication_events_score_revision_action_key" ON "score_publication_events"("student_score_id", "student_score_revision_id", "action");

-- CreateIndex
CREATE INDEX "score_recalculation_attempts_claim_idx" ON "score_recalculation_attempts"("status", "available_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "score_recalculation_attempts_source_key" ON "score_recalculation_attempts"("student_score_id", "score_rule_id", "source_fingerprint");

-- AddForeignKey
ALTER TABLE "score_rules" ADD CONSTRAINT "score_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_rules" ADD CONSTRAINT "score_rules_class_section_scope_fkey" FOREIGN KEY ("class_section_id", "semester_id", "organization_id") REFERENCES "class_sections"("id", "semester_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_rules" ADD CONSTRAINT "score_rules_semester_id_organization_id_fkey" FOREIGN KEY ("semester_id", "organization_id") REFERENCES "semesters"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_rules" ADD CONSTRAINT "score_rules_created_by_organization_id_fkey" FOREIGN KEY ("created_by", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_rule_approval_events" ADD CONSTRAINT "score_rule_approval_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_rule_approval_events" ADD CONSTRAINT "score_rule_approval_events_score_rule_id_organization_id_fkey" FOREIGN KEY ("score_rule_id", "organization_id") REFERENCES "score_rules"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_rule_approval_events" ADD CONSTRAINT "score_rule_approval_events_actor_user_id_organization_id_fkey" FOREIGN KEY ("actor_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_scores" ADD CONSTRAINT "student_scores_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_scores" ADD CONSTRAINT "student_scores_semester_id_organization_id_fkey" FOREIGN KEY ("semester_id", "organization_id") REFERENCES "semesters"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_scores" ADD CONSTRAINT "student_scores_class_section_scope_fkey" FOREIGN KEY ("class_section_id", "semester_id", "organization_id") REFERENCES "class_sections"("id", "semester_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_scores" ADD CONSTRAINT "student_scores_student_id_organization_id_fkey" FOREIGN KEY ("student_id", "organization_id") REFERENCES "student_profiles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_scores" ADD CONSTRAINT "student_scores_enrollment_scope_fkey" FOREIGN KEY ("enrollment_id", "semester_id", "class_section_id", "student_id", "organization_id") REFERENCES "enrollments"("id", "semester_id", "class_section_id", "student_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_scores" ADD CONSTRAINT "student_scores_current_working_revision_id_id_organization_fkey" FOREIGN KEY ("current_working_revision_id", "id", "organization_id") REFERENCES "student_score_revisions"("id", "student_score_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_scores" ADD CONSTRAINT "student_scores_published_revision_id_id_organization_id_fkey" FOREIGN KEY ("published_revision_id", "id", "organization_id") REFERENCES "student_score_revisions"("id", "student_score_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_score_revisions" ADD CONSTRAINT "student_score_revisions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_score_revisions" ADD CONSTRAINT "student_score_revisions_student_score_id_organization_id_fkey" FOREIGN KEY ("student_score_id", "organization_id") REFERENCES "student_scores"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_score_revisions" ADD CONSTRAINT "student_score_revisions_score_rule_id_organization_id_fkey" FOREIGN KEY ("score_rule_id", "organization_id") REFERENCES "score_rules"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_contributions" ADD CONSTRAINT "score_contributions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_contributions" ADD CONSTRAINT "score_contributions_student_score_revision_id_organization_fkey" FOREIGN KEY ("student_score_revision_id", "organization_id") REFERENCES "student_score_revisions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_contributions" ADD CONSTRAINT "score_contributions_record_id_organization_id_fkey" FOREIGN KEY ("record_id", "organization_id") REFERENCES "exercise_records"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_contributions" ADD CONSTRAINT "score_contributions_review_id_record_id_organization_id_fkey" FOREIGN KEY ("review_id", "record_id", "organization_id") REFERENCES "review_records"("id", "record_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_contributions" ADD CONSTRAINT "score_contributions_score_rule_id_organization_id_fkey" FOREIGN KEY ("score_rule_id", "organization_id") REFERENCES "score_rules"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_adjustments" ADD CONSTRAINT "score_adjustments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_adjustments" ADD CONSTRAINT "score_adjustments_student_score_id_organization_id_fkey" FOREIGN KEY ("student_score_id", "organization_id") REFERENCES "student_scores"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_adjustments" ADD CONSTRAINT "score_adjustments_student_id_organization_id_fkey" FOREIGN KEY ("student_id", "organization_id") REFERENCES "student_profiles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_adjustments" ADD CONSTRAINT "score_adjustments_requested_by_organization_id_fkey" FOREIGN KEY ("requested_by", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_adjustment_approval_events" ADD CONSTRAINT "score_adjustment_approval_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_adjustment_approval_events" ADD CONSTRAINT "score_adjustment_approval_events_score_adjustment_id_organ_fkey" FOREIGN KEY ("score_adjustment_id", "organization_id") REFERENCES "score_adjustments"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_adjustment_approval_events" ADD CONSTRAINT "score_adjustment_approval_events_actor_user_id_organizatio_fkey" FOREIGN KEY ("actor_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_publication_events" ADD CONSTRAINT "score_publication_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_publication_events" ADD CONSTRAINT "score_publication_events_student_score_id_organization_id_fkey" FOREIGN KEY ("student_score_id", "organization_id") REFERENCES "student_scores"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_publication_events" ADD CONSTRAINT "score_publication_events_student_score_revision_id_student_fkey" FOREIGN KEY ("student_score_revision_id", "student_score_id", "organization_id") REFERENCES "student_score_revisions"("id", "student_score_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_publication_events" ADD CONSTRAINT "score_publication_events_actor_user_id_organization_id_fkey" FOREIGN KEY ("actor_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_recalculation_attempts" ADD CONSTRAINT "score_recalculation_attempts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_recalculation_attempts" ADD CONSTRAINT "score_recalculation_attempts_student_score_id_organization_fkey" FOREIGN KEY ("student_score_id", "organization_id") REFERENCES "student_scores"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_recalculation_attempts" ADD CONSTRAINT "score_recalculation_attempts_score_rule_id_organization_id_fkey" FOREIGN KEY ("score_rule_id", "organization_id") REFERENCES "score_rules"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Approved Score invariants.
ALTER TABLE "score_rules" ADD CONSTRAINT "score_rules_definition_check" CHECK (
  "total_required_seconds" = 72000 AND
  "rounding_mode" = 'HALF_UP' AND
  "rounding_scale" = 2 AND
  "rule_version" >= 1 AND
  "version" >= 1 AND
  "status" IN ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'SUPERSEDED')
);
ALTER TABLE "score_rules" ADD CONSTRAINT "score_rules_status_timestamps_check" CHECK (
  ("status" = 'DRAFT' AND "submitted_at" IS NULL AND "activated_at" IS NULL AND "superseded_at" IS NULL) OR
  ("status" = 'PENDING_APPROVAL' AND "submitted_at" IS NOT NULL AND "activated_at" IS NULL AND "superseded_at" IS NULL) OR
  ("status" = 'ACTIVE' AND "submitted_at" IS NOT NULL AND "activated_at" IS NOT NULL AND "superseded_at" IS NULL) OR
  ("status" = 'REJECTED' AND "submitted_at" IS NOT NULL AND "activated_at" IS NULL AND "superseded_at" IS NULL) OR
  ("status" = 'SUPERSEDED' AND "submitted_at" IS NOT NULL AND "activated_at" IS NOT NULL AND "superseded_at" IS NOT NULL)
);
CREATE UNIQUE INDEX "score_rules_one_active_per_section_key" ON "score_rules"("class_section_id") WHERE "status" = 'ACTIVE';

ALTER TABLE "score_rule_approval_events" ADD CONSTRAINT "score_rule_approval_events_action_check" CHECK ("action" IN ('APPROVE', 'REJECT'));
ALTER TABLE "student_scores" ADD CONSTRAINT "student_scores_version_check" CHECK ("version" >= 1);
ALTER TABLE "student_score_revisions" ADD CONSTRAINT "student_score_revisions_values_check" CHECK (
  "calculation_revision" >= 1 AND
  "total_valid_credited_seconds" >= 0 AND
  "scoring_seconds" >= 0 AND "scoring_seconds" <= 72000 AND
  "excess_seconds" >= 0 AND
  "qualification_status" IN ('NOT_QUALIFIED', 'QUALIFIED') AND
  "calculated_score" >= 0.00 AND "calculated_score" <= 100.00 AND
  "adjusted_score" >= 0.00 AND "adjusted_score" <= 100.00 AND
  "final_score" >= 0.00 AND "final_score" <= 100.00 AND
  "status" IN ('CALCULATED', 'ADJUSTED', 'PUBLISHED', 'LOCKED') AND
  "source_fingerprint" ~ '^[a-f0-9]{64}$'
);
ALTER TABLE "score_contributions" ADD CONSTRAINT "score_contributions_values_check" CHECK (
  "contribution_seconds" >= 0 AND "credit_type" IN ('COURSE_RELATED', 'GENERAL')
);
ALTER TABLE "score_adjustments" ADD CONSTRAINT "score_adjustments_values_check" CHECK (
  "adjustment_type" IN ('FINAL_SCORE_DELTA', 'FINAL_SCORE_REPLACEMENT', 'CALCULATION_CORRECTION') AND
  "reason_code" IN ('VERIFIED_DATA_ERROR', 'APPROVED_POLICY_EXCEPTION', 'CALCULATION_ERROR') AND
  "status" IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED') AND
  "version" >= 1 AND
  "evidence_reference" ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$' AND
  "evidence_reference" !~* '^https?://' AND
  btrim("reason") <> '' AND
  (("status" = 'PENDING_APPROVAL' AND "decided_at" IS NULL) OR ("status" IN ('APPROVED', 'REJECTED') AND "decided_at" IS NOT NULL))
);
ALTER TABLE "score_adjustment_approval_events" ADD CONSTRAINT "score_adjustment_approval_events_action_check" CHECK ("action" IN ('APPROVE', 'REJECT'));
ALTER TABLE "score_publication_events" ADD CONSTRAINT "score_publication_events_action_check" CHECK ("action" IN ('PUBLISH', 'LOCK'));
ALTER TABLE "score_recalculation_attempts" ADD CONSTRAINT "score_recalculation_attempts_values_check" CHECK (
  "status" IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED') AND
  "attempts" >= 0 AND
  "source_fingerprint" ~ '^[a-f0-9]{64}$'
);

-- Score history is append-only. Mutable aggregate pointers and workflow status
-- remain in student_scores, score_rules, score_adjustments and attempts.
CREATE FUNCTION "prevent_score_history_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Score history is append-only';
END;
$$;

CREATE TRIGGER "score_rule_approval_events_append_only_trigger"
BEFORE UPDATE OR DELETE ON "score_rule_approval_events"
FOR EACH ROW EXECUTE FUNCTION "prevent_score_history_mutation"();
CREATE TRIGGER "student_score_revisions_append_only_trigger"
BEFORE UPDATE OR DELETE ON "student_score_revisions"
FOR EACH ROW EXECUTE FUNCTION "prevent_score_history_mutation"();
CREATE TRIGGER "score_contributions_append_only_trigger"
BEFORE UPDATE OR DELETE ON "score_contributions"
FOR EACH ROW EXECUTE FUNCTION "prevent_score_history_mutation"();
CREATE TRIGGER "score_adjustment_approval_events_append_only_trigger"
BEFORE UPDATE OR DELETE ON "score_adjustment_approval_events"
FOR EACH ROW EXECUTE FUNCTION "prevent_score_history_mutation"();
CREATE TRIGGER "score_publication_events_append_only_trigger"
BEFORE UPDATE OR DELETE ON "score_publication_events"
FOR EACH ROW EXECUTE FUNCTION "prevent_score_history_mutation"();

CREATE FUNCTION "guard_score_rule_definition"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."organization_id", NEW."class_section_id", NEW."semester_id", NEW."rule_code", NEW."rule_version", NEW."display_name", NEW."total_required_seconds", NEW."calculation_definition", NEW."rounding_mode", NEW."rounding_scale", NEW."created_by", NEW."created_at")
     IS DISTINCT FROM
     ROW(OLD."organization_id", OLD."class_section_id", OLD."semester_id", OLD."rule_code", OLD."rule_version", OLD."display_name", OLD."total_required_seconds", OLD."calculation_definition", OLD."rounding_mode", OLD."rounding_scale", OLD."created_by", OLD."created_at") THEN
    RAISE EXCEPTION 'ScoreRule definition is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "score_rules_definition_guard_trigger"
BEFORE UPDATE ON "score_rules"
FOR EACH ROW EXECUTE FUNCTION "guard_score_rule_definition"();

CREATE FUNCTION "guard_score_adjustment_definition"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."organization_id", NEW."student_score_id", NEW."student_id", NEW."enrollment_id", NEW."adjustment_type", NEW."adjustment_value", NEW."reason_code", NEW."reason", NEW."evidence_reference", NEW."requested_by", NEW."requested_at", NEW."request_id", NEW."created_at")
     IS DISTINCT FROM
     ROW(OLD."organization_id", OLD."student_score_id", OLD."student_id", OLD."enrollment_id", OLD."adjustment_type", OLD."adjustment_value", OLD."reason_code", OLD."reason", OLD."evidence_reference", OLD."requested_by", OLD."requested_at", OLD."request_id", OLD."created_at") THEN
    RAISE EXCEPTION 'ScoreAdjustment definition is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "score_adjustments_definition_guard_trigger"
BEFORE UPDATE ON "score_adjustments"
FOR EACH ROW EXECUTE FUNCTION "guard_score_adjustment_definition"();
