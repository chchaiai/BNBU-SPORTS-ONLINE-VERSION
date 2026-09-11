-- Stage 11 teaching structure: organization Course catalog and single-teacher ClassSection.
-- This forward-only migration intentionally does not create Enrollment or later business tables.

-- Expand the authoritative audit action catalog without modifying Foundation migration 0001.
-- Replacing this CHECK is metadata-only and preserves every previously accepted value.
ALTER TABLE "audit_logs"
    DROP CONSTRAINT "audit_logs_action_type_check",
    ADD CONSTRAINT "audit_logs_action_type_check"
        CHECK (
            "action_type" IN (
                'AUTHENTICATION_SUCCEEDED',
                'AUTHENTICATION_FAILED',
                'AUTH_SESSION_REVOKED',
                'USER_PROFILE_UPDATED',
                'USER_STATUS_CHANGED',
                'COURSE_CREATED',
                'COURSE_UPDATED',
                'COURSE_STATUS_CHANGED',
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
        );

CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "course_code" VARCHAR(32) NOT NULL,
    "course_name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000),
    "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "class_sections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "semester_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "class_code" VARCHAR(64) NOT NULL,
    "display_name" VARCHAR(200) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "is_enrollment_open" BOOLEAN NOT NULL DEFAULT false,
    "check_in_window_mode" VARCHAR(32) NOT NULL DEFAULT 'UNAVAILABLE',
    "check_in_start_date" DATE,
    "check_in_end_date" DATE,
    "daily_start_time" TIME(0),
    "daily_end_time" TIME(0),
    "submission_deadline_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "closed_at" TIMESTAMPTZ(6),
    "closed_by" UUID,
    "close_reason" VARCHAR(1000),

    CONSTRAINT "class_sections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "class_section_excluded_dates" (
    "class_section_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "excluded_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID NOT NULL,

    CONSTRAINT "class_section_excluded_dates_pkey" PRIMARY KEY ("class_section_id", "excluded_date")
);

ALTER TABLE "courses"
    ADD CONSTRAINT "courses_course_code_check"
        CHECK ("course_code" ~ '^[A-Z0-9][A-Z0-9._-]{0,31}$'),
    ADD CONSTRAINT "courses_course_name_check"
        CHECK (char_length("course_name") BETWEEN 1 AND 200 AND "course_name" = btrim("course_name")),
    ADD CONSTRAINT "courses_description_check"
        CHECK ("description" IS NULL OR char_length("description") <= 2000),
    ADD CONSTRAINT "courses_status_check"
        CHECK ("status" IN ('ACTIVE', 'INACTIVE')),
    ADD CONSTRAINT "courses_version_check"
        CHECK ("version" >= 1),
    ADD CONSTRAINT "courses_deleted_shape_check"
        CHECK (("deleted_at" IS NULL AND "deleted_by" IS NULL) OR ("deleted_at" IS NOT NULL AND "deleted_by" IS NOT NULL)),
    ADD CONSTRAINT "courses_timestamp_order_check"
        CHECK ("updated_at" >= "created_at");

