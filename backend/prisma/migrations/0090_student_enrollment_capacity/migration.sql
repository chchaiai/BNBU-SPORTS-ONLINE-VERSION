BEGIN;
CREATE TABLE student_enrollment_capacities (
  organization_id uuid NOT NULL,
  student_id uuid NOT NULL,
  semester_id uuid NOT NULL,
  maximum_active integer NOT NULL CHECK (maximum_active = 2),
  reason text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id,student_id,semester_id),
  FOREIGN KEY (student_id,organization_id) REFERENCES student_profiles(id,organization_id) ON DELETE CASCADE,
  FOREIGN KEY (semester_id,organization_id) REFERENCES semesters(id,organization_id) ON DELETE RESTRICT
);
ALTER TABLE enrollments ADD COLUMN capacity_slot integer NOT NULL DEFAULT 1 CHECK (capacity_slot IN (1,2));
CREATE UNIQUE INDEX enrollments_active_capacity_slot_idx
  ON enrollments(organization_id,semester_id,student_id,capacity_slot) WHERE status='ACTIVE';
CREATE FUNCTION enforce_student_enrollment_capacity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE capacity integer; available_slot integer;
BEGIN
  IF NEW.status <> 'ACTIVE' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND OLD.status='ACTIVE' AND
     (NEW.organization_id,NEW.student_id,NEW.semester_id,NEW.capacity_slot) IS NOT DISTINCT FROM
     (OLD.organization_id,OLD.student_id,OLD.semester_id,OLD.capacity_slot) THEN RETURN NEW; END IF;
  PERFORM 1 FROM student_profiles WHERE id=NEW.student_id AND organization_id=NEW.organization_id FOR UPDATE;
  SELECT COALESCE((SELECT maximum_active FROM student_enrollment_capacities
    WHERE organization_id=NEW.organization_id AND student_id=NEW.student_id AND semester_id=NEW.semester_id),1) INTO capacity;
  SELECT slot INTO available_slot FROM generate_series(1,capacity) AS slot
    WHERE NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.organization_id=NEW.organization_id
      AND e.student_id=NEW.student_id AND e.semester_id=NEW.semester_id AND e.status='ACTIVE'
      AND e.id<>NEW.id AND e.capacity_slot=slot) ORDER BY slot LIMIT 1;
  IF available_slot IS NULL THEN
    RAISE EXCEPTION 'ENROLLMENT_SEMESTER_CONFLICT' USING ERRCODE='23505',CONSTRAINT='enrollments_active_capacity_slot_idx';
  END IF;
  NEW.capacity_slot := available_slot;
  RETURN NEW;
END;
$$;
CREATE TRIGGER enrollments_capacity_guard BEFORE INSERT OR UPDATE ON enrollments
  FOR EACH ROW EXECUTE FUNCTION enforce_student_enrollment_capacity();
DROP INDEX enrollments_one_active_per_semester_student_idx;
COMMIT;
