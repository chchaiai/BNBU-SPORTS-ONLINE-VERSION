-- Preserve public-reason and system-expiry guards; permit attributed AI decisions.
CREATE OR REPLACE FUNCTION guard_v81_review_notes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.internal_note IS NOT NULL OR NEW.credited_duration_override_seconds IS NOT NULL THEN
    RAISE EXCEPTION 'V8.1 forbids hidden reviewer notes and manual duration overrides';
  END IF;
  IF EXISTS(SELECT 1 FROM v81_record_workflows WHERE record_id=NEW.record_id) AND NEW.result='INVALID' THEN
    IF NEW.reason_code IS NULL OR NEW.reason_code NOT IN ('UNCLEAR_EVIDENCE','MISSING_REQUIRED_EVIDENCE','SESSION_MISMATCH','INCONSISTENT_EVIDENCE','CONFIRMED_REUSE_OR_MISUSE','SUPPLEMENT_DEADLINE_MISSED') THEN
      RAISE EXCEPTION 'V8.1 invalid decision requires an applicable public reason';
    END IF;
    IF NEW.reason_code='SUPPLEMENT_DEADLINE_MISSED' AND NEW.teacher_id IS NOT NULL THEN
      RAISE EXCEPTION 'Supplement expiry is a system decision';
    END IF;
    IF NEW.teacher_id IS NULL AND NEW.reason_code<>'SUPPLEMENT_DEADLINE_MISSED' AND NOT EXISTS (
      SELECT 1 FROM v81_events e JOIN v81_ai_review_jobs j ON j.id::text=e.facts->>'jobId'
      WHERE e.organization_id=NEW.organization_id AND e.resource_id=NEW.record_id
        AND e.resource_type='RECORD_REVIEW' AND e.event_type='AI_AUTO_DECISION' AND e.is_system_actor
        AND e.event_outcome='SUCCEEDED' AND e.facts->>'reviewId'=NEW.id::text AND e.facts->>'decision'='INVALID'
        AND j.record_id=NEW.record_id AND j.organization_id=NEW.organization_id
        AND j.status='SUCCEEDED' AND j.policy_version='auto-decision-v2'
    ) THEN
      RAISE EXCEPTION 'AI system rejection requires a successful job and attributed audit';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
