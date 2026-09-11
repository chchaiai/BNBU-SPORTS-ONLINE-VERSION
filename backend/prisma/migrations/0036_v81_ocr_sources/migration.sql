CREATE TABLE v81_ocr_batches (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  class_section_id UUID NOT NULL,
  purpose VARCHAR(16) NOT NULL CHECK (purpose IN ('ROSTER','PHYSICAL')),
  source_manifest JSONB NOT NULL CHECK (jsonb_typeof(source_manifest)='array' AND jsonb_array_length(source_manifest) BETWEEN 1 AND 1000),
  total_bytes BIGINT NOT NULL CHECK (total_bytes BETWEEN 1 AND 104857600),
  actor_id UUID NOT NULL,
  request_id VARCHAR(64) NOT NULL CHECK (length(btrim(request_id))>0),
  created_at TIMESTAMPTZ NOT NULL,
  FOREIGN KEY(class_section_id,organization_id) REFERENCES class_sections(id,organization_id),
  FOREIGN KEY(actor_id,organization_id) REFERENCES users(id,organization_id)
);
CREATE INDEX v81_ocr_batches_course_created ON v81_ocr_batches(organization_id,class_section_id,created_at,id);
CREATE FUNCTION guard_v81_ocr_batch() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE page JSONB; total NUMERIC:=0; page_ids TEXT[]:='{}'; keys TEXT[]:='{}'; size NUMERIC;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM class_sections c JOIN teacher_profiles t ON t.id=c.teacher_id
    JOIN semesters s ON s.id=c.semester_id WHERE c.id=NEW.class_section_id AND c.organization_id=NEW.organization_id
      AND t.user_id=NEW.actor_id AND c.status IN ('UPCOMING','ACTIVE') AND s.status<>'ARCHIVED')
    THEN RAISE EXCEPTION 'OCR source requires open course and responsible teacher'; END IF;
  FOR page IN SELECT value FROM jsonb_array_elements(NEW.source_manifest) LOOP
    IF jsonb_typeof(page) IS DISTINCT FROM 'object'
      OR jsonb_typeof(page->'id') IS DISTINCT FROM 'string'
      OR jsonb_typeof(page->'sha256') IS DISTINCT FROM 'string'
      OR jsonb_typeof(page->'storageKey') IS DISTINCT FROM 'string'
      OR jsonb_typeof(page->'mimeType') IS DISTINCT FROM 'string'
      OR jsonb_typeof(page->'sizeBytes') IS DISTINCT FROM 'number'
      THEN RAISE EXCEPTION 'OCR source manifest shape invalid'; END IF;
    IF (page->>'id')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
      OR (page->>'sha256')!~'^[a-f0-9]{64}$'
      OR length(page->>'storageKey') NOT BETWEEN 1 AND 1024
      OR page->>'storageKey'<>btrim(page->>'storageKey')
      OR page->>'mimeType' NOT IN ('image/png','image/jpeg','image/webp')
      OR (page->>'id')=ANY(page_ids) OR (page->>'storageKey')=ANY(keys)
      THEN RAISE EXCEPTION 'OCR source manifest identity invalid'; END IF;
    size:=(page->>'sizeBytes')::numeric;
    IF size<>trunc(size) OR size<1 OR size>104857600 THEN RAISE EXCEPTION 'OCR source size invalid'; END IF;
    total:=total+size;
    page_ids:=array_append(page_ids,page->>'id'); keys:=array_append(keys,page->>'storageKey');
  END LOOP;
  IF total<>NEW.total_bytes OR total>104857600 THEN RAISE EXCEPTION 'OCR batch source bytes mismatch or exceeded'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_ocr_batch_guard BEFORE INSERT ON v81_ocr_batches FOR EACH ROW EXECUTE FUNCTION guard_v81_ocr_batch();
CREATE TRIGGER v81_ocr_batch_immutable BEFORE UPDATE OR DELETE ON v81_ocr_batches
  FOR EACH ROW EXECUTE FUNCTION prevent_v81_history_mutation();

CREATE TABLE v81_ocr_page_attempts (
  batch_id UUID NOT NULL REFERENCES v81_ocr_batches(id),
  page_id UUID NOT NULL,
  attempt INTEGER NOT NULL CHECK(attempt>0),
  source_sha256 CHAR(64) NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
  provider VARCHAR(32) NOT NULL CHECK(provider='TENCENT_TABLE_V3'),
  outcome VARCHAR(16) NOT NULL CHECK(outcome IN ('SUCCEEDED','FAILED')),
  evidence JSONB,
  error_code VARCHAR(64),
  request_id VARCHAR(64) NOT NULL CHECK(length(btrim(request_id))>0),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(batch_id,page_id,attempt),
  CHECK((outcome='SUCCEEDED' AND evidence IS NOT NULL AND jsonb_typeof(evidence)='object' AND error_code IS NULL)
    OR (outcome='FAILED' AND evidence IS NULL AND error_code IS NOT NULL AND error_code ~ '^[A-Z][A-Z0-9_]{0,63}$')),
  CHECK(evidence IS NULL OR octet_length(evidence::text)<=8388608)
);
CREATE FUNCTION guard_v81_ocr_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE batch v81_ocr_batches%ROWTYPE; page JSONB; expected INTEGER;
BEGIN
  SELECT * INTO batch FROM v81_ocr_batches WHERE id=NEW.batch_id FOR UPDATE;
  SELECT value INTO page FROM jsonb_array_elements(batch.source_manifest) WHERE value->>'id'=NEW.page_id::text;
  IF page IS NULL OR page->>'sha256' IS DISTINCT FROM NEW.source_sha256::text
    OR NEW.created_at<batch.created_at THEN RAISE EXCEPTION 'OCR attempt source mismatch'; END IF;
  SELECT coalesce(max(attempt),0)+1 INTO expected FROM v81_ocr_page_attempts WHERE batch_id=NEW.batch_id AND page_id=NEW.page_id;
  IF NEW.attempt<>expected THEN RAISE EXCEPTION 'OCR attempts must be consecutive'; END IF;
  IF NEW.outcome='SUCCEEDED' AND (
    NEW.evidence->>'sourceSha256' IS DISTINCT FROM NEW.source_sha256::text
    OR NEW.evidence->>'provider' IS DISTINCT FROM NEW.provider
    OR NEW.evidence->'requiresTeacherConfirmation' IS DISTINCT FROM 'true'::jsonb
    OR jsonb_typeof(NEW.evidence->'tables') IS DISTINCT FROM 'array')
    THEN RAISE EXCEPTION 'OCR evidence must remain source-bound unconfirmed draft'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_ocr_attempt_guard BEFORE INSERT ON v81_ocr_page_attempts FOR EACH ROW EXECUTE FUNCTION guard_v81_ocr_attempt();
CREATE TRIGGER v81_ocr_attempt_immutable BEFORE UPDATE OR DELETE ON v81_ocr_page_attempts
  FOR EACH ROW EXECUTE FUNCTION prevent_v81_history_mutation();
