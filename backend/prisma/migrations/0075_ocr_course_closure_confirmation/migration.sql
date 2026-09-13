-- Continue OCR accepted before course closure for the exact automatically ended membership.
-- Preserve all draft, actor, identity, result, timing, semester and system-mode guards.
BEGIN;
CREATE OR REPLACE FUNCTION guard_v81_ocr_physical_confirmation() RETURNS trigger LANGUAGE plpgsql AS $$
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
      AND t.user_id=NEW.actor_id AND p.system_mode='NORMAL' AND s.status<>'ARCHIVED'
      AND (e.status='ACTIVE' OR (e.status='REMOVED' AND e.end_reason='COURSE_CLOSED'
        AND c.status='CLOSED' AND c.closed_at IS NOT NULL AND e.ended_at=c.closed_at
        AND batch.created_at<=c.closed_at))
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
COMMIT;
