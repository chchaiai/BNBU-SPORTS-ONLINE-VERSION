CREATE TABLE v81_subadmin_identity_challenges (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES v81_user_subjects(id) ON DELETE RESTRICT,
  email text NOT NULL CHECK (length(email) BETWEEN 3 AND 254 AND email=lower(btrim(email))),
  code_digest char(64) NOT NULL CHECK(code_digest ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK(status IN ('PENDING','ACTIVE','VERIFIED','CONSUMED','FAILED','LOCKED','SUPERSEDED')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  requested_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK(expires_at>requested_at),
  verified_at timestamptz,
  consumed_by uuid REFERENCES v81_user_subjects(id) ON DELETE RESTRICT,
  CHECK((status='CONSUMED')=(consumed_by IS NOT NULL)),
  CHECK(status NOT IN ('VERIFIED','CONSUMED') OR verified_at IS NOT NULL),
  FOREIGN KEY(actor_id,organization_id) REFERENCES v81_user_subjects(id,organization_id) ON DELETE RESTRICT
);
CREATE INDEX v81_subadmin_identity_recent ON v81_subadmin_identity_challenges(organization_id,actor_id,requested_at DESC);
CREATE FUNCTION protect_v81_subadmin_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id<>OLD.id OR NEW.organization_id<>OLD.organization_id OR NEW.actor_id<>OLD.actor_id
    OR NEW.email<>OLD.email OR NEW.code_digest<>OLD.code_digest OR NEW.requested_at<>OLD.requested_at
    OR NEW.expires_at<>OLD.expires_at OR NEW.version<>OLD.version+1 OR NEW.attempts<OLD.attempts
    OR OLD.status IN ('CONSUMED','FAILED','LOCKED','SUPERSEDED')
    OR (OLD.status='VERIFIED' AND NEW.status NOT IN ('CONSUMED','SUPERSEDED')) THEN
    RAISE EXCEPTION 'Invalid identity challenge mutation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_subadmin_identity_guard BEFORE UPDATE ON v81_subadmin_identity_challenges
FOR EACH ROW EXECUTE FUNCTION protect_v81_subadmin_identity();
