CREATE TABLE v81_confirmed_rosters (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  class_section_id UUID NOT NULL REFERENCES class_sections(id),
  roster_import_id UUID NOT NULL UNIQUE REFERENCES official_roster_imports(id),
  source_version INTEGER NOT NULL CHECK(source_version>0),
  source_sha256 CHAR(64) NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
  source_rows JSONB NOT NULL CHECK(jsonb_typeof(source_rows)='array' AND jsonb_array_length(source_rows) BETWEEN 1 AND 500),
  version INTEGER NOT NULL CHECK(version>0),
  actor_id UUID NOT NULL REFERENCES users(id),
  request_id VARCHAR(64) NOT NULL,
  confirmed_at TIMESTAMPTZ NOT NULL,
  UNIQUE(class_section_id,version)
);
CREATE FUNCTION v81_roster_source_rows(source_id UUID) RETURNS JSONB LANGUAGE sql STABLE AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'sourceRowNumber',source_row_number,
    'studentNumber',normalized_student_number,'rawStudentNumber',raw_student_number_safe,'fullName',full_name,
    'validationStatus',row_validation_status,'errors',row_error_codes,'raw',raw_row_snapshot_safe)
    ORDER BY source_row_number),'[]'::jsonb) FROM official_roster_entries WHERE roster_import_id=source_id;
$$;
CREATE FUNCTION guard_v81_confirmed_roster() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source official_roster_imports%ROWTYPE; expected INTEGER;
BEGIN
  SELECT * INTO source FROM official_roster_imports WHERE id=NEW.roster_import_id;
  IF source.organization_id IS DISTINCT FROM NEW.organization_id OR source.class_section_id IS DISTINCT FROM NEW.class_section_id
    OR source.version IS DISTINCT FROM NEW.source_version OR source.file_checksum_sha256 IS DISTINCT FROM NEW.source_sha256
    OR source.status<>'VALIDATED' OR NOT source.is_current OR source.invalid_row_count<>0
    OR EXISTS(SELECT 1 FROM official_roster_entries WHERE roster_import_id=source.id AND row_validation_status='INVALID')
    OR NEW.source_rows IS DISTINCT FROM v81_roster_source_rows(source.id)
    OR jsonb_array_length(NEW.source_rows)<>source.total_row_count
    THEN RAISE EXCEPTION 'confirmed roster must preserve the current valid source and every original row'; END IF;
  IF NOT EXISTS(SELECT 1 FROM class_sections c JOIN teacher_profiles t ON t.id=c.teacher_id
    WHERE c.id=NEW.class_section_id AND c.organization_id=NEW.organization_id AND t.user_id=NEW.actor_id)
    THEN RAISE EXCEPTION 'confirmed roster requires responsible teacher'; END IF;
  SELECT coalesce(max(version),0)+1 INTO expected FROM v81_confirmed_rosters WHERE class_section_id=NEW.class_section_id;
  IF NEW.version<>expected THEN RAISE EXCEPTION 'confirmed roster versions must be consecutive'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_confirmed_roster_guard BEFORE INSERT ON v81_confirmed_rosters
  FOR EACH ROW EXECUTE FUNCTION guard_v81_confirmed_roster();
CREATE TRIGGER v81_confirmed_roster_immutable BEFORE UPDATE OR DELETE ON v81_confirmed_rosters
  FOR EACH ROW EXECUTE FUNCTION prevent_v81_history_mutation();
