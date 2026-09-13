ALTER TABLE media_evidence
  ADD COLUMN safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  DROP CONSTRAINT media_evidence_media_type_check,
  ADD CONSTRAINT media_evidence_media_type_check CHECK (media_type IN ('IMAGE','VIDEO','DOCUMENT')),
  ADD CONSTRAINT media_evidence_document_purpose_check CHECK (media_type <> 'DOCUMENT' OR (business_purpose='EXEMPTION_APPLICATION' AND declared_mime_type='application/pdf' AND (verified_mime_type IS NULL OR verified_mime_type='application/pdf'))),
  DROP CONSTRAINT media_evidence_duration_check,
  ADD CONSTRAINT media_evidence_duration_check CHECK (
    (media_type IN ('IMAGE','DOCUMENT') AND declared_duration_seconds IS NULL AND verified_duration_seconds IS NULL)
    OR (media_type='VIDEO' AND declared_duration_seconds>0 AND (verified_duration_seconds IS NULL OR verified_duration_seconds>0))),
  DROP CONSTRAINT media_evidence_verified_complete_check,
  ADD CONSTRAINT media_evidence_verified_complete_check CHECK (
    upload_status IN ('PENDING_UPLOAD','FAILED','DELETED') OR (verified_mime_type IS NOT NULL AND verified_file_size_bytes IS NOT NULL AND verified_content_sha256 IS NOT NULL AND (media_type<>'VIDEO' OR verified_duration_seconds IS NOT NULL)));
