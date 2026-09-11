CREATE TABLE v81_ocr_draft_revisions (
  batch_id UUID NOT NULL REFERENCES v81_ocr_batches(id),
  version INTEGER NOT NULL CHECK(version>0),
  selections JSONB NOT NULL CHECK(jsonb_typeof(selections)='array' AND jsonb_array_length(selections) BETWEEN 1 AND 1000),
  draft_rows JSONB NOT NULL CHECK(jsonb_typeof(draft_rows)='array' AND jsonb_array_length(draft_rows) BETWEEN 1 AND 500),
  actor_id UUID NOT NULL REFERENCES users(id),
  request_id VARCHAR(64) NOT NULL CHECK(length(btrim(request_id))>0),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(batch_id,version),
  CHECK(octet_length(selections::text)+octet_length(draft_rows::text)<=8388608)
);
CREATE FUNCTION guard_v81_ocr_draft() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE batch v81_ocr_batches%ROWTYPE; previous v81_ocr_draft_revisions%ROWTYPE; selected JSONB; item JSONB;
  current_origins JSONB; previous_origins JSONB; selected_pages INTEGER; expected INTEGER;
BEGIN
  SELECT * INTO batch FROM v81_ocr_batches WHERE id=NEW.batch_id FOR UPDATE;
  IF batch.id IS NULL OR NEW.created_at<batch.created_at OR NOT EXISTS(
    SELECT 1 FROM class_sections c JOIN semesters s ON s.id=c.semester_id JOIN teacher_profiles t ON t.id=c.teacher_id
    WHERE c.id=batch.class_section_id AND t.user_id=NEW.actor_id AND s.status<>'ARCHIVED'
      AND (c.status IN ('UPCOMING','ACTIVE') OR (c.status='CLOSED' AND batch.created_at<=c.closed_at)))
    THEN RAISE EXCEPTION 'OCR draft requires responsible teacher and legal original source'; END IF;
  SELECT * INTO previous FROM v81_ocr_draft_revisions WHERE batch_id=NEW.batch_id ORDER BY version DESC LIMIT 1;
  expected:=coalesce(previous.version,0)+1;
  IF NEW.version<>expected THEN RAISE EXCEPTION 'OCR draft versions must be consecutive'; END IF;
  IF previous.version IS NOT NULL THEN
    IF NEW.selections IS DISTINCT FROM previous.selections OR NEW.created_at<previous.created_at
      THEN RAISE EXCEPTION 'OCR draft source selections are immutable'; END IF;
    SELECT jsonb_agg(jsonb_build_object('id',value->'id','source',value->'source','ocrIssues',value->'ocrIssues') ORDER BY ordinality)
      INTO current_origins FROM jsonb_array_elements(NEW.draft_rows) WITH ORDINALITY;
    SELECT jsonb_agg(jsonb_build_object('id',value->'id','source',value->'source','ocrIssues',value->'ocrIssues') ORDER BY ordinality)
      INTO previous_origins FROM jsonb_array_elements(previous.draft_rows) WITH ORDINALITY;
    IF current_origins IS DISTINCT FROM previous_origins THEN RAISE EXCEPTION 'OCR draft original rows cannot be deleted reordered or rewritten'; END IF;
  ELSE
    SELECT count(DISTINCT value->>'pageId') INTO selected_pages FROM jsonb_array_elements(NEW.selections);
    IF selected_pages<>jsonb_array_length(batch.source_manifest) THEN RAISE EXCEPTION 'OCR draft must cover every source page'; END IF;
    IF EXISTS(SELECT 1 FROM v81_ocr_jobs WHERE batch_id=NEW.batch_id AND status IN ('QUEUED','RUNNING'))
      THEN RAISE EXCEPTION 'OCR draft cannot use an unfinished recognition batch'; END IF;
    IF (SELECT count(DISTINCT (value->>'pageId',value->>'tableIndex')) FROM jsonb_array_elements(NEW.selections))<>jsonb_array_length(NEW.selections)
      THEN RAISE EXCEPTION 'OCR draft duplicate table selection'; END IF;
    FOR selected IN SELECT value FROM jsonb_array_elements(NEW.selections) LOOP
      IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(batch.source_manifest) p WHERE p->>'id'=selected->>'pageId')
        OR NOT EXISTS(SELECT 1 FROM v81_ocr_page_attempts a WHERE a.batch_id=NEW.batch_id
          AND a.page_id::text=selected->>'pageId' AND a.attempt::text=selected->>'attempt' AND a.outcome='SUCCEEDED'
          AND a.attempt=(SELECT max(z.attempt) FROM v81_ocr_page_attempts z WHERE z.batch_id=a.batch_id AND z.page_id=a.page_id))
        THEN RAISE EXCEPTION 'OCR draft must use latest successful page recognition'; END IF;
    END LOOP;
  END IF;
  IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(NEW.draft_rows))<>jsonb_array_length(NEW.draft_rows)
    THEN RAISE EXCEPTION 'OCR draft row identities must be unique'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(NEW.draft_rows) LOOP
    IF jsonb_typeof(item->'id') IS DISTINCT FROM 'string' OR jsonb_typeof(item->'source') IS DISTINCT FROM 'object'
      OR jsonb_typeof(item->'values') IS DISTINCT FROM 'object' OR jsonb_typeof(item->'ocrIssues') IS DISTINCT FROM 'array'
      OR jsonb_typeof(item->'reviewedAgainstSource') IS DISTINCT FROM 'boolean'
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.selections) s WHERE s->>'pageId'=item->'source'->>'pageId'
        AND s->>'attempt'=item->'source'->>'attempt' AND s->>'tableIndex'=item->'source'->>'tableIndex')
      THEN RAISE EXCEPTION 'OCR draft row source or review shape invalid'; END IF;
    IF NEW.version=1 AND item->'reviewedAgainstSource' IS DISTINCT FROM 'false'::jsonb
      THEN RAISE EXCEPTION 'New OCR draft rows require teacher source review'; END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_ocr_draft_guard BEFORE INSERT ON v81_ocr_draft_revisions FOR EACH ROW EXECUTE FUNCTION guard_v81_ocr_draft();
CREATE TRIGGER v81_ocr_draft_immutable BEFORE UPDATE OR DELETE ON v81_ocr_draft_revisions FOR EACH ROW EXECUTE FUNCTION prevent_v81_history_mutation();
