CREATE TABLE v81_endurance_tables (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  gender VARCHAR(8) NOT NULL CHECK(gender IN ('male','female')),
  grade_group VARCHAR(24) NOT NULL CHECK(grade_group IN ('freshman_sophomore','junior_senior')),
  run_type VARCHAR(8) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  CHECK((gender='male' AND run_type='1000m') OR (gender='female' AND run_type='800m')),
  UNIQUE(organization_id,gender,grade_group),
  UNIQUE(id,organization_id)
);
CREATE TABLE v81_endurance_table_revisions (
  table_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  version INTEGER NOT NULL CHECK(version>=1),
  bands JSONB NOT NULL CHECK(jsonb_typeof(bands)='array' AND jsonb_array_length(bands)>0),
  actor_id UUID NOT NULL,
  request_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(table_id,version),
  FOREIGN KEY(table_id,organization_id) REFERENCES v81_endurance_tables(id,organization_id),
  FOREIGN KEY(actor_id,organization_id) REFERENCES users(id,organization_id)
);
CREATE INDEX v81_endurance_revisions_org_idx ON v81_endurance_table_revisions(organization_id,table_id,version DESC);
CREATE TRIGGER v81_endurance_tables_immutable BEFORE UPDATE OR DELETE ON v81_endurance_tables
  FOR EACH ROW EXECUTE FUNCTION reject_stage21_append_only_mutation();
CREATE TRIGGER v81_endurance_revisions_immutable BEFORE UPDATE OR DELETE ON v81_endurance_table_revisions
  FOR EACH ROW EXECUTE FUNCTION reject_stage21_append_only_mutation();
CREATE FUNCTION guard_v81_endurance_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous_version INTEGER; band JSONB; lower_seconds NUMERIC; upper_seconds NUMERIC;
  points NUMERIC; previous_upper NUMERIC; previous_points NUMERIC; seen_ids TEXT[] := '{}'; expected_tier TEXT;
BEGIN
  PERFORM id FROM v81_endurance_tables WHERE id=NEW.table_id FOR UPDATE;
  SELECT max(version) INTO previous_version FROM v81_endurance_table_revisions WHERE table_id=NEW.table_id;
  IF NEW.version<>coalesce(previous_version,0)+1 THEN RAISE EXCEPTION 'endurance version must be consecutive'; END IF;
  FOR band IN SELECT value FROM jsonb_array_elements(NEW.bands) LOOP
    IF jsonb_typeof(band)<>'object' OR NOT (band ?& ARRAY['id','minSeconds','maxSeconds','score','tier','note'])
      OR jsonb_typeof(band->'id')<>'string' OR length(btrim(band->>'id'))=0
      OR jsonb_typeof(band->'note')<>'string' OR jsonb_typeof(band->'tier')<>'string'
      OR jsonb_typeof(band->'minSeconds')<>'number' OR jsonb_typeof(band->'maxSeconds')<>'number'
      OR jsonb_typeof(band->'score')<>'number' THEN RAISE EXCEPTION 'invalid endurance band fields'; END IF;
    IF (band->>'id')=ANY(seen_ids) THEN RAISE EXCEPTION 'duplicate endurance rule id'; END IF;
    seen_ids := array_append(seen_ids,band->>'id');
    lower_seconds := (band->>'minSeconds')::numeric; upper_seconds := (band->>'maxSeconds')::numeric;
    points := (band->>'score')::numeric;
    IF lower_seconds<>trunc(lower_seconds) OR upper_seconds<>trunc(upper_seconds)
      OR lower_seconds<0 OR upper_seconds<lower_seconds OR upper_seconds>9007199254740991
      OR points<>trunc(points) OR points<0 OR points>100 THEN RAISE EXCEPTION 'invalid endurance band values'; END IF;
    expected_tier := CASE WHEN points>=95 THEN 'excellent' WHEN points>=92 THEN 'good' WHEN points>=60 THEN 'pass' ELSE 'fail' END;
    IF band->>'tier'<>expected_tier THEN RAISE EXCEPTION 'endurance tier mismatch'; END IF;
    IF previous_upper IS NOT NULL AND (lower_seconds<>previous_upper+1 OR points>previous_points)
      THEN RAISE EXCEPTION 'endurance continuity or score order mismatch'; END IF;
    previous_upper := upper_seconds; previous_points := points;
  END LOOP;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_endurance_revision_guard BEFORE INSERT ON v81_endurance_table_revisions
  FOR EACH ROW EXECUTE FUNCTION guard_v81_endurance_revision();
