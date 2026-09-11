ALTER TABLE "exemption_applications"
  ADD COLUMN "application_subtype" VARCHAR(32),
  ADD COLUMN "organization_name" VARCHAR(128);

ALTER TABLE "exemption_applications"
  ADD CONSTRAINT "exemption_applications_detail_check"
  CHECK (
    (
      "application_subtype" IS NULL
      AND "organization_name" IS NULL
    )
    OR
    (
      "application_type" = 'PHYSICAL_TEST'
      AND "application_subtype" IN ('RUN_800M', 'RUN_1000M')
      AND "organization_name" IS NULL
    )
    OR
    (
      "application_type" = 'EXERCISE_CHECK_IN'
      AND "application_subtype" IN ('SCHOOL_TEAM', 'STUDENT_CLUB')
      AND char_length(btrim("organization_name")) BETWEEN 1 AND 128
    )
    OR
    (
      "application_type" = 'SPECIAL_CIRCUMSTANCE'
      AND "application_subtype" = 'SPECIAL_CIRCUMSTANCE'
      AND "organization_name" IS NULL
    )
  );
