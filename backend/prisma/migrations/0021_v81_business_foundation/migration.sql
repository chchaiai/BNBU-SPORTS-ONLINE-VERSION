-- Add V8.1 facts without rewriting historical migrations or deleting old facts.
-- Existing READ_ONLY installations require an explicitly reviewed mode transition before upgrade.
ALTER TABLE system_policies DROP CONSTRAINT system_policies_mode_check;
ALTER TABLE system_policies ADD CONSTRAINT system_policies_mode_check CHECK (system_mode IN ('NORMAL','MAINTENANCE'));
ALTER TABLE exercise_sessions DROP CONSTRAINT exercise_sessions_actual_duration_check;
ALTER TABLE exercise_sessions ADD CONSTRAINT exercise_sessions_actual_duration_check CHECK (actual_duration_seconds >= 0);
ALTER TABLE exercise_records DROP CONSTRAINT exercise_records_duration_range_check;
ALTER TABLE exercise_records DROP CONSTRAINT exercise_records_duration_credit_check;
ALTER TABLE exercise_records ADD CONSTRAINT exercise_records_duration_range_check CHECK (
  actual_duration_seconds >= 0 AND paused_duration_seconds >= 0 AND credited_duration_seconds >= 0
);
-- Existing old projections are historical. New records are governed by their rule snapshot.
CREATE TABLE v81_course_rules (
  class_section_id uuid PRIMARY KEY REFERENCES class_sections(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  minimum_minutes integer NOT NULL CHECK (minimum_minutes IN (30,45,60)),
  weekly_limit integer NOT NULL CHECK (weekly_limit IN (2,3,4)),
  course_target integer NOT NULL CHECK (course_target BETWEEN 0 AND 1200),
  general_target integer NOT NULL CHECK (general_target BETWEEN 0 AND 1200),
  regular_deadline timestamptz NOT NULL,
  closing_deadline timestamptz NOT NULL,
  settlement_planned_at timestamptz NOT NULL,
  published_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK (course_target + general_target = 1200),
  CHECK (closing_deadline = regular_deadline + interval '7 days'),
  CHECK (settlement_planned_at >= closing_deadline),
  FOREIGN KEY (class_section_id,organization_id) REFERENCES class_sections(id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE v81_record_workflows (
  record_id uuid PRIMARY KEY REFERENCES exercise_records(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  stage text NOT NULL CHECK (stage IN ('PENDING_AI','TECHNICAL','PENDING_TEACHER','AWAITING_SUPPLEMENT','VALID','INVALID')),
  material_version integer NOT NULL DEFAULT 1 CHECK (material_version IN (1,2)),
  supplement_used boolean NOT NULL DEFAULT false,
  supplement_started_at timestamptz,
  supplement_hours integer CHECK (supplement_hours IN (24,72)),
  supplement_accepted_at timestamptz,
  teacher_round_started_at timestamptz,
  public_reason text,
  public_comment text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (record_id,organization_id) REFERENCES exercise_records(id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE v81_events (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  event_type text NOT NULL,
  actor_id uuid,
  request_id text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  facts jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT v81_events_resource_version_key UNIQUE (organization_id,resource_type,resource_id,version)
);
CREATE TABLE v81_material_versions (
  record_id uuid NOT NULL REFERENCES exercise_records(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  material_version integer NOT NULL CHECK (material_version IN (1,2)),
  accepted_at timestamptz NOT NULL,
  accepted_transaction bigint NOT NULL DEFAULT txid_current(),
  PRIMARY KEY(record_id,material_version),
  FOREIGN KEY(record_id,organization_id) REFERENCES exercise_records(id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE v81_material_items (
  record_id uuid NOT NULL,
  material_version integer NOT NULL,
  media_id uuid NOT NULL REFERENCES media_evidence(id) ON DELETE RESTRICT,
  position integer NOT NULL CHECK (position BETWEEN 1 AND 7),
  PRIMARY KEY(record_id,material_version,media_id),
  UNIQUE(record_id,material_version,position),
  FOREIGN KEY(record_id,material_version) REFERENCES v81_material_versions(record_id,material_version) ON DELETE RESTRICT
);
CREATE INDEX v81_events_resource ON v81_events(organization_id,resource_type,resource_id,occurred_at);
CREATE FUNCTION prevent_v81_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'V8.1 history is append only'; END;
$$;
CREATE TRIGGER v81_events_immutable BEFORE UPDATE OR DELETE ON v81_events FOR EACH ROW EXECUTE FUNCTION prevent_v81_history_mutation();
CREATE TRIGGER v81_material_versions_immutable BEFORE UPDATE OR DELETE ON v81_material_versions FOR EACH ROW EXECUTE FUNCTION prevent_v81_history_mutation();
CREATE TRIGGER v81_material_items_immutable BEFORE UPDATE OR DELETE ON v81_material_items FOR EACH ROW EXECUTE FUNCTION prevent_v81_history_mutation();
CREATE FUNCTION guard_v81_material_item() RETURNS trigger LANGUAGE plpgsql AS $$
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
    OR (item.media_type='VIDEO' AND (video_count>=1 OR item.verified_mime_type<>'video/mp4' OR item.verified_file_size_bytes>104857600 OR item.verified_duration_seconds IS NULL OR item.verified_duration_seconds NOT BETWEEN 1 AND 15))
    OR total_bytes+item.verified_file_size_bytes>262144000 THEN RAISE EXCEPTION 'Evidence package limits exceeded'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_material_item_guard BEFORE INSERT ON v81_material_items FOR EACH ROW EXECUTE FUNCTION guard_v81_material_item();
CREATE TABLE v81_interruptions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('MAINTENANCE','PLATFORM_OUTAGE')),
  class_section_id uuid REFERENCES class_sections(id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL,
  ended_at timestamptz CHECK (ended_at >= started_at),
  reason text NOT NULL,
  version integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX v81_one_open_maintenance ON v81_interruptions(organization_id) WHERE kind='MAINTENANCE' AND ended_at IS NULL;
CREATE TABLE v81_admin_access (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('SUPER','SUB')),
  permissions jsonb NOT NULL DEFAULT '[]',
  must_change_password boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  FOREIGN KEY (user_id,organization_id) REFERENCES users(id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE v81_manual_modes (
  class_section_id uuid PRIMARY KEY REFERENCES class_sections(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL,
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL,
  FOREIGN KEY (class_section_id,organization_id) REFERENCES class_sections(id,organization_id) ON DELETE RESTRICT
);
CREATE TABLE v81_credit_projections (
  record_id uuid PRIMARY KEY REFERENCES exercise_records(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  eligible_minutes integer NOT NULL CHECK (eligible_minutes BETWEEN 0 AND 60),
  credited_minutes integer NOT NULL CHECK (credited_minutes BETWEEN 0 AND eligible_minutes),
  selected boolean NOT NULL,
  reason text,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE v81_certification_credits (
  application_id uuid PRIMARY KEY REFERENCES exemption_applications(id) ON DELETE RESTRICT,
  enrollment_id uuid NOT NULL REFERENCES enrollments(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  course_minutes integer NOT NULL CHECK (course_minutes BETWEEN 0 AND 1200),
  general_minutes integer NOT NULL CHECK (general_minutes BETWEEN 0 AND 1200),
  active boolean NOT NULL,
  version integer NOT NULL DEFAULT 1,
  CHECK (course_minutes+general_minutes <= 1200)
);
-- New writes never create hidden reviewer notes. Preserve any legacy history.
CREATE FUNCTION guard_v81_review_notes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.internal_note IS NOT NULL OR NEW.credited_duration_override_seconds IS NOT NULL THEN
    RAISE EXCEPTION 'V8.1 forbids hidden reviewer notes and manual duration overrides';
  END IF;
  IF EXISTS(SELECT 1 FROM v81_record_workflows WHERE record_id=NEW.record_id) AND NEW.result='INVALID' THEN
    IF NEW.reason_code NOT IN ('UNCLEAR_EVIDENCE','MISSING_REQUIRED_EVIDENCE','SESSION_MISMATCH','INCONSISTENT_EVIDENCE','CONFIRMED_REUSE_OR_MISUSE','SUPPLEMENT_DEADLINE_MISSED') THEN
      RAISE EXCEPTION 'V8.1 invalid decision requires an applicable public reason';
    END IF;
    IF (NEW.reason_code='SUPPLEMENT_DEADLINE_MISSED') IS DISTINCT FROM (NEW.teacher_id IS NULL) THEN
      RAISE EXCEPTION 'Supplement expiry is a system decision';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_review_notes BEFORE INSERT ON review_records FOR EACH ROW EXECUTE FUNCTION guard_v81_review_notes();
ALTER TABLE review_records DROP CONSTRAINT review_records_shape_check;
ALTER TABLE review_records ADD CONSTRAINT review_records_shape_check CHECK (
  (result='PENDING' AND teacher_id IS NULL AND reviewed_at IS NULL)
  OR (result='VALID' AND reviewed_at IS NOT NULL AND reason_code IS NULL)
  OR (result='INVALID' AND reviewed_at IS NOT NULL AND reason_code IS NOT NULL)
);
CREATE FUNCTION protect_v81_published_rules() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.published_at IS NOT NULL THEN RAISE EXCEPTION 'Published V8.1 course rules are immutable'; END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'V8.1 course rule history cannot be deleted'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_rules_immutable BEFORE UPDATE OR DELETE ON v81_course_rules FOR EACH ROW EXECUTE FUNCTION protect_v81_published_rules();
CREATE FUNCTION protect_v81_published_schedule() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM v81_course_rules WHERE class_section_id=OLD.id AND published_at IS NOT NULL)
    AND ROW(NEW.check_in_window_mode,NEW.check_in_start_date,NEW.check_in_end_date,NEW.daily_start_time,NEW.daily_end_time,NEW.submission_deadline_at)
      IS DISTINCT FROM ROW(OLD.check_in_window_mode,OLD.check_in_start_date,OLD.check_in_end_date,OLD.daily_start_time,OLD.daily_end_time,OLD.submission_deadline_at) THEN
    RAISE EXCEPTION 'Published V8.1 schedule is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_schedule_immutable BEFORE UPDATE ON class_sections FOR EACH ROW EXECUTE FUNCTION protect_v81_published_schedule();
CREATE FUNCTION protect_v81_published_exclusions() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE section_id uuid;
BEGIN
  section_id := CASE WHEN TG_OP='DELETE' THEN OLD.class_section_id ELSE NEW.class_section_id END;
  PERFORM id FROM class_sections WHERE id=section_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM v81_course_rules WHERE class_section_id=section_id AND published_at IS NOT NULL)
    OR (TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM v81_course_rules WHERE class_section_id=OLD.class_section_id AND published_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'Published V8.1 exclusions are immutable';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_exclusions_immutable BEFORE INSERT OR UPDATE OR DELETE ON class_section_excluded_dates FOR EACH ROW EXECUTE FUNCTION protect_v81_published_exclusions();
