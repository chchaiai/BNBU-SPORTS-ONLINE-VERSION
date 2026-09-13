CREATE OR REPLACE FUNCTION guard_v81_application_material() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE app exemption_applications%ROWTYPE; item media_evidence%ROWTYPE;
BEGIN
  SELECT * INTO app FROM exemption_applications WHERE id=NEW.application_id FOR UPDATE;
  IF NOT FOUND OR app.organization_id<>NEW.organization_id THEN RAISE EXCEPTION 'Application material scope mismatch'; END IF;
  SELECT * INTO item FROM media_evidence WHERE id=NEW.media_id;
  IF NOT FOUND OR item.organization_id<>app.organization_id OR item.owner_student_id<>app.student_id OR item.enrollment_id IS DISTINCT FROM app.enrollment_id
    OR item.business_purpose<>'EXEMPTION_APPLICATION' OR item.media_type NOT IN ('IMAGE','DOCUMENT') OR item.upload_status<>'AVAILABLE'
    OR item.verified_mime_type IS NULL OR item.verified_mime_type NOT IN ('image/jpeg','image/png','image/webp','application/pdf')
    OR item.verified_file_size_bytes IS NULL OR item.verified_file_size_bytes NOT BETWEEN 1 AND 10485760
    OR item.verified_content_sha256 IS NULL THEN RAISE EXCEPTION 'Application evidence must be a verified image or PDF'; END IF;
  IF NOT EXISTS(SELECT 1 FROM v81_application_materials WHERE application_id=NEW.application_id AND media_id=NEW.media_id)
    AND (SELECT count(*) FROM v81_application_materials WHERE application_id=NEW.application_id)>=3 THEN
    RAISE EXCEPTION 'An application accepts at most three files across all submissions';
  END IF;
  RETURN NEW;
END;
$$;
