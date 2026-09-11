-- Stage 13 Official Roster Import, immutable roster versions, deterministic alignment,
-- frozen platform snapshots, and append-only resolution history.
-- Forward-only: migrations 0001 through 0003 remain immutable.

CREATE TABLE "official_roster_imports" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "class_section_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "source" VARCHAR(32) NOT NULL,
    "file_name" VARCHAR(255),
    "source_file_storage_key" VARCHAR(512),
    "file_checksum_sha256" CHAR(64),
    "field_mapping_snapshot" JSONB NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'RECEIVED',
    "total_row_count" INTEGER NOT NULL DEFAULT 0,
    "valid_row_count" INTEGER NOT NULL DEFAULT 0,
    "invalid_row_count" INTEGER NOT NULL DEFAULT 0,
    "duplicated_row_count" INTEGER NOT NULL DEFAULT 0,
    "failure_code" VARCHAR(64),
    "failure_details_safe" JSONB,
    "imported_by" UUID NOT NULL,
    "imported_at" TIMESTAMPTZ(6) NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "superseded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "official_roster_imports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "official_roster_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "roster_import_id" UUID NOT NULL,
    "class_section_id" UUID NOT NULL,
    "source_row_number" INTEGER NOT NULL,
    "normalized_student_number" VARCHAR(32),
    "raw_student_number_safe" VARCHAR(64),
    "full_name" VARCHAR(100),
    "gender" VARCHAR(32),
    "grade_year" INTEGER,
    "college_name" VARCHAR(200),
    "major_name" VARCHAR(200),
    "administrative_class_name" VARCHAR(200),
    "row_validation_status" VARCHAR(32) NOT NULL,
    "row_error_codes" JSONB NOT NULL,
    "raw_row_snapshot_safe" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "official_roster_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "roster_alignment_runs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "semester_id" UUID NOT NULL,
    "class_section_id" UUID NOT NULL,
    "roster_import_id" UUID NOT NULL,
    "comparison_revision" INTEGER NOT NULL,
    "algorithm_version" VARCHAR(32) NOT NULL,
    "platform_snapshot_fingerprint" CHAR(64) NOT NULL,
    "platform_snapshot_at" TIMESTAMPTZ(6) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'RUNNING',
    "started_by" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "failure_code" VARCHAR(64),
    "failure_details_safe" JSONB,
    "result_count" INTEGER NOT NULL DEFAULT 0,
    "is_current" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "roster_alignment_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "roster_alignment_platform_entries" (
    "id" UUID NOT NULL,
    "alignment_run_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "class_section_id" UUID NOT NULL,
    "semester_id" UUID NOT NULL,
    "normalized_student_number" VARCHAR(32) NOT NULL,
    "full_name_snapshot" VARCHAR(100) NOT NULL,
    "gender_snapshot" VARCHAR(32) NOT NULL,
    "grade_year_snapshot" INTEGER NOT NULL,
    "enrollment_status_snapshot" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "roster_alignment_platform_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "roster_alignment_results" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "alignment_run_id" UUID NOT NULL,
    "roster_import_id" UUID NOT NULL,
    "class_section_id" UUID NOT NULL,
    "subject_key" CHAR(64) NOT NULL,
    "official_roster_entry_id" UUID,
    "enrollment_id" UUID,
    "student_id" UUID,
    "comparison_revision" INTEGER NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "differences" JSONB NOT NULL,
    "reason_code" VARCHAR(64),
    "resolution_status" VARCHAR(32) NOT NULL,
    "last_resolution_action" VARCHAR(16),
    "current_resolution_version" INTEGER NOT NULL DEFAULT 0,
    "resolution_note" VARCHAR(1000),
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by" UUID,
    "last_reconciled_at" TIMESTAMPTZ(6) NOT NULL,
    "superseded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "roster_alignment_results_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "roster_resolution_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "alignment_result_id" UUID NOT NULL,
    "resolution_version" INTEGER NOT NULL,
    "action" VARCHAR(16) NOT NULL,
    "from_status" VARCHAR(32) NOT NULL,
    "to_status" VARCHAR(32) NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "evidence_type" VARCHAR(32),
    "evidence_reference_id" UUID,
    "actor_user_id" UUID NOT NULL,
    "actor_role_snapshot" VARCHAR(32) NOT NULL,
    "request_id" VARCHAR(64) NOT NULL,
    "idempotency_key_reference" CHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "roster_resolution_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "official_roster_imports"
    ADD CONSTRAINT "official_roster_imports_version_number_check"
        CHECK ("version_number" >= 1),
    ADD CONSTRAINT "official_roster_imports_source_check"
        CHECK ("source" IN ('FILE', 'OFFICIAL_API')),
    ADD CONSTRAINT "official_roster_imports_file_shape_check"
        CHECK (
            (
                "source" = 'FILE'
                AND "file_name" IS NOT NULL
                AND "file_name" = btrim("file_name")
                AND "file_name" ~* '^[^./\\]+[.]csv$'
                AND "source_file_storage_key" IS NOT NULL
                AND btrim("source_file_storage_key") <> ''
                AND "file_checksum_sha256" IS NOT NULL
            )
            OR
            (
                "source" = 'OFFICIAL_API'
                AND "file_name" IS NULL
                AND "source_file_storage_key" IS NULL
                AND "file_checksum_sha256" IS NULL
            )
        ),
    ADD CONSTRAINT "official_roster_imports_file_checksum_check"
        CHECK ("file_checksum_sha256" IS NULL OR "file_checksum_sha256" ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT "official_roster_imports_field_mapping_check"
        CHECK (
            jsonb_typeof("field_mapping_snapshot") = 'object'
            AND "field_mapping_snapshot" ? 'studentNumber'
            AND "field_mapping_snapshot" ? 'fullName'
            AND octet_length("field_mapping_snapshot"::text) <= 4096
        ),
    ADD CONSTRAINT "official_roster_imports_status_check"
        CHECK ("status" IN ('RECEIVED', 'VALIDATING', 'VALIDATED', 'FAILED')),
    ADD CONSTRAINT "official_roster_imports_row_counts_check"
        CHECK (
            "total_row_count" >= 0
            AND "valid_row_count" >= 0
            AND "invalid_row_count" >= 0
            AND "duplicated_row_count" >= 0
            AND "total_row_count" = "valid_row_count" + "invalid_row_count" + "duplicated_row_count"
            AND ("status" NOT IN ('RECEIVED', 'VALIDATING') OR "total_row_count" = 0)
            AND ("status" <> 'VALIDATED' OR "valid_row_count" >= 1)
        ),
    ADD CONSTRAINT "official_roster_imports_failure_shape_check"
        CHECK (
            ("status" = 'FAILED' AND "failure_code" IS NOT NULL)
            OR
            ("status" <> 'FAILED' AND "failure_code" IS NULL AND "failure_details_safe" IS NULL)
        ),
    ADD CONSTRAINT "official_roster_imports_failure_code_check"
        CHECK ("failure_code" IS NULL OR "failure_code" ~ '^[A-Z][A-Z0-9_]{0,63}$'),
    ADD CONSTRAINT "official_roster_imports_failure_details_check"
        CHECK (
            "failure_details_safe" IS NULL
            OR (
                jsonb_typeof("failure_details_safe") = 'object'
                AND octet_length("failure_details_safe"::text) <= 4096
            )
        ),
    ADD CONSTRAINT "official_roster_imports_current_shape_check"
        CHECK (
            (
                "status" = 'VALIDATED'
                AND (
                    ("is_current" AND "superseded_at" IS NULL)
                    OR
                    (NOT "is_current" AND "superseded_at" IS NOT NULL)
                )
            )
            OR
            ("status" <> 'VALIDATED' AND NOT "is_current" AND "superseded_at" IS NULL)
        ),
    ADD CONSTRAINT "official_roster_imports_timestamp_order_check"
        CHECK (
            "imported_at" >= "created_at"
            AND ("superseded_at" IS NULL OR "superseded_at" >= "imported_at")
        ),
    ADD CONSTRAINT "official_roster_imports_version_check"
        CHECK ("version" >= 1);

ALTER TABLE "official_roster_entries"
    ADD CONSTRAINT "official_roster_entries_source_row_number_check"
        CHECK ("source_row_number" >= 1),
    ADD CONSTRAINT "official_roster_entries_student_number_check"
        CHECK (
            "normalized_student_number" IS NULL
            OR (
                btrim("normalized_student_number") <> ''
                AND "normalized_student_number" = upper(btrim("normalized_student_number"))
            )
        ),
    ADD CONSTRAINT "official_roster_entries_raw_student_number_check"
        CHECK ("raw_student_number_safe" IS NULL OR btrim("raw_student_number_safe") <> ''),
    ADD CONSTRAINT "official_roster_entries_full_name_check"
        CHECK ("full_name" IS NULL OR (btrim("full_name") <> '' AND "full_name" = btrim("full_name"))),
    ADD CONSTRAINT "official_roster_entries_gender_check"
        CHECK ("gender" IS NULL OR "gender" IN ('MALE', 'FEMALE', 'OTHER')),
    ADD CONSTRAINT "official_roster_entries_grade_year_check"
        CHECK ("grade_year" IS NULL OR "grade_year" BETWEEN 2000 AND 2027),
    ADD CONSTRAINT "official_roster_entries_optional_names_check"
        CHECK (
            ("college_name" IS NULL OR (btrim("college_name") <> '' AND "college_name" = btrim("college_name")))
            AND ("major_name" IS NULL OR (btrim("major_name") <> '' AND "major_name" = btrim("major_name")))
            AND ("administrative_class_name" IS NULL OR (btrim("administrative_class_name") <> '' AND "administrative_class_name" = btrim("administrative_class_name")))
        ),
    ADD CONSTRAINT "official_roster_entries_row_status_check"
        CHECK ("row_validation_status" IN ('VALID', 'INVALID', 'DUPLICATED')),
    ADD CONSTRAINT "official_roster_entries_row_error_codes_check"
        CHECK (
            jsonb_typeof("row_error_codes") = 'array'
            AND octet_length("row_error_codes"::text) <= 4096
            AND (
                ("row_validation_status" = 'VALID' AND jsonb_array_length("row_error_codes") = 0)
                OR
                ("row_validation_status" IN ('INVALID', 'DUPLICATED') AND jsonb_array_length("row_error_codes") >= 1)
            )
        ),
    ADD CONSTRAINT "official_roster_entries_valid_row_shape_check"
        CHECK (
            "row_validation_status" <> 'VALID'
            OR ("normalized_student_number" IS NOT NULL AND "full_name" IS NOT NULL)
        ),
    ADD CONSTRAINT "official_roster_entries_duplicated_row_shape_check"
        CHECK ("row_validation_status" <> 'DUPLICATED' OR "normalized_student_number" IS NOT NULL),
    ADD CONSTRAINT "official_roster_entries_raw_snapshot_check"
        CHECK (
            jsonb_typeof("raw_row_snapshot_safe") = 'object'
            AND octet_length("raw_row_snapshot_safe"::text) <= 4096
        );

ALTER TABLE "roster_alignment_runs"
    ADD CONSTRAINT "roster_alignment_runs_comparison_revision_check"
        CHECK ("comparison_revision" >= 1),
    ADD CONSTRAINT "roster_alignment_runs_algorithm_version_check"
        CHECK ("algorithm_version" = 'ROSTER_ALIGNMENT_V1'),
    ADD CONSTRAINT "roster_alignment_runs_snapshot_fingerprint_check"
        CHECK ("platform_snapshot_fingerprint" ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT "roster_alignment_runs_status_check"
        CHECK ("status" IN ('RUNNING', 'COMPLETED', 'FAILED')),
    ADD CONSTRAINT "roster_alignment_runs_failure_code_check"
        CHECK ("failure_code" IS NULL OR "failure_code" ~ '^[A-Z][A-Z0-9_]{0,63}$'),
    ADD CONSTRAINT "roster_alignment_runs_failure_details_check"
        CHECK (
            "failure_details_safe" IS NULL
            OR (
                jsonb_typeof("failure_details_safe") = 'object'
                AND octet_length("failure_details_safe"::text) <= 4096
            )
        ),
    ADD CONSTRAINT "roster_alignment_runs_state_shape_check"
        CHECK (
            (
                "status" = 'RUNNING'
                AND "completed_at" IS NULL
                AND "failure_code" IS NULL
                AND "failure_details_safe" IS NULL
                AND "result_count" = 0
                AND NOT "is_current"
            )
            OR
            (
                "status" = 'COMPLETED'
                AND "completed_at" IS NOT NULL
                AND "failure_code" IS NULL
                AND "failure_details_safe" IS NULL
                AND "result_count" >= 1
            )
            OR
            (
                "status" = 'FAILED'
                AND "completed_at" IS NOT NULL
                AND "failure_code" IS NOT NULL
                AND "result_count" = 0
                AND NOT "is_current"
            )
        ),
    ADD CONSTRAINT "roster_alignment_runs_timestamp_order_check"
        CHECK (
            "platform_snapshot_at" >= "started_at"
            AND ("completed_at" IS NULL OR "completed_at" >= "platform_snapshot_at")
        );

ALTER TABLE "roster_alignment_platform_entries"
    ADD CONSTRAINT "roster_platform_entries_student_number_check"
        CHECK (
            btrim("normalized_student_number") <> ''
            AND "normalized_student_number" = upper(btrim("normalized_student_number"))
        ),
    ADD CONSTRAINT "roster_platform_entries_full_name_check"
        CHECK (btrim("full_name_snapshot") <> '' AND "full_name_snapshot" = btrim("full_name_snapshot")),
    ADD CONSTRAINT "roster_platform_entries_gender_check"
        CHECK ("gender_snapshot" IN ('MALE', 'FEMALE', 'OTHER')),
    ADD CONSTRAINT "roster_platform_entries_grade_year_check"
        CHECK ("grade_year_snapshot" BETWEEN 2000 AND 2027),
    ADD CONSTRAINT "roster_platform_entries_status_check"
        CHECK ("enrollment_status_snapshot" = 'ACTIVE');

ALTER TABLE "roster_alignment_results"
    ADD CONSTRAINT "roster_alignment_results_subject_key_check"
        CHECK ("subject_key" ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT "roster_alignment_results_comparison_revision_check"
        CHECK ("comparison_revision" >= 1),
    ADD CONSTRAINT "roster_alignment_results_status_check"
        CHECK ("status" IN ('MATCHED', 'MISSING_IN_PLATFORM', 'EXTRA_IN_PLATFORM', 'WRONG_COURSE', 'IDENTITY_CONFLICT', 'DUPLICATED')),
    ADD CONSTRAINT "roster_alignment_results_differences_check"
        CHECK (jsonb_typeof("differences") = 'array' AND octet_length("differences"::text) <= 16384),
    ADD CONSTRAINT "roster_alignment_results_reason_code_check"
        CHECK ("reason_code" IS NULL OR "reason_code" ~ '^[A-Z][A-Z0-9_]{0,63}$'),
    ADD CONSTRAINT "roster_alignment_results_reference_shape_check"
        CHECK (
            (
                "status" IN ('MATCHED', 'WRONG_COURSE', 'IDENTITY_CONFLICT')
                AND "official_roster_entry_id" IS NOT NULL
                AND "enrollment_id" IS NOT NULL
                AND "student_id" IS NOT NULL
            )
            OR
            (
                "status" = 'MISSING_IN_PLATFORM'
                AND "official_roster_entry_id" IS NOT NULL
                AND "enrollment_id" IS NULL
                AND "student_id" IS NULL
            )
            OR
            (
                "status" = 'EXTRA_IN_PLATFORM'
                AND "official_roster_entry_id" IS NULL
                AND "enrollment_id" IS NOT NULL
                AND "student_id" IS NOT NULL
            )
            OR
            (
                "status" = 'DUPLICATED'
                AND "enrollment_id" IS NULL
                AND "student_id" IS NULL
            )
        ),
    ADD CONSTRAINT "roster_alignment_results_matched_differences_check"
        CHECK ("status" <> 'MATCHED' OR jsonb_array_length("differences") = 0),
    ADD CONSTRAINT "roster_alignment_results_resolution_status_check"
        CHECK ("resolution_status" IN ('PENDING', 'CONFIRMED', 'RESOLVED', 'IGNORED')),
    ADD CONSTRAINT "roster_alignment_results_resolution_action_check"
        CHECK ("last_resolution_action" IS NULL OR "last_resolution_action" IN ('CONFIRM', 'RESOLVE', 'REOPEN')),
    ADD CONSTRAINT "roster_alignment_results_resolution_version_check"
        CHECK ("current_resolution_version" >= 0),
    ADD CONSTRAINT "roster_alignment_results_resolution_projection_check"
        CHECK (
            (
                "current_resolution_version" = 0
                AND "last_resolution_action" IS NULL
                AND "resolution_note" IS NULL
                AND "resolved_by" IS NULL
                AND (
                    ("status" = 'MATCHED' AND "resolution_status" = 'RESOLVED' AND "resolved_at" IS NOT NULL)
                    OR
                    ("status" <> 'MATCHED' AND "resolution_status" = 'PENDING' AND "resolved_at" IS NULL)
                )
            )
            OR
            (
                "current_resolution_version" >= 1
                AND "resolution_note" IS NOT NULL
                AND btrim("resolution_note") <> ''
                AND "resolution_note" = btrim("resolution_note")
                AND (
                    (
                        "last_resolution_action" = 'CONFIRM'
                        AND "resolution_status" = 'CONFIRMED'
                        AND "resolved_at" IS NULL
                        AND "resolved_by" IS NULL
                    )
                    OR
                    (
                        "last_resolution_action" = 'RESOLVE'
                        AND "resolution_status" = 'RESOLVED'
                        AND "resolved_at" IS NOT NULL
                        AND "resolved_by" IS NOT NULL
                    )
                    OR
                    (
                        "last_resolution_action" = 'REOPEN'
                        AND "resolution_status" = 'PENDING'
                        AND "resolved_at" IS NULL
                        AND "resolved_by" IS NULL
                    )
                )
            )
        ),
    ADD CONSTRAINT "roster_alignment_results_timestamp_order_check"
        CHECK (
            "last_reconciled_at" >= "created_at"
            AND ("resolved_at" IS NULL OR "resolved_at" >= "created_at")
            AND ("superseded_at" IS NULL OR "superseded_at" >= "created_at")
        ),
    ADD CONSTRAINT "roster_alignment_results_version_check"
        CHECK ("version" >= 1);

ALTER TABLE "roster_resolution_events"
    ADD CONSTRAINT "roster_resolution_events_version_check"
        CHECK ("resolution_version" >= 1),
    ADD CONSTRAINT "roster_resolution_events_action_check"
        CHECK ("action" IN ('CONFIRM', 'RESOLVE', 'REOPEN')),
    ADD CONSTRAINT "roster_resolution_events_status_check"
        CHECK (
            "from_status" IN ('PENDING', 'CONFIRMED', 'RESOLVED', 'IGNORED')
            AND "to_status" IN ('PENDING', 'CONFIRMED', 'RESOLVED')
        ),
    ADD CONSTRAINT "roster_resolution_events_transition_check"
        CHECK (
            ("action" = 'CONFIRM' AND "from_status" = 'PENDING' AND "to_status" = 'CONFIRMED')
            OR
            ("action" = 'RESOLVE' AND "from_status" IN ('PENDING', 'CONFIRMED') AND "to_status" = 'RESOLVED')
            OR
            ("action" = 'REOPEN' AND "from_status" IN ('RESOLVED', 'IGNORED') AND "to_status" = 'PENDING')
        ),
    ADD CONSTRAINT "roster_resolution_events_reason_check"
        CHECK (char_length("reason") BETWEEN 1 AND 1000 AND "reason" = btrim("reason")),
    ADD CONSTRAINT "roster_resolution_events_evidence_shape_check"
        CHECK (
            (
                "action" = 'RESOLVE'
                AND "evidence_type" IN ('NEW_ALIGNMENT_RESULT', 'ENROLLMENT_STATUS_EVENT', 'OFFICIAL_ROSTER_VERSION')
                AND "evidence_reference_id" IS NOT NULL
            )
            OR
            (
                "action" IN ('CONFIRM', 'REOPEN')
                AND "evidence_type" IS NULL
                AND "evidence_reference_id" IS NULL
            )
        ),
    ADD CONSTRAINT "roster_resolution_events_actor_role_check"
        CHECK ("actor_role_snapshot" = 'TEACHER'),
    ADD CONSTRAINT "roster_resolution_events_request_id_check"
        CHECK (char_length("request_id") BETWEEN 1 AND 64),
    ADD CONSTRAINT "roster_resolution_events_idempotency_reference_check"
        CHECK (
            "idempotency_key_reference" IS NULL
            OR "idempotency_key_reference" ~ '^[0-9a-f]{64}$'
        );

CREATE UNIQUE INDEX "enrollments_id_semester_section_student_organization_key"
    ON "enrollments"("id", "semester_id", "class_section_id", "student_id", "organization_id");
CREATE UNIQUE INDEX "enrollment_status_events_id_organization_id_key"
    ON "enrollment_status_events"("id", "organization_id");

CREATE UNIQUE INDEX "official_roster_imports_id_organization_id_key"
    ON "official_roster_imports"("id", "organization_id");
CREATE UNIQUE INDEX "official_roster_imports_id_section_organization_key"
    ON "official_roster_imports"("id", "class_section_id", "organization_id");
CREATE UNIQUE INDEX "official_roster_imports_section_version_key"
    ON "official_roster_imports"("class_section_id", "version_number");
CREATE UNIQUE INDEX "official_roster_imports_one_current_per_section_idx"
    ON "official_roster_imports"("class_section_id") WHERE "is_current";
CREATE INDEX "official_roster_imports_organization_section_status_version_idx"
    ON "official_roster_imports"("organization_id", "class_section_id", "status", "version_number");
CREATE INDEX "official_roster_imports_file_checksum_idx"
    ON "official_roster_imports"("file_checksum_sha256");

CREATE UNIQUE INDEX "official_roster_entries_id_organization_id_key"
    ON "official_roster_entries"("id", "organization_id");
CREATE UNIQUE INDEX "official_roster_entries_id_import_section_organization_key"
    ON "official_roster_entries"("id", "roster_import_id", "class_section_id", "organization_id");
CREATE UNIQUE INDEX "official_roster_entries_import_source_row_key"
    ON "official_roster_entries"("roster_import_id", "source_row_number");
CREATE UNIQUE INDEX "official_roster_entries_valid_student_number_key"
    ON "official_roster_entries"("roster_import_id", "normalized_student_number")
    WHERE "row_validation_status" = 'VALID';
CREATE INDEX "official_roster_entries_organization_import_status_row_idx"
    ON "official_roster_entries"("organization_id", "roster_import_id", "row_validation_status", "source_row_number");
CREATE INDEX "official_roster_entries_import_student_number_idx"
    ON "official_roster_entries"("roster_import_id", "normalized_student_number");

CREATE UNIQUE INDEX "roster_alignment_runs_id_organization_id_key"
    ON "roster_alignment_runs"("id", "organization_id");
CREATE UNIQUE INDEX "roster_alignment_runs_id_semester_organization_key"
    ON "roster_alignment_runs"("id", "semester_id", "organization_id");
CREATE UNIQUE INDEX "roster_alignment_runs_id_import_section_revision_org_key"
    ON "roster_alignment_runs"("id", "roster_import_id", "class_section_id", "comparison_revision", "organization_id");
CREATE UNIQUE INDEX "roster_alignment_runs_section_revision_key"
    ON "roster_alignment_runs"("class_section_id", "comparison_revision");
CREATE UNIQUE INDEX "roster_alignment_runs_one_running_per_section_idx"
    ON "roster_alignment_runs"("class_section_id") WHERE "status" = 'RUNNING';
CREATE UNIQUE INDEX "roster_alignment_runs_one_current_per_section_idx"
    ON "roster_alignment_runs"("class_section_id") WHERE "is_current";
CREATE INDEX "roster_alignment_runs_organization_section_status_revision_idx"
    ON "roster_alignment_runs"("organization_id", "class_section_id", "status", "comparison_revision");

CREATE UNIQUE INDEX "roster_alignment_platform_entries_id_organization_id_key"
    ON "roster_alignment_platform_entries"("id", "organization_id");
CREATE UNIQUE INDEX "roster_alignment_platform_entries_run_enrollment_key"
    ON "roster_alignment_platform_entries"("alignment_run_id", "enrollment_id");
CREATE UNIQUE INDEX "roster_platform_entries_run_enrollment_student_org_key"
    ON "roster_alignment_platform_entries"("alignment_run_id", "enrollment_id", "student_id", "organization_id");
CREATE INDEX "roster_platform_entries_run_student_number_section_idx"
    ON "roster_alignment_platform_entries"("alignment_run_id", "normalized_student_number", "class_section_id");

CREATE UNIQUE INDEX "roster_alignment_results_id_organization_id_key"
    ON "roster_alignment_results"("id", "organization_id");
CREATE UNIQUE INDEX "roster_alignment_results_run_subject_key"
    ON "roster_alignment_results"("alignment_run_id", "subject_key");
CREATE UNIQUE INDEX "roster_alignment_results_current_section_subject_key"
    ON "roster_alignment_results"("class_section_id", "subject_key") WHERE "superseded_at" IS NULL;
CREATE UNIQUE INDEX "roster_alignment_results_run_enrollment_key"
    ON "roster_alignment_results"("alignment_run_id", "enrollment_id") WHERE "enrollment_id" IS NOT NULL;
CREATE INDEX "roster_results_org_section_status_resolution_revision_idx"
    ON "roster_alignment_results"("organization_id", "class_section_id", "status", "resolution_status", "comparison_revision", "id");
CREATE INDEX "roster_alignment_results_import_revision_idx"
    ON "roster_alignment_results"("roster_import_id", "comparison_revision");

CREATE UNIQUE INDEX "roster_resolution_events_result_version_key"
    ON "roster_resolution_events"("alignment_result_id", "resolution_version");
CREATE INDEX "roster_resolution_events_organization_result_created_idx"
    ON "roster_resolution_events"("organization_id", "alignment_result_id", "created_at", "id");
CREATE INDEX "roster_resolution_events_request_id_idx"
    ON "roster_resolution_events"("request_id");

ALTER TABLE "official_roster_imports"
    ADD CONSTRAINT "official_roster_imports_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "official_roster_imports_class_section_id_organization_id_fkey"
        FOREIGN KEY ("class_section_id", "organization_id") REFERENCES "class_sections"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "official_roster_imports_imported_by_organization_id_fkey"
        FOREIGN KEY ("imported_by", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "official_roster_entries"
    ADD CONSTRAINT "official_roster_entries_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "official_roster_entries_import_section_organization_fkey"
        FOREIGN KEY ("roster_import_id", "class_section_id", "organization_id") REFERENCES "official_roster_imports"("id", "class_section_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "official_roster_entries_class_section_organization_fkey"
        FOREIGN KEY ("class_section_id", "organization_id") REFERENCES "class_sections"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "roster_alignment_runs"
    ADD CONSTRAINT "roster_alignment_runs_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "roster_alignment_runs_semester_organization_fkey"
        FOREIGN KEY ("semester_id", "organization_id") REFERENCES "semesters"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "roster_alignment_runs_section_semester_organization_fkey"
        FOREIGN KEY ("class_section_id", "semester_id", "organization_id") REFERENCES "class_sections"("id", "semester_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "roster_alignment_runs_import_section_organization_fkey"
        FOREIGN KEY ("roster_import_id", "class_section_id", "organization_id") REFERENCES "official_roster_imports"("id", "class_section_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "roster_alignment_runs_started_by_organization_id_fkey"
        FOREIGN KEY ("started_by", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "roster_alignment_platform_entries"
    ADD CONSTRAINT "roster_platform_entries_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "roster_platform_entries_run_semester_organization_fkey"
        FOREIGN KEY ("alignment_run_id", "semester_id", "organization_id") REFERENCES "roster_alignment_runs"("id", "semester_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "roster_platform_entries_enrollment_scope_fkey"
        FOREIGN KEY ("enrollment_id", "semester_id", "class_section_id", "student_id", "organization_id") REFERENCES "enrollments"("id", "semester_id", "class_section_id", "student_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "roster_platform_entries_student_organization_fkey"
        FOREIGN KEY ("student_id", "organization_id") REFERENCES "student_profiles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "roster_platform_entries_section_semester_organization_fkey"
        FOREIGN KEY ("class_section_id", "semester_id", "organization_id") REFERENCES "class_sections"("id", "semester_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "roster_platform_entries_semester_organization_fkey"
        FOREIGN KEY ("semester_id", "organization_id") REFERENCES "semesters"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "roster_alignment_results"
    ADD CONSTRAINT "roster_alignment_results_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "roster_alignment_results_run_scope_fkey"
        FOREIGN KEY ("alignment_run_id", "roster_import_id", "class_section_id", "comparison_revision", "organization_id") REFERENCES "roster_alignment_runs"("id", "roster_import_id", "class_section_id", "comparison_revision", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "roster_alignment_results_import_scope_fkey"
        FOREIGN KEY ("roster_import_id", "class_section_id", "organization_id") REFERENCES "official_roster_imports"("id", "class_section_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "roster_alignment_results_class_section_organization_fkey"
        FOREIGN KEY ("class_section_id", "organization_id") REFERENCES "class_sections"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "roster_alignment_results_entry_scope_fkey"
        FOREIGN KEY ("official_roster_entry_id", "roster_import_id", "class_section_id", "organization_id") REFERENCES "official_roster_entries"("id", "roster_import_id", "class_section_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "roster_alignment_results_platform_entry_scope_fkey"
        FOREIGN KEY ("alignment_run_id", "enrollment_id", "student_id", "organization_id") REFERENCES "roster_alignment_platform_entries"("alignment_run_id", "enrollment_id", "student_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "roster_alignment_results_resolved_by_organization_fkey"
        FOREIGN KEY ("resolved_by", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "roster_resolution_events"
    ADD CONSTRAINT "roster_resolution_events_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "roster_resolution_events_result_organization_fkey"
        FOREIGN KEY ("alignment_result_id", "organization_id") REFERENCES "roster_alignment_results"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "roster_resolution_events_actor_organization_fkey"
        FOREIGN KEY ("actor_user_id", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "guard_official_roster_import_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    actual_total INTEGER;
    actual_valid INTEGER;
    actual_invalid INTEGER;
    actual_duplicated INTEGER;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'official roster imports cannot be deleted';
    END IF;

    IF NEW."id" IS DISTINCT FROM OLD."id"
       OR NEW."organization_id" IS DISTINCT FROM OLD."organization_id"
       OR NEW."class_section_id" IS DISTINCT FROM OLD."class_section_id"
       OR NEW."version_number" IS DISTINCT FROM OLD."version_number"
       OR NEW."source" IS DISTINCT FROM OLD."source"
       OR NEW."file_name" IS DISTINCT FROM OLD."file_name"
       OR NEW."source_file_storage_key" IS DISTINCT FROM OLD."source_file_storage_key"
       OR NEW."file_checksum_sha256" IS DISTINCT FROM OLD."file_checksum_sha256"
       OR NEW."field_mapping_snapshot" IS DISTINCT FROM OLD."field_mapping_snapshot"
       OR NEW."imported_by" IS DISTINCT FROM OLD."imported_by"
       OR NEW."imported_at" IS DISTINCT FROM OLD."imported_at"
       OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'official roster import source facts are immutable';
    END IF;

    IF OLD."status" IN ('VALIDATED', 'FAILED') THEN
        IF NEW."status" IS DISTINCT FROM OLD."status"
           OR NEW."total_row_count" IS DISTINCT FROM OLD."total_row_count"
           OR NEW."valid_row_count" IS DISTINCT FROM OLD."valid_row_count"
           OR NEW."invalid_row_count" IS DISTINCT FROM OLD."invalid_row_count"
           OR NEW."duplicated_row_count" IS DISTINCT FROM OLD."duplicated_row_count"
           OR NEW."failure_code" IS DISTINCT FROM OLD."failure_code"
           OR NEW."failure_details_safe" IS DISTINCT FROM OLD."failure_details_safe" THEN
            RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'terminal official roster import facts are immutable';
        END IF;

        IF NEW."is_current" IS DISTINCT FROM OLD."is_current"
           OR NEW."superseded_at" IS DISTINCT FROM OLD."superseded_at" THEN
            IF OLD."status" <> 'VALIDATED' OR NEW."version" <> OLD."version" + 1 THEN
                RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'invalid official roster current pointer update';
            END IF;
        ELSIF NEW."version" IS DISTINCT FROM OLD."version" THEN
            RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'official roster version changed without a pointer update';
        END IF;

        RETURN NEW;
    END IF;

    IF NOT (
        (OLD."status" = 'RECEIVED' AND NEW."status" = 'VALIDATING')
        OR
        (OLD."status" = 'VALIDATING' AND NEW."status" IN ('VALIDATED', 'FAILED'))
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'invalid official roster import lifecycle transition';
    END IF;

    IF NEW."version" <> OLD."version" + 1
       OR NEW."superseded_at" IS NOT NULL
       OR (NEW."status" <> 'VALIDATED' AND NEW."is_current") THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'invalid official roster lifecycle projection';
    END IF;

    IF NEW."status" IN ('VALIDATED', 'FAILED') THEN
        SELECT
            count(*)::INTEGER,
            count(*) FILTER (WHERE "row_validation_status" = 'VALID')::INTEGER,
            count(*) FILTER (WHERE "row_validation_status" = 'INVALID')::INTEGER,
            count(*) FILTER (WHERE "row_validation_status" = 'DUPLICATED')::INTEGER
          INTO actual_total, actual_valid, actual_invalid, actual_duplicated
          FROM "official_roster_entries"
         WHERE "roster_import_id" = NEW."id";

        IF NEW."total_row_count" <> actual_total
           OR NEW."valid_row_count" <> actual_valid
           OR NEW."invalid_row_count" <> actual_invalid
           OR NEW."duplicated_row_count" <> actual_duplicated THEN
            RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'official_roster_imports_persisted_row_counts_check', MESSAGE = 'official roster counts must equal persisted entries';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE TRIGGER "official_roster_imports_mutation_guard_trigger"
BEFORE UPDATE OR DELETE ON "official_roster_imports"
FOR EACH ROW EXECUTE FUNCTION "guard_official_roster_import_mutation"();

CREATE FUNCTION "guard_official_roster_import_insert"() RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    mapping_key TEXT;
    mapping_value JSONB;
    seen_headers TEXT[] := ARRAY[]::TEXT[];
    header_value TEXT;
BEGIN
    IF NEW."status" <> 'RECEIVED'
       OR NEW."total_row_count" <> 0
       OR NEW."valid_row_count" <> 0
       OR NEW."invalid_row_count" <> 0
       OR NEW."duplicated_row_count" <> 0
       OR NEW."failure_code" IS NOT NULL
       OR NEW."failure_details_safe" IS NOT NULL
       OR NEW."is_current"
       OR NEW."superseded_at" IS NOT NULL
       OR NEW."version" <> 1 THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'official_roster_imports_initial_state_check', MESSAGE = 'official roster imports must begin in RECEIVED';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM "class_sections" AS section
          JOIN "teacher_profiles" AS teacher
            ON teacher."id" = section."teacher_id"
           AND teacher."organization_id" = section."organization_id"
         WHERE section."id" = NEW."class_section_id"
           AND section."organization_id" = NEW."organization_id"
           AND teacher."user_id" = NEW."imported_by"
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'official_roster_imports_responsible_teacher_check', MESSAGE = 'official roster import actor must own the ClassSection';
    END IF;

    FOR mapping_key, mapping_value IN
        SELECT key, value FROM jsonb_each(NEW."field_mapping_snapshot")
    LOOP
        IF mapping_key NOT IN (
            'studentNumber',
            'fullName',
            'gender',
            'gradeYear',
            'collegeName',
            'majorName',
            'administrativeClassName'
        ) OR jsonb_typeof(mapping_value) NOT IN ('string', 'null') THEN
            RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'official_roster_imports_field_mapping_whitelist_check', MESSAGE = 'field mapping contains an unsupported key or value';
        END IF;

        IF jsonb_typeof(mapping_value) = 'string' THEN
            header_value := mapping_value #>> '{}';
            IF header_value <> btrim(header_value)
               OR char_length(header_value) NOT BETWEEN 1 AND 128
               OR header_value ~ '[[:cntrl:]]'
               OR header_value = ANY(seen_headers) THEN
                RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'official_roster_imports_field_mapping_header_check', MESSAGE = 'field mapping headers must be safe, trimmed, and unique';
            END IF;
            seen_headers := array_append(seen_headers, header_value);
        ELSIF mapping_key IN ('studentNumber', 'fullName') THEN
            RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'official_roster_imports_required_field_mapping_check', MESSAGE = 'studentNumber and fullName mappings are required';
        END IF;
    END LOOP;

    RETURN NEW;
END;
$function$;

CREATE TRIGGER "official_roster_imports_insert_guard_trigger"
BEFORE INSERT ON "official_roster_imports"
FOR EACH ROW EXECUTE FUNCTION "guard_official_roster_import_insert"();

CREATE FUNCTION "guard_official_roster_entry_insert"() RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    error_code JSONB;
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM "official_roster_imports"
         WHERE "id" = NEW."roster_import_id"
           AND "class_section_id" = NEW."class_section_id"
           AND "organization_id" = NEW."organization_id"
           AND "status" = 'VALIDATING'
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'official roster entries require a VALIDATING import';
    END IF;

    FOR error_code IN SELECT value FROM jsonb_array_elements(NEW."row_error_codes")
    LOOP
        IF jsonb_typeof(error_code) <> 'string'
           OR (error_code #>> '{}') !~ '^[A-Z][A-Z0-9_]{0,63}$' THEN
            RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'official_roster_entries_error_code_values_check', MESSAGE = 'roster row error codes must use stable UPPER_SNAKE_CASE values';
        END IF;
    END LOOP;

    RETURN NEW;
END;
$function$;

CREATE TRIGGER "official_roster_entries_insert_guard_trigger"
BEFORE INSERT ON "official_roster_entries"
FOR EACH ROW EXECUTE FUNCTION "guard_official_roster_entry_insert"();

CREATE FUNCTION "prevent_official_roster_entry_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'official roster entries are append-only';
END;
$function$;

CREATE TRIGGER "official_roster_entries_append_only_trigger"
BEFORE UPDATE OR DELETE ON "official_roster_entries"
FOR EACH ROW EXECUTE FUNCTION "prevent_official_roster_entry_mutation"();

CREATE FUNCTION "guard_roster_alignment_run_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    actual_result_count INTEGER;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'roster alignment runs cannot be deleted';
    END IF;

    IF NEW."id" IS DISTINCT FROM OLD."id"
       OR NEW."organization_id" IS DISTINCT FROM OLD."organization_id"
       OR NEW."semester_id" IS DISTINCT FROM OLD."semester_id"
       OR NEW."class_section_id" IS DISTINCT FROM OLD."class_section_id"
       OR NEW."roster_import_id" IS DISTINCT FROM OLD."roster_import_id"
       OR NEW."comparison_revision" IS DISTINCT FROM OLD."comparison_revision"
       OR NEW."algorithm_version" IS DISTINCT FROM OLD."algorithm_version"
       OR NEW."platform_snapshot_fingerprint" IS DISTINCT FROM OLD."platform_snapshot_fingerprint"
       OR NEW."platform_snapshot_at" IS DISTINCT FROM OLD."platform_snapshot_at"
       OR NEW."started_by" IS DISTINCT FROM OLD."started_by"
       OR NEW."started_at" IS DISTINCT FROM OLD."started_at" THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'roster alignment run inputs are immutable';
    END IF;

    IF OLD."status" = 'RUNNING' THEN
        IF NEW."status" NOT IN ('COMPLETED', 'FAILED') THEN
            RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'invalid roster alignment run lifecycle transition';
        END IF;

        SELECT count(*)::INTEGER
          INTO actual_result_count
          FROM "roster_alignment_results"
         WHERE "alignment_run_id" = NEW."id";

        IF NEW."result_count" <> actual_result_count THEN
            RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'roster_alignment_runs_persisted_result_count_check', MESSAGE = 'alignment result count must equal persisted results';
        END IF;

        RETURN NEW;
    END IF;

    IF NEW."status" IS DISTINCT FROM OLD."status"
       OR NEW."completed_at" IS DISTINCT FROM OLD."completed_at"
       OR NEW."failure_code" IS DISTINCT FROM OLD."failure_code"
       OR NEW."failure_details_safe" IS DISTINCT FROM OLD."failure_details_safe"
       OR NEW."result_count" IS DISTINCT FROM OLD."result_count" THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'terminal roster alignment run facts are immutable';
    END IF;

    IF OLD."status" <> 'COMPLETED'
       OR NOT OLD."is_current"
       OR NEW."is_current" THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'completed alignment current pointer can only be retired';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE TRIGGER "roster_alignment_runs_mutation_guard_trigger"
BEFORE UPDATE OR DELETE ON "roster_alignment_runs"
FOR EACH ROW EXECUTE FUNCTION "guard_roster_alignment_run_mutation"();

CREATE FUNCTION "guard_roster_alignment_run_insert"() RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW."status" <> 'RUNNING'
       OR NEW."completed_at" IS NOT NULL
       OR NEW."failure_code" IS NOT NULL
       OR NEW."failure_details_safe" IS NOT NULL
       OR NEW."result_count" <> 0
       OR NEW."is_current" THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'roster_alignment_runs_initial_state_check', MESSAGE = 'roster alignment runs must begin in RUNNING';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM "official_roster_imports" AS roster_import
          JOIN "class_sections" AS section
            ON section."id" = roster_import."class_section_id"
           AND section."organization_id" = roster_import."organization_id"
          JOIN "teacher_profiles" AS teacher
            ON teacher."id" = section."teacher_id"
           AND teacher."organization_id" = section."organization_id"
         WHERE roster_import."id" = NEW."roster_import_id"
           AND roster_import."class_section_id" = NEW."class_section_id"
           AND roster_import."organization_id" = NEW."organization_id"
           AND roster_import."status" = 'VALIDATED'
           AND roster_import."is_current"
           AND section."semester_id" = NEW."semester_id"
           AND teacher."user_id" = NEW."started_by"
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'roster_alignment_runs_current_import_teacher_check', MESSAGE = 'alignment requires the current validated roster and responsible teacher';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE TRIGGER "roster_alignment_runs_insert_guard_trigger"
BEFORE INSERT ON "roster_alignment_runs"
FOR EACH ROW EXECUTE FUNCTION "guard_roster_alignment_run_insert"();

CREATE FUNCTION "guard_roster_alignment_platform_entry_insert"() RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM "roster_alignment_runs" AS run
          JOIN "enrollments" AS enrollment
            ON enrollment."id" = NEW."enrollment_id"
           AND enrollment."semester_id" = NEW."semester_id"
           AND enrollment."class_section_id" = NEW."class_section_id"
           AND enrollment."student_id" = NEW."student_id"
           AND enrollment."organization_id" = NEW."organization_id"
          JOIN "student_profiles" AS student
            ON student."id" = enrollment."student_id"
           AND student."organization_id" = enrollment."organization_id"
         WHERE run."id" = NEW."alignment_run_id"
           AND run."semester_id" = NEW."semester_id"
           AND run."organization_id" = NEW."organization_id"
           AND run."status" = 'RUNNING'
           AND enrollment."status" = 'ACTIVE'
           AND student."student_number" = NEW."normalized_student_number"
           AND student."full_name" = NEW."full_name_snapshot"
           AND student."gender" = NEW."gender_snapshot"
           AND student."grade_year" = NEW."grade_year_snapshot"
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'platform snapshot entries must freeze a real ACTIVE Enrollment identity';
    END IF;
    RETURN NEW;
END;
$function$;

CREATE TRIGGER "roster_platform_entries_insert_guard_trigger"
BEFORE INSERT ON "roster_alignment_platform_entries"
FOR EACH ROW EXECUTE FUNCTION "guard_roster_alignment_platform_entry_insert"();

CREATE FUNCTION "prevent_roster_alignment_platform_entry_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'roster alignment platform entries are append-only';
END;
$function$;

CREATE TRIGGER "roster_platform_entries_append_only_trigger"
BEFORE UPDATE OR DELETE ON "roster_alignment_platform_entries"
FOR EACH ROW EXECUTE FUNCTION "prevent_roster_alignment_platform_entry_mutation"();

CREATE FUNCTION "guard_roster_alignment_result_insert"() RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    difference JSONB;
    difference_field TEXT;
    previous_rank INTEGER := 0;
    current_rank INTEGER;
    difference_key_count INTEGER;
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM "roster_alignment_runs"
         WHERE "id" = NEW."alignment_run_id"
           AND "roster_import_id" = NEW."roster_import_id"
           AND "class_section_id" = NEW."class_section_id"
           AND "comparison_revision" = NEW."comparison_revision"
           AND "organization_id" = NEW."organization_id"
           AND "status" = 'RUNNING'
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'alignment results require a RUNNING alignment';
    END IF;

    FOR difference IN SELECT value FROM jsonb_array_elements(NEW."differences")
    LOOP
        IF jsonb_typeof(difference) <> 'object'
           OR NOT (difference ?& ARRAY['field', 'officialValue', 'platformValue']) THEN
            RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'roster_alignment_results_difference_shape_check', MESSAGE = 'alignment differences must use the canonical object shape';
        END IF;

        SELECT count(*)::INTEGER INTO difference_key_count FROM jsonb_object_keys(difference);
        IF difference_key_count <> 3
           OR jsonb_typeof(difference->'field') <> 'string'
           OR jsonb_typeof(difference->'officialValue') NOT IN ('string', 'number', 'null')
           OR jsonb_typeof(difference->'platformValue') NOT IN ('string', 'number', 'null') THEN
            RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'roster_alignment_results_difference_shape_check', MESSAGE = 'alignment differences contain unsupported values';
        END IF;

        difference_field := difference->>'field';
        current_rank := CASE difference_field
            WHEN 'FULL_NAME' THEN 1
            WHEN 'GENDER' THEN 2
            WHEN 'GRADE_YEAR' THEN 3
            WHEN 'CLASS_SECTION' THEN 4
            ELSE 0
        END;
        IF current_rank = 0 OR current_rank <= previous_rank THEN
            RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'roster_alignment_results_difference_order_check', MESSAGE = 'alignment differences must be unique and canonically ordered';
        END IF;
        previous_rank := current_rank;
    END LOOP;

    RETURN NEW;
END;
$function$;

CREATE TRIGGER "roster_alignment_results_insert_guard_trigger"
BEFORE INSERT ON "roster_alignment_results"
FOR EACH ROW EXECUTE FUNCTION "guard_roster_alignment_result_insert"();

CREATE FUNCTION "guard_roster_alignment_result_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    matching_event "roster_resolution_events"%ROWTYPE;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'roster alignment results cannot be deleted';
    END IF;

    IF NEW."id" IS DISTINCT FROM OLD."id"
       OR NEW."organization_id" IS DISTINCT FROM OLD."organization_id"
       OR NEW."alignment_run_id" IS DISTINCT FROM OLD."alignment_run_id"
       OR NEW."roster_import_id" IS DISTINCT FROM OLD."roster_import_id"
       OR NEW."class_section_id" IS DISTINCT FROM OLD."class_section_id"
       OR NEW."subject_key" IS DISTINCT FROM OLD."subject_key"
       OR NEW."official_roster_entry_id" IS DISTINCT FROM OLD."official_roster_entry_id"
       OR NEW."enrollment_id" IS DISTINCT FROM OLD."enrollment_id"
       OR NEW."student_id" IS DISTINCT FROM OLD."student_id"
       OR NEW."comparison_revision" IS DISTINCT FROM OLD."comparison_revision"
       OR NEW."status" IS DISTINCT FROM OLD."status"
       OR NEW."differences" IS DISTINCT FROM OLD."differences"
       OR NEW."reason_code" IS DISTINCT FROM OLD."reason_code"
       OR NEW."last_reconciled_at" IS DISTINCT FROM OLD."last_reconciled_at"
       OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'roster alignment algorithm results are immutable';
    END IF;

    IF NEW."superseded_at" IS DISTINCT FROM OLD."superseded_at" THEN
        IF OLD."superseded_at" IS NOT NULL
           OR NEW."superseded_at" IS NULL
           OR NEW."resolution_status" IS DISTINCT FROM OLD."resolution_status"
           OR NEW."last_resolution_action" IS DISTINCT FROM OLD."last_resolution_action"
           OR NEW."current_resolution_version" IS DISTINCT FROM OLD."current_resolution_version"
           OR NEW."resolution_note" IS DISTINCT FROM OLD."resolution_note"
           OR NEW."resolved_at" IS DISTINCT FROM OLD."resolved_at"
           OR NEW."resolved_by" IS DISTINCT FROM OLD."resolved_by"
           OR NEW."version" IS DISTINCT FROM OLD."version" THEN
            RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'invalid alignment result supersession';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD."superseded_at" IS NOT NULL
       OR NEW."current_resolution_version" <> OLD."current_resolution_version" + 1
       OR NEW."version" <> OLD."version" + 1 THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'invalid roster resolution version update';
    END IF;

    SELECT *
      INTO matching_event
      FROM "roster_resolution_events"
     WHERE "alignment_result_id" = OLD."id"
       AND "organization_id" = OLD."organization_id"
       AND "resolution_version" = NEW."current_resolution_version";

    IF NOT FOUND
       OR matching_event."from_status" <> OLD."resolution_status"
       OR matching_event."to_status" <> NEW."resolution_status"
       OR matching_event."action" <> NEW."last_resolution_action"
       OR matching_event."reason" <> NEW."resolution_note"
       OR (matching_event."action" = 'RESOLVE' AND NEW."resolved_by" IS DISTINCT FROM matching_event."actor_user_id") THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'roster resolution projection requires its append-only event';
    END IF;

    RETURN NEW;
END;
$function$;

CREATE TRIGGER "roster_alignment_results_mutation_guard_trigger"
BEFORE UPDATE OR DELETE ON "roster_alignment_results"
FOR EACH ROW EXECUTE FUNCTION "guard_roster_alignment_result_mutation"();

CREATE FUNCTION "validate_roster_resolution_event"() RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    current_status VARCHAR(32);
    current_version INTEGER;
    current_superseded_at TIMESTAMPTZ(6);
BEGIN
    SELECT "resolution_status", "current_resolution_version", "superseded_at"
      INTO current_status, current_version, current_superseded_at
      FROM "roster_alignment_results"
     WHERE "id" = NEW."alignment_result_id"
       AND "organization_id" = NEW."organization_id"
     FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'roster alignment result does not exist in organization scope';
    END IF;

    IF current_superseded_at IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'superseded roster alignment results cannot be resolved';
    END IF;

    IF NEW."resolution_version" <> current_version + 1 OR NEW."from_status" <> current_status THEN
        RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'roster resolution version is stale';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM "roster_alignment_results" AS result
          JOIN "class_sections" AS section
            ON section."id" = result."class_section_id"
           AND section."organization_id" = result."organization_id"
          JOIN "teacher_profiles" AS teacher
            ON teacher."id" = section."teacher_id"
           AND teacher."organization_id" = section."organization_id"
         WHERE result."id" = NEW."alignment_result_id"
           AND result."organization_id" = NEW."organization_id"
           AND teacher."user_id" = NEW."actor_user_id"
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'roster_resolution_events_responsible_teacher_check', MESSAGE = 'roster resolution actor must own the ClassSection';
    END IF;

    IF NEW."action" = 'RESOLVE' THEN
        IF NEW."evidence_type" = 'NEW_ALIGNMENT_RESULT' THEN
            IF NEW."evidence_reference_id" = NEW."alignment_result_id" OR NOT EXISTS (
                SELECT 1
                  FROM "roster_alignment_results"
                 WHERE "id" = NEW."evidence_reference_id"
                   AND "organization_id" = NEW."organization_id"
            ) THEN
                RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'roster_resolution_events_evidence_reference_check', MESSAGE = 'alignment evidence must reference another real result in the organization';
            END IF;
        ELSIF NEW."evidence_type" = 'ENROLLMENT_STATUS_EVENT' THEN
            IF NOT EXISTS (
                SELECT 1
                  FROM "enrollment_status_events"
                 WHERE "id" = NEW."evidence_reference_id"
                   AND "organization_id" = NEW."organization_id"
            ) THEN
                RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'roster_resolution_events_evidence_reference_check', MESSAGE = 'enrollment evidence must exist in the organization';
            END IF;
        ELSIF NEW."evidence_type" = 'OFFICIAL_ROSTER_VERSION' THEN
            IF NOT EXISTS (
                SELECT 1
                  FROM "official_roster_imports"
                 WHERE "id" = NEW."evidence_reference_id"
                   AND "organization_id" = NEW."organization_id"
                   AND "status" = 'VALIDATED'
            ) THEN
                RAISE EXCEPTION USING ERRCODE = '23514', CONSTRAINT = 'roster_resolution_events_evidence_reference_check', MESSAGE = 'roster version evidence must be validated in the organization';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE TRIGGER "roster_resolution_events_validation_trigger"
BEFORE INSERT ON "roster_resolution_events"
FOR EACH ROW EXECUTE FUNCTION "validate_roster_resolution_event"();

CREATE FUNCTION "prevent_roster_resolution_event_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'roster resolution events are append-only';
END;
$function$;

CREATE TRIGGER "roster_resolution_events_append_only_trigger"
BEFORE UPDATE OR DELETE ON "roster_resolution_events"
FOR EACH ROW EXECUTE FUNCTION "prevent_roster_resolution_event_mutation"();
