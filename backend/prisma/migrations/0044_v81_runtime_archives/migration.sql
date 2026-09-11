CREATE TABLE v81_runtime_archives (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  requester_id UUID NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL CHECK(end_date>=start_date),
  timezone VARCHAR(100) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED','EXPIRED')),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  lease_owner UUID,
  lease_until TIMESTAMPTZ,
  storage_key VARCHAR(512),
  sha256 VARCHAR(64) CHECK(sha256 IS NULL OR sha256~'^[a-f0-9]{64}$'),
  byte_length BIGINT CHECK(byte_length IS NULL OR byte_length>0),
  record_count INTEGER CHECK(record_count IS NULL OR record_count>=0),
  failure_code VARCHAR(100),
  request_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL CHECK(isfinite(created_at)),
  updated_at TIMESTAMPTZ NOT NULL CHECK(isfinite(updated_at)),
  expires_at TIMESTAMPTZ NOT NULL CHECK(isfinite(expires_at)),
  FOREIGN KEY(requester_id,organization_id) REFERENCES users(id,organization_id),
  CHECK(updated_at>=created_at AND expires_at>created_at),
  CHECK(status<>'RUNNING' OR (lease_owner IS NOT NULL AND lease_until>updated_at)),
  CHECK(status<>'SUCCEEDED' OR (storage_key IS NOT NULL AND sha256 IS NOT NULL AND byte_length IS NOT NULL AND record_count IS NOT NULL)),
  CHECK(status<>'FAILED' OR failure_code IS NOT NULL)
);
CREATE INDEX v81_runtime_archive_claim ON v81_runtime_archives(status,lease_until,created_at,id);
CREATE FUNCTION guard_v81_runtime_archive() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Runtime archive task history cannot be deleted'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'QUEUED' OR NEW.version<>1 OR NEW.updated_at<>NEW.created_at
      OR NOT EXISTS(SELECT 1 FROM v81_admin_access a JOIN users u ON u.id=a.user_id JOIN system_policies p ON p.organization_id=a.organization_id
        WHERE a.user_id=NEW.requester_id AND a.organization_id=NEW.organization_id AND u.status='ACTIVE' AND u.deleted_at IS NULL
          AND NOT a.must_change_password AND (a.kind='SUPER' OR a.permissions ? 'AUDIT_QUERY') AND p.system_mode='NORMAL')
      THEN RAISE EXCEPTION 'Runtime archive requires authorized administrator and initial state'; END IF;
  ELSE
    IF ROW(NEW.id,NEW.organization_id,NEW.requester_id,NEW.start_date,NEW.end_date,NEW.timezone,NEW.request_id,NEW.created_at,NEW.expires_at)
      IS DISTINCT FROM ROW(OLD.id,OLD.organization_id,OLD.requester_id,OLD.start_date,OLD.end_date,OLD.timezone,OLD.request_id,OLD.created_at,OLD.expires_at)
      OR NEW.version<>OLD.version+1 OR NEW.updated_at<OLD.updated_at
      OR NOT ((OLD.status='QUEUED' AND NEW.status IN ('RUNNING','CANCELLED','EXPIRED','FAILED'))
        OR (OLD.status='RUNNING' AND NEW.status IN ('SUCCEEDED','FAILED','CANCELLED','EXPIRED'))
        OR (OLD.status='RUNNING' AND NEW.status='RUNNING' AND OLD.lease_until<=NEW.updated_at)
        OR (OLD.status='SUCCEEDED' AND NEW.status IN ('CANCELLED','EXPIRED')))
      THEN RAISE EXCEPTION 'Runtime archive transition or immutable identity invalid'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_runtime_archive_guard BEFORE INSERT OR UPDATE OR DELETE ON v81_runtime_archives FOR EACH ROW EXECUTE FUNCTION guard_v81_runtime_archive();
CREATE TABLE v81_runtime_archive_capabilities (
  id UUID PRIMARY KEY,
  archive_id UUID NOT NULL REFERENCES v81_runtime_archives(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL,
  auth_session_id UUID NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
  job_version INTEGER NOT NULL CHECK(job_version>0),
  token_hash VARCHAR(64) UNIQUE NOT NULL CHECK(token_hash~'^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK(expires_at>created_at),
  FOREIGN KEY(user_id,organization_id) REFERENCES users(id,organization_id)
);
