ALTER TABLE v81_physical_import_batches
  ADD COLUMN source_format TEXT NOT NULL DEFAULT 'CSV',
  ADD COLUMN source_sheet TEXT,
  ADD CONSTRAINT v81_physical_source_format_check CHECK (
    (source_format='CSV' AND source_sheet IS NULL) OR
    (source_format='XLSX' AND source_sheet IS NOT NULL AND length(source_sheet) BETWEEN 1 AND 31));
