CREATE TABLE v81_runtime_archive_cleanup (
  archive_id UUID PRIMARY KEY REFERENCES v81_runtime_archives(id),
  id UUID NOT NULL UNIQUE,
  deleted_at TIMESTAMPTZ NOT NULL CHECK(isfinite(deleted_at))
);
CREATE FUNCTION guard_v81_runtime_archive_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Runtime archive cleanup history is immutable'; END IF;
  IF NOT EXISTS(SELECT 1 FROM v81_runtime_archives j WHERE j.id=NEW.archive_id
    AND j.storage_key IS NOT NULL AND (j.status IN ('CANCELLED','EXPIRED') OR j.expires_at<=NEW.deleted_at))
    THEN RAISE EXCEPTION 'Runtime archive artifact is not eligible for cleanup'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_runtime_archive_cleanup_guard BEFORE INSERT OR UPDATE OR DELETE ON v81_runtime_archive_cleanup
  FOR EACH ROW EXECUTE FUNCTION guard_v81_runtime_archive_cleanup();