ALTER TABLE "class_sections"
    ADD CONSTRAINT "class_sections_class_code_check"
        CHECK (char_length("class_code") BETWEEN 1 AND 64 AND "class_code" = btrim("class_code")),
    ADD CONSTRAINT "class_sections_display_name_check"
        CHECK (char_length("display_name") BETWEEN 1 AND 200 AND "display_name" = btrim("display_name")),
    ADD CONSTRAINT "class_sections_status_check"
        CHECK ("status" IN ('UPCOMING', 'ACTIVE', 'CLOSED', 'ARCHIVED')),
    ADD CONSTRAINT "class_sections_enrollment_open_state_check"
        CHECK (NOT "is_enrollment_open" OR "status" IN ('UPCOMING', 'ACTIVE')),
    ADD CONSTRAINT "class_sections_check_in_window_mode_check"
        CHECK ("check_in_window_mode" IN ('AVAILABLE', 'UNAVAILABLE')),
    ADD CONSTRAINT "class_sections_check_in_date_pair_check"
        CHECK (("check_in_start_date" IS NULL AND "check_in_end_date" IS NULL) OR ("check_in_start_date" IS NOT NULL AND "check_in_end_date" IS NOT NULL AND "check_in_end_date" >= "check_in_start_date")),
    ADD CONSTRAINT "class_sections_available_window_check"
        CHECK ("check_in_window_mode" <> 'AVAILABLE' OR ("check_in_start_date" IS NOT NULL AND "check_in_end_date" IS NOT NULL)),
    ADD CONSTRAINT "class_sections_daily_time_pair_check"
        CHECK (("daily_start_time" IS NULL AND "daily_end_time" IS NULL) OR ("daily_start_time" IS NOT NULL AND "daily_end_time" IS NOT NULL AND "daily_start_time" < "daily_end_time")),
    ADD CONSTRAINT "class_sections_version_check"
        CHECK ("version" >= 1),
    ADD CONSTRAINT "class_sections_close_shape_check"
        CHECK (("status" IN ('UPCOMING', 'ACTIVE') AND "closed_at" IS NULL AND "closed_by" IS NULL AND "close_reason" IS NULL) OR ("status" IN ('CLOSED', 'ARCHIVED') AND "closed_at" IS NOT NULL AND "closed_by" IS NOT NULL AND "close_reason" IS NOT NULL)),
    ADD CONSTRAINT "class_sections_close_reason_check"
        CHECK ("close_reason" IS NULL OR (char_length("close_reason") BETWEEN 1 AND 1000 AND "close_reason" = btrim("close_reason"))),
    ADD CONSTRAINT "class_sections_timestamp_order_check"
        CHECK ("updated_at" >= "created_at");

CREATE INDEX "courses_organization_status_code_id_idx"
    ON "courses"("organization_id", "status", "course_code", "id");
CREATE INDEX "courses_organization_updated_at_id_idx"
    ON "courses"("organization_id", "updated_at", "id");
CREATE UNIQUE INDEX "courses_id_organization_id_key"
    ON "courses"("id", "organization_id");
CREATE UNIQUE INDEX "courses_organization_course_code_key"
    ON "courses"("organization_id", "course_code");

CREATE INDEX "class_sections_organization_teacher_status_updated_id_idx"
    ON "class_sections"("organization_id", "teacher_id", "status", "updated_at", "id");
CREATE INDEX "class_sections_organization_semester_course_status_idx"
    ON "class_sections"("organization_id", "semester_id", "course_id", "status");
CREATE INDEX "class_sections_organization_status_updated_id_idx"
    ON "class_sections"("organization_id", "status", "updated_at", "id");
CREATE UNIQUE INDEX "class_sections_id_organization_id_key"
    ON "class_sections"("id", "organization_id");
CREATE UNIQUE INDEX "class_sections_semester_course_class_code_key"
    ON "class_sections"("semester_id", "course_id", "class_code");

CREATE INDEX "class_section_excluded_dates_organization_date_idx"
    ON "class_section_excluded_dates"("organization_id", "excluded_date");
CREATE UNIQUE INDEX "semesters_id_organization_id_key"
    ON "semesters"("id", "organization_id");
CREATE UNIQUE INDEX "teacher_profiles_id_organization_id_key"
    ON "teacher_profiles"("id", "organization_id");

