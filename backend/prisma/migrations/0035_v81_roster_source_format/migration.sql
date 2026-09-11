-- NULL format preserves legacy CSV facts without updating history or source versions.
ALTER TABLE official_roster_imports
  ADD COLUMN source_format VARCHAR(16),
  ADD COLUMN source_sheet VARCHAR(31);

ALTER TABLE official_roster_imports DROP CONSTRAINT official_roster_imports_file_shape_check;
ALTER TABLE official_roster_imports ADD CONSTRAINT official_roster_imports_file_shape_check CHECK (
  (source='FILE' AND file_name IS NOT NULL AND file_name=btrim(file_name)
    AND source_file_storage_key IS NOT NULL AND btrim(source_file_storage_key)<>''
    AND file_checksum_sha256 IS NOT NULL
    AND ((coalesce(source_format,'CSV')='CSV' AND source_sheet IS NULL AND file_name ~* '^[^./\\]+[.]csv$')
      OR (source_format IS NOT NULL AND source_format='XLSX' AND source_sheet IS NOT NULL AND length(btrim(source_sheet)) BETWEEN 1 AND 31
        AND source_sheet=btrim(source_sheet) AND file_name ~* '^[^./\\]+[.]xlsx$')))
  OR (source='OFFICIAL_API' AND file_name IS NULL AND source_file_storage_key IS NULL
    AND file_checksum_sha256 IS NULL AND source_format IS NULL AND source_sheet IS NULL)
);

CREATE FUNCTION prevent_v81_roster_source_format_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.source_format IS DISTINCT FROM OLD.source_format OR NEW.source_sheet IS DISTINCT FROM OLD.source_sheet THEN
    RAISE EXCEPTION 'Roster source format and sheet are immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_roster_source_format_immutable BEFORE UPDATE ON official_roster_imports
  FOR EACH ROW EXECUTE FUNCTION prevent_v81_roster_source_format_mutation();
