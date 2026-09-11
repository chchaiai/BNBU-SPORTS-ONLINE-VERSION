ALTER TABLE exemption_review_records DROP CONSTRAINT exemption_review_records_decision_check;
ALTER TABLE exemption_review_records ADD CONSTRAINT exemption_review_records_decision_check
  CHECK (decision IN ('APPROVE','REJECT','REQUEST_SUPPLEMENT','REVOKE','ADJUST_RECOGNITION'));

CREATE OR REPLACE FUNCTION guard_exemption_application_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.organization_id,NEW.semester_id,NEW.student_id,NEW.enrollment_id,NEW.class_section_id,NEW.application_type)
    IS DISTINCT FROM ROW(OLD.organization_id,OLD.semester_id,OLD.student_id,OLD.enrollment_id,OLD.class_section_id,OLD.application_type) THEN
    RAISE EXCEPTION 'exemption application scope is immutable';
  END IF;
  IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'exemption application version must increase by one'; END IF;
  IF OLD.status='APPROVED' AND NEW.status='APPROVED' THEN
    IF OLD.application_type<>'EXERCISE_CHECK_IN' OR OLD.application_subtype IS NULL OR OLD.application_subtype NOT IN ('SCHOOL_TEAM','STUDENT_CLUB')
      OR ROW(NEW.application_subtype,NEW.organization_name,NEW.reason,NEW.submitted_at,NEW.created_at)
        IS DISTINCT FROM ROW(OLD.application_subtype,OLD.organization_name,OLD.reason,OLD.submitted_at,OLD.created_at) THEN
      RAISE EXCEPTION 'recognition adjustment cannot rewrite accepted application facts';
    END IF;
  ELSIF NOT (
    (OLD.status='DRAFT' AND NEW.status IN ('DRAFT','SUBMITTED'))
    OR (OLD.status='SUPPLEMENT_REQUIRED' AND NEW.status IN ('SUPPLEMENT_REQUIRED','SUBMITTED'))
    OR (OLD.status='SUBMITTED' AND NEW.status IN ('SUPPLEMENT_REQUIRED','APPROVED','REJECTED'))
    OR (OLD.status='APPROVED' AND NEW.status='REVOKED' AND OLD.application_type='EXERCISE_CHECK_IN')
  ) THEN RAISE EXCEPTION 'unsupported exemption application transition'; END IF;
  RETURN NEW;
END;
$$;
