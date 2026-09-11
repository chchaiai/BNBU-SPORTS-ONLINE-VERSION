BEGIN;
ALTER TABLE v81_events ADD COLUMN actor_role_snapshot varchar(32)
  CHECK (actor_role_snapshot IS NULL OR actor_role_snapshot IN ('STUDENT','TEACHER','ADMIN'));

-- Historical events remain unknown. Capture only identities visible at insertion.
CREATE FUNCTION capture_v81_event_actor_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.actor_role_snapshot := NULL;
  IF NEW.actor_id IS NOT NULL THEN
    SELECT role::text INTO NEW.actor_role_snapshot FROM users
      WHERE id=NEW.actor_id AND organization_id=NEW.organization_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_event_actor_role BEFORE INSERT ON v81_events
  FOR EACH ROW EXECUTE FUNCTION capture_v81_event_actor_role();
COMMIT;
