-- End operational applications while retaining original facts, reviews and media.
ALTER TABLE exemption_applications ADD COLUMN membership_cleared_at timestamptz;
ALTER TABLE exemption_applications DROP CONSTRAINT exemption_applications_time_shape_check;
ALTER TABLE exemption_applications ADD CONSTRAINT exemption_applications_time_shape_check CHECK (
 (membership_cleared_at IS NOT NULL AND status='REVOKED' AND decided_at IS NOT NULL)
 OR (status='DRAFT' AND submitted_at IS NULL AND decided_at IS NULL)
 OR (status IN ('SUBMITTED','SUPPLEMENT_REQUIRED') AND submitted_at IS NOT NULL AND decided_at IS NULL)
 OR (status IN ('APPROVED','REJECTED','REVOKED') AND submitted_at IS NOT NULL AND decided_at IS NOT NULL));
CREATE OR REPLACE FUNCTION guard_exemption_application_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.organization_id,NEW.semester_id,NEW.student_id,NEW.enrollment_id,NEW.class_section_id,NEW.application_type)
    IS DISTINCT FROM ROW(OLD.organization_id,OLD.semester_id,OLD.student_id,OLD.enrollment_id,OLD.class_section_id,OLD.application_type) THEN
    RAISE EXCEPTION 'exemption application scope is immutable';
  END IF;
  IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'exemption application version must increase by one'; END IF;
  IF NEW.membership_cleared_at IS DISTINCT FROM OLD.membership_cleared_at THEN
    IF OLD.membership_cleared_at IS NOT NULL OR NEW.membership_cleared_at IS NULL OR NEW.status<>'REVOKED'
      OR NOT EXISTS(SELECT 1 FROM enrollments e WHERE e.id=NEW.enrollment_id AND e.status='REMOVED') THEN
      RAISE EXCEPTION 'invalid membership application clearance';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.membership_cleared_at IS NOT NULL THEN RAISE EXCEPTION 'cleared application is immutable'; END IF;
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

CREATE FUNCTION clear_removed_enrollment_applications(target_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE item record; target enrollments%ROWTYPE; event_hex text; event_suffix text;
BEGIN
 SELECT * INTO target FROM enrollments WHERE id=target_id;
 IF target.status<>'REMOVED' THEN RETURN; END IF;
 -- A finalized settlement is an immutable historical result.
 IF EXISTS(SELECT 1 FROM v81_settlement_report_revisions WHERE class_section_id=target.class_section_id) THEN RETURN; END IF;
 FOR item IN SELECT * FROM exemption_applications WHERE enrollment_id=target_id AND membership_cleared_at IS NULL FOR UPDATE LOOP
  UPDATE exemption_applications SET membership_cleared_at=now(),status='REVOKED',decided_at=coalesce(decided_at,now()),updated_at=now(),version=version+1 WHERE id=item.id;
  UPDATE v81_certification_credits SET active=false,version=version+1 WHERE application_id=item.id AND active=true;
  event_hex := lpad(to_hex(floor(extract(epoch from clock_timestamp())*1000)::bigint),12,'0');
  event_suffix := md5('membership-clear:'||item.id::text);
  INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,is_system_actor,event_outcome,event_reason_code,request_id,version,facts,occurred_at)
  VALUES((substr(event_hex,1,8)||'-'||substr(event_hex,9,4)||'-7'||substr(event_suffix,1,3)||'-8'||substr(event_suffix,4,3)||'-'||substr(event_suffix,7,12))::uuid,target.organization_id,'EXEMPTION_MEMBERSHIP',item.id,'MEMBERSHIP_CLEARED',NULL,true,'SUCCEEDED','ENROLLMENT_REMOVED','membership-clear-'||target_id::text,item.version+1,
    jsonb_build_object('enrollmentId',target_id,'previousStatus',item.status,'membershipVersion',target.version,'historyRetained',true),now());
 END LOOP;
END;
$$;
CREATE FUNCTION clear_applications_on_membership_end() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='REMOVED' AND OLD.status IS DISTINCT FROM NEW.status THEN
  PERFORM clear_removed_enrollment_applications(NEW.id);
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER enrollments_clear_applications AFTER UPDATE OF status ON enrollments
 FOR EACH ROW EXECUTE FUNCTION clear_applications_on_membership_end();
-- Apply the confirmed rule to previously removed members; settled facts are excluded above.
SELECT clear_removed_enrollment_applications(id) FROM enrollments WHERE status='REMOVED';
