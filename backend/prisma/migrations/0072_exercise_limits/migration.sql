-- Existing sessions keep NULL (their original unlimited running duration and 60 minute credit cap).
ALTER TABLE exercise_sessions ADD COLUMN maximum_duration_seconds integer
  CHECK (maximum_duration_seconds BETWEEN 60 AND 86400);
ALTER TABLE v81_course_rules ADD COLUMN maximum_minutes integer CHECK (maximum_minutes BETWEEN 1 AND 1440);
ALTER TABLE v81_course_rules ADD COLUMN target_global_version integer NOT NULL DEFAULT 0 CHECK (target_global_version >= 0);
ALTER TABLE v81_course_rules ADD CONSTRAINT v81_course_rules_maximum_check
  CHECK (maximum_minutes IS NULL OR maximum_minutes >= minimum_minutes);
ALTER TABLE v81_course_rules DROP CONSTRAINT v81_course_rules_course_target_check;
ALTER TABLE v81_course_rules DROP CONSTRAINT v81_course_rules_general_target_check;
ALTER TABLE v81_course_rules DROP CONSTRAINT v81_course_rules_check;
ALTER TABLE v81_course_rules ADD CONSTRAINT v81_course_rules_course_target_check CHECK (course_target >= 0);
ALTER TABLE v81_course_rules ADD CONSTRAINT v81_course_rules_general_target_check CHECK (general_target >= 0);
ALTER TABLE v81_course_rules ADD CONSTRAINT v81_course_rules_check CHECK (course_target::bigint + general_target BETWEEN 1 AND 2147483647);

CREATE TABLE v81_exercise_goal_settings (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE RESTRICT,
  total_target_minutes integer NOT NULL DEFAULT 1200 CHECK (total_target_minutes > 0),
  version integer NOT NULL CHECK (version > 0),
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL
);

ALTER TABLE v81_record_rule_snapshots ADD COLUMN maximum_minutes integer NOT NULL DEFAULT 60
  CHECK (maximum_minutes BETWEEN 1 AND 1440);
CREATE OR REPLACE FUNCTION snapshot_v81_record_rules() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rules v81_course_rules; maximum_seconds integer;
BEGIN
  SELECT * INTO rules FROM v81_course_rules WHERE class_section_id=NEW.class_section_id FOR SHARE;
  SELECT maximum_duration_seconds INTO maximum_seconds FROM exercise_sessions WHERE id=NEW.session_id;
  IF rules.published_at IS NOT NULL THEN
    INSERT INTO v81_record_rule_snapshots(record_id,rule_version,minimum_minutes,weekly_limit,daily_limit,maximum_minutes)
      VALUES (NEW.id,rules.version,rules.minimum_minutes,rules.weekly_limit,rules.daily_limit,COALESCE(maximum_seconds / 60,60));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION protect_v81_published_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'V8.1 course rule history cannot be deleted'; END IF;
  IF OLD.published_at IS NOT NULL AND (
    (to_jsonb(NEW)-ARRAY['minimum_minutes','maximum_minutes','weekly_limit','daily_limit','version','course_target','general_target','target_global_version'])
      IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['minimum_minutes','maximum_minutes','weekly_limit','daily_limit','version','course_target','general_target','target_global_version'])
    OR NEW.version<>OLD.version+1
  ) THEN RAISE EXCEPTION 'Only future counting rules and global target allocations can change after publication'; END IF;
  RETURN NEW;
END;
$$;
