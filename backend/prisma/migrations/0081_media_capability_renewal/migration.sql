-- Renew only an ACTIVE transport capability. Business ownership, object identity and confirmation remain immutable.
CREATE OR REPLACE FUNCTION guard_media_upload_session_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.organization_id <> NEW.organization_id OR OLD.media_id <> NEW.media_id OR OLD.created_at <> NEW.created_at THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'media upload session identity is immutable';
  END IF;
  IF NEW.version <> OLD.version + 1 OR OLD.status <> 'ACTIVE' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'media upload session transition is not allowed';
  END IF;
  IF NEW.status = 'ACTIVE' THEN
    IF NEW.capability_expires_at <= OLD.capability_expires_at
      OR NEW.updated_at < OLD.updated_at
      OR (to_jsonb(NEW) - ARRAY['version','updated_at','capability_expires_at'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['version','updated_at','capability_expires_at']) THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'media capability renewal may only extend expiry';
    END IF;
  ELSIF NEW.status NOT IN ('CONFIRMED','EXPIRED','FAILED') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'media upload session transition is not allowed';
  END IF;
  RETURN NEW;
END;
$$;
