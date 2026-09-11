-- Preserve duplicate source rows as an accepted, unresolved roster basis.
ALTER TABLE official_roster_imports DROP CONSTRAINT official_roster_imports_row_counts_check;
ALTER TABLE official_roster_imports ADD CONSTRAINT official_roster_imports_row_counts_check CHECK (
  total_row_count >= 0 AND valid_row_count >= 0 AND invalid_row_count >= 0 AND duplicated_row_count >= 0
  AND total_row_count = valid_row_count + invalid_row_count + duplicated_row_count
  AND (status NOT IN ('RECEIVED', 'VALIDATING') OR total_row_count = 0)
  AND (status <> 'VALIDATED' OR valid_row_count + duplicated_row_count >= 1)
);
ALTER TABLE roster_alignment_runs DROP CONSTRAINT roster_alignment_runs_algorithm_version_check;
ALTER TABLE roster_alignment_runs ADD CONSTRAINT roster_alignment_runs_algorithm_version_check
  CHECK (algorithm_version IN ('ROSTER_ALIGNMENT_V1', 'ROSTER_ALIGNMENT_V2'));

CREATE FUNCTION v81_guard_confirmed_duplicate_rows() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM official_roster_entries
    WHERE roster_import_id=NEW.roster_import_id AND row_validation_status='DUPLICATED'
      AND (row_error_codes <> '["DUPLICATE_STUDENT_NUMBER"]'::jsonb
        OR nullif(trim(full_name),'') IS NULL OR nullif(trim(normalized_student_number),'') IS NULL)) THEN
    RAISE EXCEPTION 'duplicate identity must not hide malformed source rows';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER v81_confirmed_roster_duplicate_rows_guard BEFORE INSERT ON v81_confirmed_rosters
  FOR EACH ROW EXECUTE FUNCTION v81_guard_confirmed_duplicate_rows();
