CREATE TABLE v81_swim_intakes (
  record_id uuid PRIMARY KEY REFERENCES exercise_records(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  accepted_at timestamptz NOT NULL,
  session_ended_at timestamptz NOT NULL,
  transfer_deadline timestamptz NOT NULL,
  intake_kind varchar(24) NOT NULL CHECK (intake_kind IN ('ON_TIME','OFFLINE_DELAYED')),
  delay_reason varchar(1000),
  accepted_transaction bigint NOT NULL DEFAULT txid_current(),
  CHECK (transfer_deadline = accepted_at + interval '30 minutes'),
  CHECK (accepted_at >= session_ended_at),
  CHECK ((intake_kind='ON_TIME' AND accepted_at<=session_ended_at+interval '15 minutes' AND delay_reason IS NULL)
    OR (intake_kind='OFFLINE_DELAYED' AND accepted_at<=session_ended_at+interval '24 hours' AND delay_reason IS NOT NULL AND length(btrim(delay_reason))>0))
);
CREATE TABLE v81_swim_intake_items (
  record_id uuid NOT NULL REFERENCES v81_swim_intakes(record_id) ON DELETE RESTRICT,
  media_id uuid NOT NULL REFERENCES media_evidence(id) ON DELETE RESTRICT,
  phase varchar(8) NOT NULL CHECK (phase IN ('BEFORE','AFTER','OTHER')),
  position integer NOT NULL CHECK (position BETWEEN 1 AND 7),
  content_sha256 char(64) NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY(record_id,media_id),
  UNIQUE(record_id,position)
);
CREATE TRIGGER v81_swim_intakes_immutable BEFORE UPDATE OR DELETE ON v81_swim_intakes
  FOR EACH ROW EXECUTE FUNCTION prevent_v81_history_mutation();
CREATE TRIGGER v81_swim_items_immutable BEFORE UPDATE OR DELETE ON v81_swim_intake_items
  FOR EACH ROW EXECUTE FUNCTION prevent_v81_history_mutation();
CREATE FUNCTION guard_v81_swim_intake() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE record_row exercise_records%ROWTYPE; ended timestamptz;
BEGIN
  SELECT * INTO record_row FROM exercise_records WHERE id=NEW.record_id FOR UPDATE;
  SELECT completed_at INTO ended FROM exercise_sessions WHERE id=record_row.session_id;
  IF record_row.organization_id IS DISTINCT FROM NEW.organization_id OR record_row.sport_type<>'SWIMMING'
    OR record_row.status<>'DRAFT' OR ended IS DISTINCT FROM NEW.session_ended_at THEN
    RAISE EXCEPTION 'Swimming intake requires the existing completed session and owned draft';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_swim_intake_guard BEFORE INSERT ON v81_swim_intakes
  FOR EACH ROW EXECUTE FUNCTION guard_v81_swim_intake();
CREATE FUNCTION guard_v81_swim_item() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE intake v81_swim_intakes%ROWTYPE; record_row exercise_records%ROWTYPE; item media_evidence%ROWTYPE;
BEGIN
  SELECT * INTO intake FROM v81_swim_intakes WHERE record_id=NEW.record_id;
  SELECT * INTO record_row FROM exercise_records WHERE id=NEW.record_id;
  SELECT * INTO item FROM media_evidence WHERE id=NEW.media_id;
  IF intake.accepted_transaction<>txid_current() OR item.organization_id IS DISTINCT FROM intake.organization_id
    OR item.owner_student_id IS DISTINCT FROM record_row.student_id OR item.session_id IS DISTINCT FROM record_row.session_id
    OR item.business_purpose<>'EXERCISE_RECORD' OR item.declared_content_sha256 IS DISTINCT FROM NEW.content_sha256
    OR (NEW.phase IN ('BEFORE','AFTER') AND item.media_type<>'IMAGE') THEN
    RAISE EXCEPTION 'Swimming batch must freeze the same session and declared file bytes atomically';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_swim_item_guard BEFORE INSERT ON v81_swim_intake_items
  FOR EACH ROW EXECUTE FUNCTION guard_v81_swim_item();
CREATE FUNCTION guard_v81_swim_frozen_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM v81_swim_intakes WHERE record_id=OLD.id)
    AND (NEW.sport_type,NEW.sport_name,NEW.credit_type,NEW.description) IS DISTINCT FROM
        (OLD.sport_type,OLD.sport_name,OLD.credit_type,OLD.description) THEN
    RAISE EXCEPTION 'Accepted swimming batch freezes the record content';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_swim_frozen_record_guard BEFORE UPDATE ON exercise_records
  FOR EACH ROW EXECUTE FUNCTION guard_v81_swim_frozen_record();
CREATE FUNCTION guard_v81_swim_batch_complete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE images integer; videos integer; total_bytes bigint; before_count integer; after_count integer;
BEGIN
  SELECT count(*) FILTER(WHERE m.media_type='IMAGE'),count(*) FILTER(WHERE m.media_type='VIDEO'),
    sum(m.declared_file_size_bytes),count(*) FILTER(WHERE i.phase='BEFORE'),count(*) FILTER(WHERE i.phase='AFTER')
    INTO images,videos,total_bytes,before_count,after_count
    FROM v81_swim_intake_items i JOIN media_evidence m ON m.id=i.media_id WHERE i.record_id=NEW.record_id;
  IF images NOT BETWEEN 2 AND 6 OR videos>1 OR total_bytes>262144000 OR before_count<1 OR after_count<1 THEN
    RAISE EXCEPTION 'Swimming batch requires before and after images within material limits';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER v81_swim_batch_complete AFTER INSERT ON v81_swim_intakes
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_v81_swim_batch_complete();
