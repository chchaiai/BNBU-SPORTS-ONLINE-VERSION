CREATE TABLE v81_ocr_physical_confirmations (
  batch_id UUID NOT NULL,
  row_id UUID NOT NULL,
  draft_version INTEGER NOT NULL,
  enrollment_id UUID NOT NULL,
  result_version INTEGER NOT NULL,
  actor_id UUID NOT NULL REFERENCES users(id),
  request_id VARCHAR(64) NOT NULL CHECK(length(btrim(request_id))>0),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(batch_id,row_id),
  UNIQUE(enrollment_id,result_version),
  FOREIGN KEY(batch_id,draft_version) REFERENCES v81_ocr_draft_revisions(batch_id,version),
  FOREIGN KEY(enrollment_id,result_version) REFERENCES v81_physical_result_revisions(enrollment_id,version)
);
CREATE FUNCTION guard_v81_ocr_physical_confirmation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE batch v81_ocr_batches%ROWTYPE; draft v81_ocr_draft_revisions%ROWTYPE; selected JSONB;
BEGIN
  SELECT * INTO batch FROM v81_ocr_batches WHERE id=NEW.batch_id FOR UPDATE;
  SELECT * INTO draft FROM v81_ocr_draft_revisions WHERE batch_id=NEW.batch_id ORDER BY version DESC LIMIT 1;
  SELECT value INTO selected FROM jsonb_array_elements(draft.draft_rows) WHERE value->>'id'=NEW.row_id::text;
  IF batch.purpose IS DISTINCT FROM 'PHYSICAL' OR draft.version IS DISTINCT FROM NEW.draft_version
    OR selected IS NULL OR selected->'reviewedAgainstSource' IS DISTINCT FROM 'true'::jsonb
    OR NEW.created_at<draft.created_at
    THEN RAISE EXCEPTION 'OCR confirmation requires latest reviewed physical draft row'; END IF;
  IF NOT EXISTS(SELECT 1 FROM class_sections c JOIN semesters s ON s.id=c.semester_id
    JOIN teacher_profiles t ON t.id=c.teacher_id JOIN system_policies p ON p.organization_id=c.organization_id
    JOIN enrollments e ON e.class_section_id=c.id JOIN student_profiles student ON student.id=e.student_id
    JOIN v81_physical_result_revisions r ON r.enrollment_id=e.id AND r.version=NEW.result_version
    WHERE c.id=batch.class_section_id AND c.organization_id=batch.organization_id AND e.organization_id=batch.organization_id
      AND t.user_id=NEW.actor_id AND p.system_mode='NORMAL' AND s.status<>'ARCHIVED' AND e.status='ACTIVE'
      AND (c.status IN ('UPCOMING','ACTIVE') OR (c.status='CLOSED' AND batch.created_at<=c.closed_at))
      AND e.id=NEW.enrollment_id AND student.student_number=btrim(selected->'values'->>'studentNumber')
      AND student.full_name=btrim(selected->'values'->>'name')
      AND r.actor_id=NEW.actor_id AND r.request_id=NEW.request_id AND r.created_at>=draft.created_at
      AND r.created_at<=NEW.created_at AND r.run_type=btrim(selected->'values'->>'runType')
      AND r.tested_on::text=btrim(selected->'values'->>'testedOn'))
    THEN RAISE EXCEPTION 'OCR confirmation requires matching scoped official result and actor'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_ocr_physical_confirmation_guard BEFORE INSERT ON v81_ocr_physical_confirmations
  FOR EACH ROW EXECUTE FUNCTION guard_v81_ocr_physical_confirmation();
CREATE TRIGGER v81_ocr_physical_confirmation_immutable BEFORE UPDATE OR DELETE ON v81_ocr_physical_confirmations
  FOR EACH ROW EXECUTE FUNCTION prevent_v81_history_mutation();
CREATE FUNCTION guard_v81_ocr_confirmed_working_rows() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM v81_ocr_batches WHERE id=NEW.batch_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM v81_ocr_physical_confirmations c
    JOIN v81_ocr_draft_revisions d ON d.batch_id=c.batch_id AND d.version=c.draft_version
    CROSS JOIN LATERAL jsonb_array_elements(d.draft_rows) old_row
    WHERE c.batch_id=NEW.batch_id AND old_row->>'id'=c.row_id::text AND NOT EXISTS(
      SELECT 1 FROM jsonb_array_elements(NEW.draft_rows) new_row WHERE new_row=old_row))
    THEN RAISE EXCEPTION 'Confirmed OCR working rows cannot be changed'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_ocr_confirmed_working_rows_guard BEFORE INSERT ON v81_ocr_draft_revisions
  FOR EACH ROW EXECUTE FUNCTION guard_v81_ocr_confirmed_working_rows();
