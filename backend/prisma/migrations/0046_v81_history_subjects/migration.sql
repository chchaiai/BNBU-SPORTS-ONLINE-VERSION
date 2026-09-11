-- Non-login historical identities. These tables contain no current account/profile data.
CREATE TABLE v81_user_subjects (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  role_at_creation VARCHAR(32) NOT NULL CHECK(role_at_creation IN ('STUDENT','TEACHER','ADMIN')),
  created_at TIMESTAMPTZ NOT NULL,
  retired_at TIMESTAMPTZ,
  UNIQUE(id,organization_id),
  CHECK(isfinite(created_at) AND (retired_at IS NULL OR (isfinite(retired_at) AND retired_at>=created_at)))
);
INSERT INTO v81_user_subjects(id,organization_id,role_at_creation,created_at,retired_at)
  SELECT id,organization_id,role,created_at,deleted_at FROM users;

DO $$
DECLARE kind TEXT;
BEGIN
  FOREACH kind IN ARRAY ARRAY['student','teacher','admin'] LOOP
    EXECUTE format('CREATE TABLE %I (
      id UUID PRIMARY KEY, organization_id UUID NOT NULL REFERENCES organizations(id), user_id UUID NOT NULL,
      created_at TIMESTAMPTZ NOT NULL, retired_at TIMESTAMPTZ,
      UNIQUE(id,organization_id), UNIQUE(user_id,organization_id),
      FOREIGN KEY(user_id,organization_id) REFERENCES v81_user_subjects(id,organization_id),
      CHECK(isfinite(created_at) AND (retired_at IS NULL OR (isfinite(retired_at) AND retired_at>=created_at)))
    )','v81_'||kind||'_subjects');
    EXECUTE format('INSERT INTO %I(id,organization_id,user_id,created_at,retired_at)
      SELECT id,organization_id,user_id,created_at,deleted_at FROM %I','v81_'||kind||'_subjects',kind||'_profiles');
  END LOOP;
END;
$$;

CREATE FUNCTION guard_v81_history_subject() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Historical subject cannot be deleted'; END IF;
  IF TG_OP='UPDATE' AND ((to_jsonb(NEW)-'retired_at') IS DISTINCT FROM (to_jsonb(OLD)-'retired_at')
    OR OLD.retired_at IS NOT NULL OR NEW.retired_at IS NULL)
    THEN RAISE EXCEPTION 'Historical subject identity and retirement are immutable'; END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION maintain_v81_history_subject() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE subject_table TEXT := TG_ARGV[0]; existing_retired TIMESTAMPTZ;
BEGIN
  IF TG_OP='INSERT' THEN
    IF TG_TABLE_NAME='users' THEN
      EXECUTE format('INSERT INTO %I(id,organization_id,role_at_creation,created_at) VALUES($1,$2,$3,$4)',subject_table)
        USING NEW.id,NEW.organization_id,NEW.role,NEW.created_at;
    ELSE
      EXECUTE format('INSERT INTO %I(id,organization_id,user_id,created_at) VALUES($1,$2,$3,$4)',subject_table)
        USING NEW.id,NEW.organization_id,NEW.user_id,NEW.created_at;
    END IF;
    RETURN NEW;
  END IF;
  EXECUTE format('SELECT retired_at FROM %I WHERE id=$1 FOR UPDATE',subject_table) INTO existing_retired USING OLD.id;
  IF existing_retired IS NULL THEN
    EXECUTE format('UPDATE %I SET retired_at=GREATEST(clock_timestamp(),created_at) WHERE id=$1',subject_table) USING OLD.id;
  END IF;
  RETURN OLD;
END;
$$;

DO $$
DECLARE source_table TEXT; subject_table TEXT;
BEGIN
  FOREACH source_table IN ARRAY ARRAY['users','student_profiles','teacher_profiles','admin_profiles'] LOOP
    subject_table := CASE WHEN source_table='users' THEN 'v81_user_subjects'
      ELSE 'v81_'||replace(source_table,'_profiles','')||'_subjects' END;
    EXECUTE format('CREATE TRIGGER v81_history_subject_guard BEFORE UPDATE OR DELETE ON %I
      FOR EACH ROW EXECUTE FUNCTION guard_v81_history_subject()',subject_table);
    EXECUTE format('CREATE TRIGGER v81_history_subject_insert AFTER INSERT ON %I
      FOR EACH ROW EXECUTE FUNCTION maintain_v81_history_subject(%L)',source_table,subject_table);
    EXECUTE format('CREATE TRIGGER v81_history_subject_retire BEFORE DELETE ON %I
      FOR EACH ROW EXECUTE FUNCTION maintain_v81_history_subject(%L)',source_table,subject_table);
  END LOOP;
END;
$$;
