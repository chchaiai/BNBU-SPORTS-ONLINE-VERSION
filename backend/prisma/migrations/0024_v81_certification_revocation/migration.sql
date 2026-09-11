ALTER TABLE exemption_applications DROP CONSTRAINT exemption_applications_status_check;
ALTER TABLE exemption_applications ADD CONSTRAINT exemption_applications_status_check CHECK (status IN ('DRAFT','SUBMITTED','SUPPLEMENT_REQUIRED','APPROVED','REJECTED','REVOKED'));
ALTER TABLE exemption_applications DROP CONSTRAINT exemption_applications_time_shape_check;
ALTER TABLE exemption_applications ADD CONSTRAINT exemption_applications_time_shape_check CHECK (
  (status='DRAFT' AND submitted_at IS NULL AND decided_at IS NULL)
  OR (status IN ('SUBMITTED','SUPPLEMENT_REQUIRED') AND submitted_at IS NOT NULL AND decided_at IS NULL)
  OR (status IN ('APPROVED','REJECTED','REVOKED') AND submitted_at IS NOT NULL AND decided_at IS NOT NULL)
);
ALTER TABLE exemption_application_events DROP CONSTRAINT exemption_application_events_type_check;
ALTER TABLE exemption_application_events ADD CONSTRAINT exemption_application_events_type_check CHECK (event_type IN ('CREATED','UPDATED','SUBMITTED','REVIEWED','REVOKED'));
ALTER TABLE exemption_application_events DROP CONSTRAINT exemption_application_events_status_check;
ALTER TABLE exemption_application_events ADD CONSTRAINT exemption_application_events_status_check CHECK (
  to_status IN ('DRAFT','SUBMITTED','SUPPLEMENT_REQUIRED','APPROVED','REJECTED','REVOKED')
  AND (from_status IS NULL OR from_status IN ('DRAFT','SUBMITTED','SUPPLEMENT_REQUIRED','APPROVED','REJECTED','REVOKED'))
);
ALTER TABLE exemption_review_records DROP CONSTRAINT exemption_review_records_decision_check;
ALTER TABLE exemption_review_records ADD CONSTRAINT exemption_review_records_decision_check CHECK (decision IN ('APPROVE','REJECT','REQUEST_SUPPLEMENT','REVOKE'));
CREATE OR REPLACE FUNCTION guard_exemption_application_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.organization_id,NEW.semester_id,NEW.student_id,NEW.enrollment_id,NEW.class_section_id,NEW.application_type)
    IS DISTINCT FROM ROW(OLD.organization_id,OLD.semester_id,OLD.student_id,OLD.enrollment_id,OLD.class_section_id,OLD.application_type) THEN
    RAISE EXCEPTION 'exemption application scope is immutable';
  END IF;
  IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'exemption application version must increase by one'; END IF;
  IF NOT (
    (OLD.status='DRAFT' AND NEW.status IN ('DRAFT','SUBMITTED'))
    OR (OLD.status='SUPPLEMENT_REQUIRED' AND NEW.status IN ('SUPPLEMENT_REQUIRED','SUBMITTED'))
    OR (OLD.status='SUBMITTED' AND NEW.status IN ('SUPPLEMENT_REQUIRED','APPROVED','REJECTED'))
    OR (OLD.status='APPROVED' AND NEW.status='REVOKED' AND OLD.application_type='EXERCISE_CHECK_IN')
  ) THEN RAISE EXCEPTION 'unsupported exemption application transition'; END IF;
  RETURN NEW;
END;
$$;
