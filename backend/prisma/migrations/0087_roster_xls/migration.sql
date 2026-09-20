-- Accept original XLS sources and ordinary dotted file names without rewriting history.
ALTER TABLE official_roster_imports DROP CONSTRAINT official_roster_imports_file_shape_check;
ALTER TABLE official_roster_imports ADD CONSTRAINT official_roster_imports_file_shape_check CHECK (
  (source='FILE' AND file_name IS NOT NULL AND file_name=btrim(file_name)
    AND source_file_storage_key IS NOT NULL AND btrim(source_file_storage_key)<>''
    AND file_checksum_sha256 IS NOT NULL
    AND ((coalesce(source_format,'CSV')='CSV' AND source_sheet IS NULL AND file_name ~* '^[^/\\]+[.]csv$')
      OR (source_format IS NOT NULL AND source_format='XLSX' AND source_sheet IS NOT NULL AND length(btrim(source_sheet)) BETWEEN 1 AND 31
        AND source_sheet=btrim(source_sheet) AND file_name ~* '^[^/\\]+[.]xlsx$')))
  OR (source='FILE' AND source_format='XLS' AND file_name IS NOT NULL AND file_name=btrim(file_name)
    AND file_name ~* '^[^/\\]+[.]xls$' AND source_file_storage_key IS NOT NULL AND btrim(source_file_storage_key)<>''
    AND file_checksum_sha256 IS NOT NULL AND source_sheet IS NOT NULL AND source_sheet=btrim(source_sheet)
    AND length(source_sheet) BETWEEN 1 AND 31)
  OR (source='OFFICIAL_API' AND file_name IS NULL AND source_file_storage_key IS NULL
    AND file_checksum_sha256 IS NULL AND source_format IS NULL AND source_sheet IS NULL)
);

