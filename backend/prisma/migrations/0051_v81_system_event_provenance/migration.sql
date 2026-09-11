BEGIN;
ALTER TABLE v81_events
  ADD COLUMN is_system_actor boolean NOT NULL DEFAULT false,
  ADD COLUMN event_outcome varchar(32) CHECK (event_outcome IS NULL OR event_outcome IN ('SUCCEEDED','FAILED')),
  ADD COLUMN event_reason_code varchar(100) CHECK (event_reason_code IS NULL OR event_reason_code ~ '^[A-Z][A-Z0-9_]*$');
ALTER TABLE v81_events DROP CONSTRAINT v81_events_actor_role_snapshot_check;
ALTER TABLE v81_events ADD CONSTRAINT v81_events_actor_role_snapshot_check
  CHECK (actor_role_snapshot IS NULL OR actor_role_snapshot IN ('STUDENT','TEACHER','ADMIN','SYSTEM'));
ALTER TABLE v81_events ADD CONSTRAINT v81_events_system_actor_check
  CHECK ((is_system_actor AND actor_id IS NULL AND actor_role_snapshot IS NOT DISTINCT FROM 'SYSTEM')
    OR (NOT is_system_actor AND actor_role_snapshot IS DISTINCT FROM 'SYSTEM'));

-- Do not infer system identity from an absent user or rewrite pre-migration events.
CREATE OR REPLACE FUNCTION capture_v81_event_actor_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.actor_role_snapshot := NULL;
  IF NEW.is_system_actor THEN
    IF NEW.actor_id IS NOT NULL THEN
      RAISE EXCEPTION 'system events cannot impersonate a user';
    END IF;
    NEW.actor_role_snapshot := 'SYSTEM';
  ELSIF NEW.actor_id IS NOT NULL THEN
    SELECT role::text INTO NEW.actor_role_snapshot FROM users
      WHERE id=NEW.actor_id AND organization_id=NEW.organization_id;
  END IF;
  RETURN NEW;
END;
$$;
COMMIT;
