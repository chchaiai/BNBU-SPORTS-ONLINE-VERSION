CREATE TABLE v81_account_security (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  login_account text UNIQUE,
  must_change_password boolean NOT NULL DEFAULT true,
  password_changed_at timestamptz,
  FOREIGN KEY(user_id,organization_id) REFERENCES users(id,organization_id) ON DELETE RESTRICT
);
CREATE FUNCTION protect_v81_login_account() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.login_account IS NOT NULL AND NEW.login_account IS DISTINCT FROM OLD.login_account THEN
    RAISE EXCEPTION 'Assigned login accounts are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_login_account_immutable BEFORE UPDATE ON v81_account_security FOR EACH ROW EXECUTE FUNCTION protect_v81_login_account();
