CREATE TABLE v81_physical_result_revisions (
  enrollment_id UUID NOT NULL REFERENCES enrollments(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  version INTEGER NOT NULL CHECK(version>0),
  run_type VARCHAR(8) NOT NULL CHECK(run_type IN ('800m','1000m')),
  elapsed_seconds BIGINT NOT NULL CHECK(elapsed_seconds>=0 AND elapsed_seconds<=9007199254740991),
  tested_on DATE NOT NULL,
  actor_id UUID NOT NULL REFERENCES users(id),
  request_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(enrollment_id,version)
);
CREATE INDEX v81_physical_results_org_idx ON v81_physical_result_revisions(organization_id,enrollment_id,version DESC);
CREATE TRIGGER v81_physical_results_immutable BEFORE UPDATE OR DELETE ON v81_physical_result_revisions
  FOR EACH ROW EXECUTE FUNCTION prevent_v81_history_mutation();
CREATE FUNCTION guard_v81_physical_result_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE scope_id UUID; owner_id UUID; expected INTEGER;
BEGIN
  PERFORM id FROM enrollments WHERE id=NEW.enrollment_id FOR UPDATE;
  SELECT e.organization_id,t.user_id INTO scope_id,owner_id FROM enrollments e
    JOIN class_sections c ON c.id=e.class_section_id JOIN teacher_profiles t ON t.id=c.teacher_id
    WHERE e.id=NEW.enrollment_id;
  IF scope_id IS DISTINCT FROM NEW.organization_id OR owner_id IS DISTINCT FROM NEW.actor_id
    THEN RAISE EXCEPTION 'physical result requires responsible teacher and enrollment organization'; END IF;
  SELECT coalesce(max(version),0)+1 INTO expected FROM v81_physical_result_revisions WHERE enrollment_id=NEW.enrollment_id;
  IF NEW.version<>expected THEN RAISE EXCEPTION 'physical result version must be consecutive'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_physical_result_revision_guard BEFORE INSERT ON v81_physical_result_revisions
  FOR EACH ROW EXECUTE FUNCTION guard_v81_physical_result_revision();
