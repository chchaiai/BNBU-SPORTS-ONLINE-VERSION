CREATE TABLE v81_application_materials (
  application_id uuid NOT NULL REFERENCES exemption_applications(id) ON DELETE RESTRICT,
  media_id uuid NOT NULL REFERENCES media_evidence(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  accepted_at timestamptz NOT NULL,
  PRIMARY KEY(application_id,media_id)
);
CREATE TRIGGER v81_application_materials_immutable BEFORE UPDATE OR DELETE ON v81_application_materials FOR EACH ROW EXECUTE FUNCTION prevent_v81_history_mutation();
CREATE FUNCTION guard_v81_application_material() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE app exemption_applications%ROWTYPE; item media_evidence%ROWTYPE;
BEGIN
  SELECT * INTO app FROM exemption_applications WHERE id=NEW.application_id FOR UPDATE;
  IF NOT FOUND OR app.organization_id<>NEW.organization_id THEN RAISE EXCEPTION 'Application material scope mismatch'; END IF;
  SELECT * INTO item FROM media_evidence WHERE id=NEW.media_id;
  IF NOT FOUND OR item.organization_id<>app.organization_id OR item.owner_student_id<>app.student_id OR item.enrollment_id IS DISTINCT FROM app.enrollment_id
    OR item.business_purpose<>'EXEMPTION_APPLICATION' OR item.media_type<>'IMAGE' OR item.upload_status<>'AVAILABLE'
    OR item.verified_mime_type IS NULL OR item.verified_mime_type NOT IN ('image/jpeg','image/png','image/webp')
    OR item.verified_file_size_bytes IS NULL OR item.verified_file_size_bytes NOT BETWEEN 1 AND 10485760
    OR item.verified_content_sha256 IS NULL THEN RAISE EXCEPTION 'Application evidence must be a verified image'; END IF;
  IF NOT EXISTS(SELECT 1 FROM v81_application_materials WHERE application_id=NEW.application_id AND media_id=NEW.media_id)
    AND (SELECT count(*) FROM v81_application_materials WHERE application_id=NEW.application_id)>=3 THEN
    RAISE EXCEPTION 'An application accepts at most three images across all submissions';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_application_material_guard BEFORE INSERT ON v81_application_materials FOR EACH ROW EXECUTE FUNCTION guard_v81_application_material();
