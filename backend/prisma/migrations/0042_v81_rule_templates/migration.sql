CREATE TABLE v81_rule_templates (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  version INTEGER NOT NULL CHECK(version>0),
  display_name VARCHAR(100) NOT NULL CHECK(length(btrim(display_name))>0),
  rules JSONB NOT NULL CHECK(rules = '{"ruleSet":"V8_1","totalTargetMinutes":1200,"minimumMinutesOptions":[30,45,60],"defaultMinimumMinutes":30,"weeklyLimitOptions":[2,3,4],"defaultWeeklyLimit":3,"maximumCreditedMinutes":60,"dailyLimit":1,"creditedUnit":"WHOLE_MINUTE","supplementHours":24,"specialSupplementHours":72,"closingDays":7}'::jsonb),
  actor_id UUID NOT NULL REFERENCES users(id),
  request_id VARCHAR(64) NOT NULL CHECK(length(btrim(request_id))>0),
  published_at TIMESTAMPTZ NOT NULL CHECK(isfinite(published_at)),
  UNIQUE(organization_id,version)
);
CREATE FUNCTION guard_v81_rule_template() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM organizations WHERE id=NEW.organization_id FOR NO KEY UPDATE;
  IF NOT EXISTS(SELECT 1 FROM v81_admin_access a JOIN users u ON u.id=a.user_id
    JOIN system_policies p ON p.organization_id=a.organization_id
    WHERE a.user_id=NEW.actor_id AND a.organization_id=NEW.organization_id AND u.organization_id=NEW.organization_id
      AND a.kind='SUPER' AND NOT a.must_change_password AND u.status='ACTIVE' AND u.deleted_at IS NULL AND p.system_mode='NORMAL')
    THEN RAISE EXCEPTION 'Template publication requires active super administrator in normal mode'; END IF;
  IF NEW.version<>(SELECT coalesce(max(version),0)+1 FROM v81_rule_templates WHERE organization_id=NEW.organization_id)
    THEN RAISE EXCEPTION 'Template version must be consecutive'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_rule_template_guard BEFORE INSERT ON v81_rule_templates FOR EACH ROW EXECUTE FUNCTION guard_v81_rule_template();
CREATE TRIGGER v81_rule_template_immutable BEFORE UPDATE OR DELETE ON v81_rule_templates FOR EACH ROW EXECUTE FUNCTION prevent_v81_history_mutation();
ALTER TABLE v81_course_rules ADD COLUMN template_id UUID REFERENCES v81_rule_templates(id);
CREATE FUNCTION guard_v81_course_template() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.template_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM v81_rule_templates t
    WHERE t.id=NEW.template_id AND t.organization_id=NEW.organization_id
      AND (NEW.published_at IS NULL OR t.published_at<=NEW.published_at))
    THEN RAISE EXCEPTION 'Course template must be published in the same organization'; END IF;
  IF NEW.published_at IS NOT NULL AND NEW.template_id IS NULL
    THEN RAISE EXCEPTION 'New course publication requires an explicit template'; END IF;
  RETURN NEW;
END;
$$;
-- Existing immutable published rules retain their original provenance; never invent a template assignment.
CREATE TRIGGER v81_course_template_guard BEFORE INSERT OR UPDATE ON v81_course_rules FOR EACH ROW EXECUTE FUNCTION guard_v81_course_template();
