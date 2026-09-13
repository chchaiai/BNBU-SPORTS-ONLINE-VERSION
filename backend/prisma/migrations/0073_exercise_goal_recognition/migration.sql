-- Recognition remains bounded by the course allocation in the application transaction.
ALTER TABLE v81_certification_credits DROP CONSTRAINT v81_certification_credits_course_minutes_check;
ALTER TABLE v81_certification_credits ADD CONSTRAINT v81_certification_credits_course_minutes_check CHECK (course_minutes >= 0);
ALTER TABLE v81_certification_credits DROP CONSTRAINT v81_certification_credits_general_minutes_check;
ALTER TABLE v81_certification_credits ADD CONSTRAINT v81_certification_credits_general_minutes_check CHECK (general_minutes >= 0);
ALTER TABLE v81_certification_credits DROP CONSTRAINT v81_certification_credits_check;
ALTER TABLE v81_certification_credits ADD CONSTRAINT v81_certification_credits_check CHECK (course_minutes::bigint+general_minutes <= 2147483647);
CREATE INDEX exercise_sessions_due_limit_idx ON exercise_sessions(current_interval_started_at,id)
  WHERE status='IN_PROGRESS' AND maximum_duration_seconds IS NOT NULL;
