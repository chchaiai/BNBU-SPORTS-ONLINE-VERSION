ALTER TABLE v81_confirmed_rosters ALTER COLUMN roster_import_id DROP NOT NULL;
ALTER TABLE v81_confirmed_rosters ADD COLUMN ocr_batch_id UUID UNIQUE REFERENCES v81_ocr_batches(id);
ALTER TABLE v81_confirmed_rosters ADD CONSTRAINT v81_confirmed_roster_one_source
  CHECK((roster_import_id IS NOT NULL)::integer+(ocr_batch_id IS NOT NULL)::integer=1);
ALTER TABLE v81_confirmed_rosters ADD CONSTRAINT v81_confirmed_roster_ocr_draft_fk
  FOREIGN KEY(ocr_batch_id,source_version) REFERENCES v81_ocr_draft_revisions(batch_id,version);
DROP TRIGGER v81_confirmed_roster_guard ON v81_confirmed_rosters;
CREATE TRIGGER v81_confirmed_roster_guard BEFORE INSERT ON v81_confirmed_rosters
  FOR EACH ROW WHEN(NEW.roster_import_id IS NOT NULL) EXECUTE FUNCTION guard_v81_confirmed_roster();

CREATE FUNCTION v81_ocr_roster_source_rows(batch UUID,draft_version INTEGER) RETURNS JSONB LANGUAGE sql STABLE AS $$
  WITH rows AS (SELECT value,ordinality,upper(normalize(btrim(value->'values'->>'studentNumber'),NFC)) AS number
    FROM v81_ocr_draft_revisions d CROSS JOIN LATERAL jsonb_array_elements(d.draft_rows) WITH ORDINALITY
    WHERE d.batch_id=batch AND d.version=draft_version)
  SELECT jsonb_agg(jsonb_build_object('id',value->'id','sourceRowNumber',ordinality,'studentNumber',number,
    'fullName',normalize(btrim(value->'values'->>'name'),NFC),'rawStudentNumber',value->'values'->'studentNumber',
    'rawFullName',value->'values'->'name','ocrSource',value->'source','ocrIssues',value->'ocrIssues',
    'duplicateIdentity',(SELECT count(*) FROM rows other WHERE other.number=rows.number)>1) ORDER BY ordinality) FROM rows;
$$;
CREATE FUNCTION guard_v81_ocr_roster_confirmation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE batch v81_ocr_batches%ROWTYPE; draft v81_ocr_draft_revisions%ROWTYPE; expected INTEGER;
BEGIN
  PERFORM id FROM class_sections WHERE id=NEW.class_section_id FOR UPDATE;
  SELECT * INTO batch FROM v81_ocr_batches WHERE id=NEW.ocr_batch_id FOR UPDATE;
  SELECT * INTO draft FROM v81_ocr_draft_revisions WHERE batch_id=batch.id ORDER BY version DESC LIMIT 1;
  IF batch.purpose IS DISTINCT FROM 'ROSTER' OR batch.organization_id IS DISTINCT FROM NEW.organization_id
    OR batch.class_section_id IS DISTINCT FROM NEW.class_section_id OR draft.version IS DISTINCT FROM NEW.source_version
    OR NEW.confirmed_at<draft.created_at OR NEW.source_rows IS DISTINCT FROM v81_ocr_roster_source_rows(batch.id,draft.version)
    OR NEW.source_sha256 IS DISTINCT FROM encode(sha256(convert_to(batch.source_manifest::text,'UTF8')),'hex')
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(draft.draft_rows) r WHERE r->'reviewedAgainstSource' IS DISTINCT FROM 'true'::jsonb
      OR jsonb_typeof(r->'values'->'studentNumber') IS DISTINCT FROM 'string' OR jsonb_typeof(r->'values'->'name') IS DISTINCT FROM 'string'
      OR length(btrim(r->'values'->>'studentNumber')) NOT BETWEEN 1 AND 32 OR length(btrim(r->'values'->>'name')) NOT BETWEEN 1 AND 100)
    THEN RAISE EXCEPTION 'OCR roster requires complete latest reviewed source and original evidence'; END IF;
  IF NOT EXISTS(SELECT 1 FROM class_sections c JOIN semesters s ON s.id=c.semester_id
    JOIN teacher_profiles t ON t.id=c.teacher_id JOIN system_policies p ON p.organization_id=c.organization_id
    WHERE c.id=NEW.class_section_id AND t.user_id=NEW.actor_id AND p.system_mode='NORMAL' AND s.status<>'ARCHIVED'
      AND (c.status IN ('UPCOMING','ACTIVE') OR (c.status='CLOSED' AND batch.created_at<=c.closed_at)))
    THEN RAISE EXCEPTION 'OCR roster confirmation requires responsible teacher and legal source'; END IF;
  SELECT coalesce(max(version),0)+1 INTO expected FROM v81_confirmed_rosters WHERE class_section_id=NEW.class_section_id;
  IF NEW.version<>expected THEN RAISE EXCEPTION 'confirmed roster versions must be consecutive'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_ocr_roster_confirmation_guard BEFORE INSERT ON v81_confirmed_rosters
  FOR EACH ROW WHEN(NEW.ocr_batch_id IS NOT NULL) EXECUTE FUNCTION guard_v81_ocr_roster_confirmation();

