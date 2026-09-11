CREATE TABLE v81_account_deletion_challenges (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL,
  auth_session_id UUID NOT NULL REFERENCES auth_sessions(id),
  expected_user_version INTEGER NOT NULL CHECK(expected_user_version>0),
  email_digest CHAR(64) NOT NULL CHECK(email_digest~'^[a-f0-9]{64}$'),
  code_digest CHAR(64) NOT NULL CHECK(code_digest~'^[a-f0-9]{64}$'),
  status VARCHAR(16) NOT NULL CHECK(status IN ('PENDING','ACTIVE','FAILED','EXPIRED','SUPERSEDED','CONSUMED','LOCKED')),
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK(failed_attempts BETWEEN 0 AND 5),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  requested_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK(expires_at>requested_at),
  delivered_at TIMESTAMPTZ,
  request_id VARCHAR(64) NOT NULL,
  FOREIGN KEY(user_id,organization_id) REFERENCES users(id,organization_id)
);
CREATE INDEX v81_account_deletion_request_window ON v81_account_deletion_challenges(organization_id,user_id,requested_at);
CREATE UNIQUE INDEX v81_account_deletion_one_active ON v81_account_deletion_challenges(user_id) WHERE status='ACTIVE';
