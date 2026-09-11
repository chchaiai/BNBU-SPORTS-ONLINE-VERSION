CREATE TABLE v81_ocr_jobs (
  id UUID PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES v81_ocr_batches(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  page_id UUID NOT NULL,
  actor_id UUID NOT NULL,
  expected_attempt INTEGER NOT NULL CHECK(expected_attempt>=0),
  status VARCHAR(16) NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED')),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  lease_owner UUID,
  lease_until TIMESTAMPTZ,
  result_attempt INTEGER,
  request_id VARCHAR(64) NOT NULL CHECK(length(btrim(request_id))>0),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  FOREIGN KEY(actor_id,organization_id) REFERENCES users(id,organization_id),
  FOREIGN KEY(batch_id,page_id,result_attempt) REFERENCES v81_ocr_page_attempts(batch_id,page_id,attempt),
  CHECK(updated_at>=created_at),
  CHECK((status='QUEUED' AND lease_owner IS NULL AND lease_until IS NULL AND result_attempt IS NULL)
    OR (status='RUNNING' AND lease_owner IS NOT NULL AND lease_until IS NOT NULL AND lease_until>updated_at AND result_attempt IS NULL)
    OR (status IN ('SUCCEEDED','FAILED') AND lease_owner IS NOT NULL AND lease_until IS NOT NULL AND result_attempt=expected_attempt+1))
);
CREATE UNIQUE INDEX v81_ocr_jobs_one_active_page ON v81_ocr_jobs(batch_id,page_id) WHERE status IN ('QUEUED','RUNNING');
CREATE INDEX v81_ocr_jobs_claim ON v81_ocr_jobs(status,lease_until,created_at,id);
CREATE FUNCTION guard_v81_ocr_job() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE batch v81_ocr_batches%ROWTYPE; actual INTEGER; result_outcome TEXT;
BEGIN
  IF TG_OP='INSERT' THEN
    SELECT * INTO batch FROM v81_ocr_batches WHERE id=NEW.batch_id FOR UPDATE;
    IF batch.organization_id IS DISTINCT FROM NEW.organization_id OR batch.actor_id IS DISTINCT FROM NEW.actor_id
      OR NEW.created_at<batch.created_at OR NEW.created_at<>NEW.updated_at
      OR NEW.status<>'QUEUED' OR NEW.version<>1
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(batch.source_manifest) p WHERE p->>'id'=NEW.page_id::text)
      THEN RAISE EXCEPTION 'OCR job scope or initial state invalid'; END IF;
    IF NOT EXISTS(SELECT 1 FROM class_sections c JOIN semesters s ON s.id=c.semester_id JOIN teacher_profiles t ON t.id=c.teacher_id
      WHERE c.id=batch.class_section_id AND t.user_id=NEW.actor_id AND s.status<>'ARCHIVED'
        AND (c.status IN ('UPCOMING','ACTIVE') OR (c.status='CLOSED' AND batch.created_at<=c.closed_at)))
      THEN RAISE EXCEPTION 'OCR job requires existing legal source and responsible teacher'; END IF;
    SELECT coalesce(max(attempt),0) INTO actual FROM v81_ocr_page_attempts WHERE batch_id=NEW.batch_id AND page_id=NEW.page_id;
    IF actual<>NEW.expected_attempt THEN RAISE EXCEPTION 'OCR job expected attempt mismatch'; END IF;
  ELSE
    IF ROW(NEW.id,NEW.batch_id,NEW.organization_id,NEW.page_id,NEW.actor_id,NEW.expected_attempt,NEW.request_id,NEW.created_at)
      IS DISTINCT FROM ROW(OLD.id,OLD.batch_id,OLD.organization_id,OLD.page_id,OLD.actor_id,OLD.expected_attempt,OLD.request_id,OLD.created_at)
      OR NEW.version<>OLD.version+1 OR NEW.updated_at<OLD.updated_at OR OLD.status IN ('SUCCEEDED','FAILED')
      THEN RAISE EXCEPTION 'OCR job immutable scope or version violated'; END IF;
    IF OLD.status='QUEUED' AND NEW.status<>'RUNNING' THEN RAISE EXCEPTION 'OCR job must be claimed before completion'; END IF;
    IF OLD.status='RUNNING' THEN
      IF NEW.status='RUNNING' THEN
        IF OLD.lease_until>NEW.updated_at OR NEW.lease_owner IS NOT DISTINCT FROM OLD.lease_owner
          THEN RAISE EXCEPTION 'OCR job lease is still owned'; END IF;
      ELSIF NEW.status IN ('SUCCEEDED','FAILED') THEN
        IF NEW.lease_owner IS DISTINCT FROM OLD.lease_owner OR NEW.lease_until IS DISTINCT FROM OLD.lease_until
          OR NEW.updated_at>=OLD.lease_until THEN RAISE EXCEPTION 'OCR job completion requires current live lease'; END IF;
        SELECT outcome INTO result_outcome FROM v81_ocr_page_attempts WHERE batch_id=NEW.batch_id AND page_id=NEW.page_id AND attempt=NEW.result_attempt;
        IF result_outcome IS DISTINCT FROM NEW.status THEN RAISE EXCEPTION 'OCR job completion must reference matching attempt'; END IF;
      ELSE RAISE EXCEPTION 'OCR job cannot return to queue'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_ocr_job_guard BEFORE INSERT OR UPDATE ON v81_ocr_jobs FOR EACH ROW EXECUTE FUNCTION guard_v81_ocr_job();
CREATE TRIGGER v81_ocr_job_no_delete BEFORE DELETE ON v81_ocr_jobs FOR EACH ROW EXECUTE FUNCTION prevent_v81_history_mutation();
