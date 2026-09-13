CREATE TABLE v81_history_settings (
 class_section_id uuid PRIMARY KEY REFERENCES class_sections(id) ON DELETE CASCADE,
 enabled boolean NOT NULL, earliest_date date NOT NULL, latest_date date NOT NULL,
 version integer NOT NULL CHECK(version>0), updated_at timestamptz NOT NULL,
 CHECK(earliest_date<=latest_date)
);
CREATE TABLE v81_history_session_sources (
 session_id uuid PRIMARY KEY REFERENCES exercise_sessions(id) ON DELETE CASCADE,
 settings_version integer NOT NULL CHECK(settings_version>0),
 earliest_date date NOT NULL, latest_date date NOT NULL, declared_at timestamptz NOT NULL,
 request_id varchar(64) NOT NULL
);
ALTER TABLE media_evidence DROP CONSTRAINT media_evidence_capture_source_check,
 ADD CONSTRAINT media_evidence_capture_source_check CHECK(capture_source IN ('IN_APP_CAMERA','FILE_PICKER'));
CREATE FUNCTION guard_historical_media_capture() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.business_purpose='EXERCISE_RECORD' AND NEW.capture_source='FILE_PICKER' AND
   NOT EXISTS(SELECT 1 FROM v81_history_session_sources WHERE session_id=NEW.session_id) THEN
   RAISE EXCEPTION 'File selection requires a historical exercise session';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER historical_media_capture_guard BEFORE INSERT OR UPDATE OF capture_source,session_id,business_purpose
 ON media_evidence FOR EACH ROW EXECUTE FUNCTION guard_historical_media_capture();
