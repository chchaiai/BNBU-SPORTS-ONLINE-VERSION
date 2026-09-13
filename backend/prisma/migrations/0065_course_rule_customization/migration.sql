ALTER TABLE v81_course_rules DROP CONSTRAINT v81_course_rules_minimum_minutes_check;
ALTER TABLE v81_course_rules DROP CONSTRAINT v81_course_rules_weekly_limit_check;
ALTER TABLE v81_course_rules ADD CONSTRAINT v81_course_rules_minimum_minutes_check CHECK (minimum_minutes BETWEEN 1 AND 1440);
ALTER TABLE v81_course_rules ADD CONSTRAINT v81_course_rules_weekly_limit_check CHECK (weekly_limit > 0);
