BEGIN;
CREATE TABLE v81_ocr_service_revisions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  version integer NOT NULL CHECK(version>0),
  provider text NOT NULL CHECK(provider IN ('DISABLED','TENCENT_TABLE_V3')),
  region text,
  timeout_ms integer NOT NULL CHECK(timeout_ms BETWEEN 1000 AND 60000),
  enabled boolean NOT NULL,
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 1000),
  actor_id uuid NOT NULL,
  request_id varchar(64) NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE(organization_id,version),
  UNIQUE(id,organization_id),
  FOREIGN KEY(actor_id,organization_id) REFERENCES v81_user_subjects(id,organization_id),
  CHECK((provider='DISABLED' AND region IS NULL AND NOT enabled)
    OR (provider='TENCENT_TABLE_V3' AND region IS NOT NULL AND region ~ '^[a-z]+-[a-z]+(-[0-9]+)?$'))
);
CREATE FUNCTION guard_v81_ocr_service_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_version integer;
BEGIN
  PERFORM id FROM organizations WHERE id=NEW.organization_id FOR NO KEY UPDATE;
  IF NOT EXISTS(SELECT 1 FROM v81_admin_access a JOIN users u ON u.id=a.user_id AND u.organization_id=a.organization_id
    WHERE a.user_id=NEW.actor_id AND a.organization_id=NEW.organization_id AND a.kind='SUPER'
      AND NOT a.must_change_password AND u.status='ACTIVE' AND u.deleted_at IS NULL AND u.role='ADMIN')
    THEN RAISE EXCEPTION 'OCR service configuration requires active super administrator'; END IF;
  SELECT coalesce(max(version),0) INTO current_version FROM v81_ocr_service_revisions WHERE organization_id=NEW.organization_id;
  IF NEW.version<>current_version+1 THEN RAISE EXCEPTION 'OCR service revision must append next version'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_ocr_service_revision_insert BEFORE INSERT ON v81_ocr_service_revisions
  FOR EACH ROW EXECUTE FUNCTION guard_v81_ocr_service_revision();
CREATE TRIGGER v81_ocr_service_revision_immutable BEFORE UPDATE OR DELETE ON v81_ocr_service_revisions
  FOR EACH ROW EXECUTE FUNCTION prevent_v81_history_mutation();

CREATE TABLE v81_ocr_execution_services (
  job_id uuid NOT NULL REFERENCES v81_ocr_jobs(id),
  job_version integer NOT NULL CHECK(job_version>1),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  service_revision_id uuid,
  service_version integer NOT NULL CHECK(service_version>=0),
  provider text NOT NULL CHECK(provider='TENCENT_TABLE_V3'),
  region text NOT NULL,
  timeout_ms integer NOT NULL CHECK(timeout_ms BETWEEN 1000 AND 60000),
  created_at timestamptz NOT NULL,
  PRIMARY KEY(job_id,job_version),
  FOREIGN KEY(service_revision_id,organization_id) REFERENCES v81_ocr_service_revisions(id,organization_id),
  CHECK((service_version=0)=(service_revision_id IS NULL))
);
CREATE FUNCTION guard_v81_ocr_execution_service() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM v81_ocr_jobs j WHERE j.id=NEW.job_id AND j.organization_id=NEW.organization_id
    AND j.status='RUNNING' AND j.version=NEW.job_version AND j.updated_at=NEW.created_at)
    THEN RAISE EXCEPTION 'OCR execution configuration requires current claimed job'; END IF;
  IF NEW.service_revision_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM v81_ocr_service_revisions r
    WHERE r.id=NEW.service_revision_id AND r.organization_id=NEW.organization_id AND r.version=NEW.service_version
      AND r.provider=NEW.provider AND r.region=NEW.region AND r.timeout_ms=NEW.timeout_ms AND r.enabled
      AND NOT EXISTS(SELECT 1 FROM v81_ocr_service_revisions newer WHERE newer.organization_id=r.organization_id AND newer.version>r.version))
    THEN RAISE EXCEPTION 'OCR execution configuration must match active service revision'; END IF;
  IF NEW.service_revision_id IS NULL AND EXISTS(SELECT 1 FROM v81_ocr_service_revisions WHERE organization_id=NEW.organization_id)
    THEN RAISE EXCEPTION 'OCR execution cannot bypass governed configuration'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_ocr_execution_service_insert BEFORE INSERT ON v81_ocr_execution_services
  FOR EACH ROW EXECUTE FUNCTION guard_v81_ocr_execution_service();
CREATE TRIGGER v81_ocr_execution_service_immutable BEFORE UPDATE OR DELETE ON v81_ocr_execution_services
  FOR EACH ROW EXECUTE FUNCTION prevent_v81_history_mutation();
COMMIT;
