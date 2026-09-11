CREATE OR REPLACE FUNCTION reject_feedback_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'feedback deletion is forbidden';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status','public_reply','updated_at','version'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','public_reply','updated_at','version']) THEN
    RAISE EXCEPTION 'feedback original submission is immutable';
  END IF;
  IF NEW.version <> OLD.version + 1 OR NEW.updated_at < OLD.updated_at
     OR NEW.status NOT IN ('IN_PROGRESS','WAITING_TECH','RESOLVED','CLOSED')
     OR NEW.public_reply IS NULL OR length(btrim(NEW.public_reply)) = 0 THEN
    RAISE EXCEPTION 'feedback handling requires next version, valid status and public reply';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION require_feedback_handling_history() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM feedback_events e
    WHERE e.feedback_id = NEW.id AND e.organization_id = NEW.organization_id
      AND e.event_version = NEW.version AND e.event_type = 'HANDLED'
      AND e.previous_status = OLD.status AND e.next_status = NEW.status
      AND e.public_reply = NEW.public_reply AND e.occurred_at = NEW.updated_at
  ) THEN
    RAISE EXCEPTION 'feedback handling must append matching history in the same transaction';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER feedback_handling_history_trigger
  AFTER UPDATE ON feedback DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION require_feedback_handling_history();