ALTER TABLE "courses"
    ADD CONSTRAINT "courses_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "courses_created_by_organization_id_fkey"
        FOREIGN KEY ("created_by", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "courses_updated_by_organization_id_fkey"
        FOREIGN KEY ("updated_by", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "courses_deleted_by_organization_id_fkey"
        FOREIGN KEY ("deleted_by", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "class_sections"
    ADD CONSTRAINT "class_sections_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "class_sections_course_id_organization_id_fkey"
        FOREIGN KEY ("course_id", "organization_id") REFERENCES "courses"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "class_sections_semester_id_organization_id_fkey"
        FOREIGN KEY ("semester_id", "organization_id") REFERENCES "semesters"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "class_sections_teacher_id_organization_id_fkey"
        FOREIGN KEY ("teacher_id", "organization_id") REFERENCES "teacher_profiles"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "class_sections_created_by_organization_id_fkey"
        FOREIGN KEY ("created_by", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "class_sections_updated_by_organization_id_fkey"
        FOREIGN KEY ("updated_by", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "class_sections_closed_by_organization_id_fkey"
        FOREIGN KEY ("closed_by", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "class_section_excluded_dates"
    ADD CONSTRAINT "class_section_excluded_dates_class_section_id_organization_fkey"
        FOREIGN KEY ("class_section_id", "organization_id") REFERENCES "class_sections"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "class_section_excluded_dates_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "class_section_excluded_dates_created_by_organization_id_fkey"
        FOREIGN KEY ("created_by", "organization_id") REFERENCES "users"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "validate_class_section_calendar"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    semester_start DATE;
    semester_end DATE;
BEGIN
    SELECT "start_date", "end_date"
      INTO semester_start, semester_end
      FROM "semesters"
     WHERE "id" = NEW."semester_id"
       AND "organization_id" = NEW."organization_id";

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    IF (NEW."check_in_start_date" IS NOT NULL AND NEW."check_in_start_date" < semester_start)
       OR (NEW."check_in_end_date" IS NOT NULL AND NEW."check_in_end_date" > semester_end) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'class_sections_check_in_semester_range_check',
            MESSAGE = 'ClassSection check-in dates must be inside the Semester range';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM "class_section_excluded_dates" AS excluded
         WHERE excluded."class_section_id" = NEW."id"
           AND (
               excluded."excluded_date" < semester_start
               OR excluded."excluded_date" > semester_end
               OR (NEW."check_in_start_date" IS NOT NULL AND excluded."excluded_date" < NEW."check_in_start_date")
               OR (NEW."check_in_end_date" IS NOT NULL AND excluded."excluded_date" > NEW."check_in_end_date")
           )
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'class_section_excluded_dates_parent_range_check',
            MESSAGE = 'Existing excluded dates must remain inside the ClassSection and Semester ranges';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "class_sections_calendar_trigger"
BEFORE INSERT OR UPDATE OF "semester_id", "organization_id", "check_in_start_date", "check_in_end_date"
ON "class_sections"
FOR EACH ROW EXECUTE FUNCTION "validate_class_section_calendar"();

CREATE FUNCTION "validate_class_section_excluded_date"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    semester_start DATE;
    semester_end DATE;
    window_start DATE;
    window_end DATE;
BEGIN
    SELECT semester."start_date", semester."end_date", section."check_in_start_date", section."check_in_end_date"
      INTO semester_start, semester_end, window_start, window_end
      FROM "class_sections" AS section
      JOIN "semesters" AS semester
        ON semester."id" = section."semester_id"
       AND semester."organization_id" = section."organization_id"
     WHERE section."id" = NEW."class_section_id"
       AND section."organization_id" = NEW."organization_id";

    IF NOT FOUND
       OR NEW."excluded_date" < semester_start
       OR NEW."excluded_date" > semester_end
       OR (window_start IS NOT NULL AND NEW."excluded_date" < window_start)
       OR (window_end IS NOT NULL AND NEW."excluded_date" > window_end) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'class_section_excluded_dates_range_check',
            MESSAGE = 'Excluded date must be inside the ClassSection and Semester ranges';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "class_section_excluded_dates_range_trigger"
BEFORE INSERT OR UPDATE ON "class_section_excluded_dates"
FOR EACH ROW EXECUTE FUNCTION "validate_class_section_excluded_date"();