CREATE TABLE v81_roster_basis_history (
  class_section_id UUID NOT NULL REFERENCES class_sections(id),
  version INTEGER NOT NULL CHECK(version>0),
  roster_import_id UUID REFERENCES official_roster_imports(id),
  ocr_batch_id UUID REFERENCES v81_ocr_batches(id),
  observed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(class_section_id,version),
  CHECK((roster_import_id IS NOT NULL)::integer+(ocr_batch_id IS NOT NULL)::integer=1)
);
CREATE FUNCTION guard_v81_roster_basis() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected INTEGER;
BEGIN
  PERFORM id FROM class_sections WHERE id=NEW.class_section_id FOR UPDATE;
  SELECT coalesce(max(version),0)+1 INTO expected FROM v81_roster_basis_history WHERE class_section_id=NEW.class_section_id;
  IF NEW.version<>expected OR (NEW.roster_import_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM official_roster_imports
      WHERE id=NEW.roster_import_id AND class_section_id=NEW.class_section_id AND is_current))
    OR (NEW.ocr_batch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM v81_confirmed_rosters
      WHERE ocr_batch_id=NEW.ocr_batch_id AND class_section_id=NEW.class_section_id))
    THEN RAISE EXCEPTION 'roster basis requires consecutive version and scoped current or confirmed source'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_roster_basis_guard BEFORE INSERT ON v81_roster_basis_history FOR EACH ROW EXECUTE FUNCTION guard_v81_roster_basis();
CREATE TRIGGER v81_roster_basis_immutable BEFORE UPDATE OR DELETE ON v81_roster_basis_history FOR EACH ROW EXECUTE FUNCTION prevent_v81_history_mutation();
INSERT INTO v81_roster_basis_history(class_section_id,version,roster_import_id)
  SELECT class_section_id,1,id FROM official_roster_imports WHERE is_current;
CREATE FUNCTION select_v81_electronic_roster_basis() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_current AND (TG_OP='INSERT' OR NOT OLD.is_current) THEN
    PERFORM id FROM class_sections WHERE id=NEW.class_section_id FOR UPDATE;
    INSERT INTO v81_roster_basis_history(class_section_id,version,roster_import_id)
      SELECT NEW.class_section_id,coalesce(max(version),0)+1,NEW.id FROM v81_roster_basis_history WHERE class_section_id=NEW.class_section_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_electronic_roster_basis AFTER INSERT OR UPDATE OF is_current ON official_roster_imports
  FOR EACH ROW EXECUTE FUNCTION select_v81_electronic_roster_basis();
CREATE FUNCTION select_v81_ocr_roster_basis() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO v81_roster_basis_history(class_section_id,version,ocr_batch_id)
    SELECT NEW.class_section_id,coalesce(max(version),0)+1,NEW.ocr_batch_id FROM v81_roster_basis_history WHERE class_section_id=NEW.class_section_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_ocr_roster_basis AFTER INSERT ON v81_confirmed_rosters
  FOR EACH ROW WHEN(NEW.ocr_batch_id IS NOT NULL) EXECUTE FUNCTION select_v81_ocr_roster_basis();
CREATE VIEW v81_current_confirmed_rosters AS
  WITH basis AS (SELECT DISTINCT ON(class_section_id) * FROM v81_roster_basis_history ORDER BY class_section_id,version DESC)
  SELECT c.* FROM basis b JOIN v81_confirmed_rosters c ON c.class_section_id=b.class_section_id
    AND (c.ocr_batch_id=b.ocr_batch_id OR c.roster_import_id=b.roster_import_id)
  LEFT JOIN official_roster_imports i ON i.id=b.roster_import_id
  WHERE b.ocr_batch_id IS NOT NULL OR (i.is_current AND i.status='VALIDATED');
CREATE FUNCTION guard_v81_confirmed_ocr_roster_draft() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM v81_ocr_batches WHERE id=NEW.batch_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM v81_confirmed_rosters WHERE ocr_batch_id=NEW.batch_id)
    THEN RAISE EXCEPTION 'Confirmed OCR roster draft cannot be revised'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_confirmed_ocr_roster_draft_guard BEFORE INSERT ON v81_ocr_draft_revisions
  FOR EACH ROW EXECUTE FUNCTION guard_v81_confirmed_ocr_roster_draft();
