-- Retired teaching relationships remain available for student history.
ALTER TABLE class_sections ADD COLUMN retired_at timestamptz;
ALTER TABLE v81_course_rules ADD COLUMN daily_limit integer NOT NULL DEFAULT 1 CHECK (daily_limit > 0);
