CREATE TABLE v81_final_grade_revisions (
  enrollment_id uuid NOT NULL REFERENCES enrollments(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version>0),
  final_grade integer NOT NULL,
  published boolean NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL,
  PRIMARY KEY(enrollment_id,version)
);
CREATE TRIGGER v81_final_grades_immutable BEFORE UPDATE OR DELETE ON v81_final_grade_revisions
  FOR EACH ROW EXECUTE FUNCTION prevent_v81_history_mutation();
CREATE FUNCTION guard_v81_final_grade_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected integer; owner_id uuid; scope_id uuid;
BEGIN
  PERFORM id FROM enrollments WHERE id=NEW.enrollment_id FOR UPDATE;
  SELECT e.organization_id,t.user_id INTO scope_id,owner_id FROM enrollments e
    JOIN class_sections c ON c.id=e.class_section_id JOIN teacher_profiles t ON t.id=c.teacher_id
    WHERE e.id=NEW.enrollment_id;
  IF scope_id IS DISTINCT FROM NEW.organization_id OR owner_id IS DISTINCT FROM NEW.actor_id THEN
    RAISE EXCEPTION 'Final grade requires the responsible teacher and enrollment organization';
  END IF;
  SELECT coalesce(max(version),0)+1 INTO expected FROM v81_final_grade_revisions WHERE enrollment_id=NEW.enrollment_id;
  IF NEW.version<>expected THEN RAISE EXCEPTION 'Final grade revision must append the next version'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_final_grade_revision_guard BEFORE INSERT ON v81_final_grade_revisions
  FOR EACH ROW EXECUTE FUNCTION guard_v81_final_grade_revision();
