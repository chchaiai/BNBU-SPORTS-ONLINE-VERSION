-- Each new record retains the counting rules in force when it was created.
CREATE TABLE v81_record_rule_snapshots (
  record_id uuid PRIMARY KEY REFERENCES exercise_records(id) ON DELETE CASCADE,
  rule_version integer NOT NULL,
  minimum_minutes integer NOT NULL CHECK (minimum_minutes BETWEEN 1 AND 1440),
  weekly_limit integer NOT NULL CHECK (weekly_limit > 0),
  daily_limit integer NOT NULL CHECK (daily_limit > 0)
);
INSERT INTO v81_record_rule_snapshots
SELECT e.id,r.version,r.minimum_minutes,r.weekly_limit,r.daily_limit
FROM exercise_records e JOIN v81_course_rules r ON r.class_section_id=e.class_section_id
WHERE r.published_at IS NOT NULL;

CREATE FUNCTION snapshot_v81_record_rules() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rules v81_course_rules;
BEGIN
  SELECT * INTO rules FROM v81_course_rules WHERE class_section_id=NEW.class_section_id FOR SHARE;
  IF rules.published_at IS NOT NULL THEN
    INSERT INTO v81_record_rule_snapshots VALUES
      (NEW.id,rules.version,rules.minimum_minutes,rules.weekly_limit,rules.daily_limit);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_record_rules_snapshot AFTER INSERT ON exercise_records
FOR EACH ROW EXECUTE FUNCTION snapshot_v81_record_rules();
CREATE TRIGGER v81_record_rules_no_update BEFORE UPDATE ON v81_record_rule_snapshots
FOR EACH ROW EXECUTE FUNCTION prevent_v81_history_mutation();

CREATE OR REPLACE FUNCTION protect_v81_published_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'V8.1 course rule history cannot be deleted'; END IF;
  IF OLD.published_at IS NOT NULL AND (
    (to_jsonb(NEW)-ARRAY['minimum_minutes','weekly_limit','daily_limit','version'])
      IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['minimum_minutes','weekly_limit','daily_limit','version'])
    OR NEW.version<>OLD.version+1
  ) THEN RAISE EXCEPTION 'Only future record counting rules can change after publication'; END IF;
  RETURN NEW;
END;
$$;
