CREATE TABLE v81_settlement_report_revisions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  class_section_id uuid NOT NULL REFERENCES class_sections(id) ON DELETE RESTRICT,
  confirmed_roster_id uuid NOT NULL REFERENCES v81_confirmed_rosters(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES v81_user_subjects(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK(version>0),
  schema_version integer NOT NULL DEFAULT 1 CHECK(schema_version=1),
  kind text NOT NULL CHECK(kind IN ('INITIAL','CORRECTION')),
  previous_report_id uuid REFERENCES v81_settlement_report_revisions(id) ON DELETE RESTRICT,
  correction_reason text,
  report jsonb NOT NULL,
  report_sha256 text NOT NULL CHECK(report_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL,
  request_id varchar(64) NOT NULL CHECK(length(request_id)>0),
  UNIQUE(class_section_id,version),
  CONSTRAINT v81_settlement_correction_reason CHECK (
    (version=1 AND kind='INITIAL' AND previous_report_id IS NULL AND correction_reason IS NULL)
    OR (version>1 AND kind='CORRECTION' AND previous_report_id IS NOT NULL
      AND correction_reason IS NOT NULL AND length(btrim(correction_reason)) BETWEEN 1 AND 2000)
  ),
  CONSTRAINT v81_settlement_report_shape CHECK ((
    jsonb_typeof(report)='object' AND report ?& ARRAY['classSectionId','confirmedRosterId','ruleVersion','generatedAt','rows','extras','isSettlementSnapshot']
    AND report->>'classSectionId'=class_section_id::text
    AND report->>'confirmedRosterId'=confirmed_roster_id::text
    AND report->'isSettlementSnapshot'='true'::jsonb
    AND jsonb_typeof(report->'ruleVersion')='number' AND report->>'ruleVersion' ~ '^[1-9][0-9]*$'
    AND jsonb_typeof(report->'generatedAt')='string'
    AND jsonb_typeof(report->'rows')='array' AND jsonb_typeof(report->'extras')='array'
    AND octet_length(report::text)<=33554432
  ) IS TRUE)
);
CREATE FUNCTION guard_v81_settlement_report_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected integer; previous_id uuid; previous_time timestamptz;
BEGIN
  PERFORM id FROM class_sections WHERE id=NEW.class_section_id FOR NO KEY UPDATE;
  IF NOT EXISTS(SELECT 1 FROM class_sections c JOIN teacher_profiles t ON t.id=c.teacher_id
    JOIN v81_user_subjects s ON s.id=NEW.actor_id AND s.organization_id=NEW.organization_id AND s.role_at_creation='TEACHER'
    WHERE c.id=NEW.class_section_id AND c.organization_id=NEW.organization_id AND t.user_id=NEW.actor_id)
    THEN RAISE EXCEPTION 'settlement report requires responsible teacher and organization'; END IF;
  IF NOT EXISTS(SELECT 1 FROM v81_confirmed_rosters r WHERE r.id=NEW.confirmed_roster_id
    AND r.class_section_id=NEW.class_section_id AND r.organization_id=NEW.organization_id)
    THEN RAISE EXCEPTION 'settlement report requires same-course confirmed roster'; END IF;
  SELECT version+1,id,created_at INTO expected,previous_id,previous_time
    FROM v81_settlement_report_revisions WHERE class_section_id=NEW.class_section_id ORDER BY version DESC LIMIT 1;
  IF NEW.version<>coalesce(expected,1) OR NEW.previous_report_id IS DISTINCT FROM previous_id
    OR (previous_time IS NOT NULL AND NEW.created_at<previous_time)
    THEN RAISE EXCEPTION 'settlement report must append its latest predecessor'; END IF;
  NEW.report_sha256 := encode(sha256(convert_to(NEW.report::text,'UTF8')),'hex');
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_settlement_report_revision_guard BEFORE INSERT ON v81_settlement_report_revisions
  FOR EACH ROW EXECUTE FUNCTION guard_v81_settlement_report_revision();
CREATE TRIGGER v81_settlement_report_immutable BEFORE UPDATE OR DELETE ON v81_settlement_report_revisions
  FOR EACH ROW EXECUTE FUNCTION prevent_v81_history_mutation();
