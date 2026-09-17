-- Raw receipts remain immutable until a single verified normalization transition.
ALTER TABLE media_evidence DROP CONSTRAINT media_evidence_verified_complete_check,
ADD CONSTRAINT media_evidence_verified_complete_check CHECK (
  upload_status IN ('PENDING_UPLOAD','FAILED','DELETED') OR
  (verified_mime_type IS NOT NULL AND verified_file_size_bytes IS NOT NULL AND verified_content_sha256 IS NOT NULL
    AND (media_type<>'VIDEO' OR verified_duration_seconds IS NOT NULL OR
      (upload_status IN ('UPLOADED','BOUND','PROCESSING') AND COALESCE(safe_metadata->>'videoPipeline'='1', false)))));
CREATE OR REPLACE FUNCTION "guard_media_evidence_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."organization_id" <> NEW."organization_id"
     OR OLD."owner_student_id" <> NEW."owner_student_id"
     OR OLD."session_id" IS DISTINCT FROM NEW."session_id"
     OR OLD."enrollment_id" IS DISTINCT FROM NEW."enrollment_id"
     OR OLD."initiated_by_user_id" <> NEW."initiated_by_user_id"
     OR OLD."business_purpose" <> NEW."business_purpose"
     OR OLD."media_type" <> NEW."media_type"
     OR OLD."capture_source" <> NEW."capture_source"
     OR OLD."declared_mime_type" <> NEW."declared_mime_type"
     OR OLD."declared_file_size_bytes" <> NEW."declared_file_size_bytes"
     OR OLD."declared_content_sha256" IS DISTINCT FROM NEW."declared_content_sha256"
     OR OLD."declared_duration_seconds" IS DISTINCT FROM NEW."declared_duration_seconds"
     OR OLD."storage_key" <> NEW."storage_key"
     OR OLD."created_at" <> NEW."created_at" THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'media identity and declared facts are immutable';
  END IF;
  IF NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'media version advance is invalid';
  END IF;
  IF NEW."upload_status" <> OLD."upload_status" AND NOT (
    (OLD."upload_status" = 'PENDING_UPLOAD' AND NEW."upload_status" IN ('UPLOADED', 'FAILED'))
    OR (OLD."upload_status" = 'UPLOADED' AND NEW."upload_status" IN ('BOUND', 'FAILED'))
    OR (OLD."upload_status" = 'BOUND' AND NEW."upload_status" IN ('PROCESSING', 'FAILED'))
    OR (OLD."upload_status" = 'PROCESSING' AND NEW."upload_status" IN ('AVAILABLE', 'FAILED'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'media transition is not allowed';
  END IF;
  IF OLD."verified_content_sha256" IS NOT NULL AND NOT COALESCE((
    OLD.media_type='VIDEO' AND OLD.upload_status='PROCESSING' AND NEW.upload_status='AVAILABLE'
    AND OLD.safe_metadata->>'videoPipeline'='1' AND NEW.safe_metadata->>'normalized'='1'
    AND NEW.safe_metadata->>'sourceSha256'=OLD.verified_content_sha256
  ), false) AND (
    OLD."verified_mime_type" IS DISTINCT FROM NEW."verified_mime_type"
    OR OLD."verified_file_size_bytes" IS DISTINCT FROM NEW."verified_file_size_bytes"
    OR OLD."verified_content_sha256" IS DISTINCT FROM NEW."verified_content_sha256"
    OR OLD."verified_duration_seconds" IS DISTINCT FROM NEW."verified_duration_seconds"
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'verified media facts are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION guard_v81_material_item() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  packet_transaction bigint;
  expected_session uuid;
  expected_owner uuid;
  expected_organization uuid;
  item media_evidence%ROWTYPE;
  image_count integer;
  video_count integer;
  total_bytes bigint;
BEGIN
  SELECT v.accepted_transaction,r.session_id,r.student_id,r.organization_id
    INTO packet_transaction,expected_session,expected_owner,expected_organization
    FROM v81_material_versions v JOIN exercise_records r ON r.id=v.record_id
    WHERE v.record_id=NEW.record_id AND v.material_version=NEW.material_version FOR UPDATE OF v;
  IF packet_transaction IS DISTINCT FROM txid_current() THEN RAISE EXCEPTION 'An accepted evidence package is immutable'; END IF;
  SELECT * INTO item FROM media_evidence WHERE id=NEW.media_id FOR KEY SHARE;
  IF NOT FOUND OR item.session_id IS DISTINCT FROM expected_session OR item.owner_student_id<>expected_owner
    OR item.organization_id<>expected_organization OR item.upload_status<>'AVAILABLE' THEN
    RAISE EXCEPTION 'Evidence package scope is invalid';
  END IF;
  SELECT count(*) FILTER(WHERE m.media_type='IMAGE'),count(*) FILTER(WHERE m.media_type='VIDEO'),coalesce(sum(m.verified_file_size_bytes),0)
    INTO image_count,video_count,total_bytes FROM v81_material_items p JOIN media_evidence m ON m.id=p.media_id
    WHERE p.record_id=NEW.record_id AND p.material_version=NEW.material_version;
  IF item.verified_file_size_bytes IS NULL OR item.verified_file_size_bytes<=0 OR item.verified_content_sha256 IS NULL THEN
    RAISE EXCEPTION 'Evidence is not verified';
  END IF;
  IF (item.media_type='IMAGE' AND (image_count>=6 OR item.verified_mime_type NOT IN ('image/jpeg','image/png') OR item.verified_file_size_bytes>10485760))
    OR (item.media_type='VIDEO' AND (video_count>=1 OR item.verified_mime_type<>'video/mp4' OR item.verified_file_size_bytes>209715200 OR item.verified_duration_seconds IS NULL OR item.verified_duration_seconds NOT BETWEEN 1 AND 15))
    OR total_bytes+item.verified_file_size_bytes>262144000 THEN RAISE EXCEPTION 'Evidence package limits exceeded'; END IF;
  RETURN NEW;
END;
$$;

-- Retain old intake audit rows; they no longer freeze editable draft content.
CREATE OR REPLACE FUNCTION guard_v81_swim_frozen_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RETURN NEW;
END;
$$;
