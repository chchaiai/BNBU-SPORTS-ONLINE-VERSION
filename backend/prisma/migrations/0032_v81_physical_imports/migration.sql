CREATE TABLE v81_physical_import_batches (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  class_section_id UUID NOT NULL REFERENCES class_sections(id),
  actor_id UUID NOT NULL REFERENCES users(id),
  source_sha256 CHAR(64) NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
  source_rows JSONB NOT NULL CHECK(jsonb_typeof(source_rows)='array' AND jsonb_array_length(source_rows)>0),
  request_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE(id,organization_id)
);
CREATE TABLE v81_physical_import_row_revisions (
  batch_id UUID NOT NULL REFERENCES v81_physical_import_batches(id),
  row_number INTEGER NOT NULL CHECK(row_number>0),
  version INTEGER NOT NULL CHECK(version>0),
  content JSONB NOT NULL CHECK(jsonb_typeof(content)='object'),
  actor_id UUID NOT NULL REFERENCES users(id),
  request_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(batch_id,row_number,version)
);
CREATE TABLE v81_physical_import_confirmations (
  batch_id UUID NOT NULL,
  row_number INTEGER NOT NULL,
  row_version INTEGER NOT NULL,
  enrollment_id UUID NOT NULL,
  result_version INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(batch_id,row_number),
  FOREIGN KEY(batch_id,row_number,row_version) REFERENCES v81_physical_import_row_revisions(batch_id,row_number,version),
  FOREIGN KEY(enrollment_id,result_version) REFERENCES v81_physical_result_revisions(enrollment_id,version)
);
CREATE TRIGGER v81_physical_import_batches_immutable BEFORE UPDATE OR DELETE ON v81_physical_import_batches
  FOR EACH ROW EXECUTE FUNCTION prevent_v81_history_mutation();
CREATE TRIGGER v81_physical_import_rows_immutable BEFORE UPDATE OR DELETE ON v81_physical_import_row_revisions
  FOR EACH ROW EXECUTE FUNCTION prevent_v81_history_mutation();
CREATE TRIGGER v81_physical_import_confirmations_immutable BEFORE UPDATE OR DELETE ON v81_physical_import_confirmations
  FOR EACH ROW EXECUTE FUNCTION prevent_v81_history_mutation();
CREATE FUNCTION guard_v81_physical_import_batch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM class_sections c JOIN teacher_profiles t ON t.id=c.teacher_id
    WHERE c.id=NEW.class_section_id AND c.organization_id=NEW.organization_id AND t.user_id=NEW.actor_id)
    THEN RAISE EXCEPTION 'physical import requires responsible teacher'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_physical_import_batch_guard BEFORE INSERT ON v81_physical_import_batches
  FOR EACH ROW EXECUTE FUNCTION guard_v81_physical_import_batch();
CREATE FUNCTION guard_v81_physical_import_row() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE batch v81_physical_import_batches; expected INTEGER;
BEGIN
  SELECT * INTO batch FROM v81_physical_import_batches WHERE id=NEW.batch_id FOR UPDATE;
  IF NEW.actor_id IS DISTINCT FROM batch.actor_id OR NEW.row_number>jsonb_array_length(batch.source_rows)
    THEN RAISE EXCEPTION 'physical import row scope mismatch'; END IF;
  IF EXISTS(SELECT 1 FROM v81_physical_import_confirmations WHERE batch_id=NEW.batch_id AND row_number=NEW.row_number)
    THEN RAISE EXCEPTION 'confirmed import row cannot be edited'; END IF;
  SELECT coalesce(max(version),0)+1 INTO expected FROM v81_physical_import_row_revisions WHERE batch_id=NEW.batch_id AND row_number=NEW.row_number;
  IF NEW.version<>expected THEN RAISE EXCEPTION 'physical import row version must be consecutive'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_physical_import_row_guard BEFORE INSERT ON v81_physical_import_row_revisions
  FOR EACH ROW EXECUTE FUNCTION guard_v81_physical_import_row();
CREATE FUNCTION guard_v81_physical_import_confirmation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE batch v81_physical_import_batches; latest INTEGER;
BEGIN
  SELECT * INTO batch FROM v81_physical_import_batches WHERE id=NEW.batch_id FOR UPDATE;
  SELECT max(version) INTO latest FROM v81_physical_import_row_revisions WHERE batch_id=NEW.batch_id AND row_number=NEW.row_number;
  IF latest IS DISTINCT FROM NEW.row_version OR NOT EXISTS(SELECT 1 FROM enrollments e
    JOIN v81_physical_result_revisions r ON r.enrollment_id=e.id AND r.version=NEW.result_version
    WHERE e.id=NEW.enrollment_id AND e.class_section_id=batch.class_section_id AND e.organization_id=batch.organization_id AND r.actor_id=batch.actor_id)
    THEN RAISE EXCEPTION 'physical confirmation must link latest draft and scoped official result'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_physical_import_confirmation_guard BEFORE INSERT ON v81_physical_import_confirmations
  FOR EACH ROW EXECUTE FUNCTION guard_v81_physical_import_confirmation();
