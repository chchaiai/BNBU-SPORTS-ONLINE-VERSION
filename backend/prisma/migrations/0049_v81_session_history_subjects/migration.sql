-- Preserve non-authenticating event references while deleting current sessions/device secrets/preferences.
BEGIN;
CREATE FUNCTION maintain_v81_operational_subject() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE stamp TIMESTAMPTZ;
BEGIN
  IF TG_OP='INSERT' THEN
    stamp := (to_jsonb(NEW)->>TG_ARGV[1])::timestamptz;
    EXECUTE format('INSERT INTO %I(id,organization_id,user_id,created_at) VALUES($1,$2,$3,$4)',TG_ARGV[0])
      USING NEW.id,NEW.organization_id,NEW.user_id,stamp;
    RETURN NEW;
  END IF;
  EXECUTE format('UPDATE %I SET retired_at=GREATEST(clock_timestamp(),created_at) WHERE id=$1 AND retired_at IS NULL',TG_ARGV[0]) USING OLD.id;
  RETURN OLD;
END;
$$;
DO $$
DECLARE source_table TEXT; subject_table TEXT; time_column TEXT;
BEGIN
  FOREACH source_table IN ARRAY ARRAY['auth_sessions','push_devices','user_preferences'] LOOP
    subject_table := CASE source_table WHEN 'auth_sessions' THEN 'v81_auth_session_subjects'
      WHEN 'push_devices' THEN 'v81_push_device_subjects' ELSE 'v81_user_preference_subjects' END;
    time_column := CASE source_table WHEN 'push_devices' THEN 'registered_at' ELSE 'created_at' END;
    EXECUTE format('CREATE TABLE %I (
      id UUID PRIMARY KEY,organization_id UUID NOT NULL REFERENCES organizations(id),user_id UUID NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,retired_at TIMESTAMPTZ,UNIQUE(id,organization_id),
      FOREIGN KEY(user_id,organization_id) REFERENCES v81_user_subjects(id,organization_id),
      CHECK(isfinite(created_at) AND (retired_at IS NULL OR (isfinite(retired_at) AND retired_at>=created_at))))',subject_table);
    EXECUTE format('INSERT INTO %I(id,organization_id,user_id,created_at) SELECT id,organization_id,user_id,%I FROM %I',subject_table,time_column,source_table);
    EXECUTE format('CREATE TRIGGER v81_operational_subject_guard BEFORE UPDATE OR DELETE ON %I
      FOR EACH ROW EXECUTE FUNCTION guard_v81_history_subject()',subject_table);
    EXECUTE format('CREATE TRIGGER v81_operational_subject_insert AFTER INSERT ON %I
      FOR EACH ROW EXECUTE FUNCTION maintain_v81_operational_subject(%L,%L)',source_table,subject_table,time_column);
    EXECUTE format('CREATE TRIGGER v81_operational_subject_retire BEFORE DELETE ON %I
      FOR EACH ROW EXECUTE FUNCTION maintain_v81_operational_subject(%L,%L)',source_table,subject_table,time_column);
  END LOOP;
END;
$$;
ALTER TABLE "exemption_application_events" DROP CONSTRAINT "exemption_application_events_auth_session_id_organization__fkey";
ALTER TABLE "exemption_application_events" ADD CONSTRAINT "exemption_application_events_auth_session_id_organization__fkey" FOREIGN KEY (auth_session_id, organization_id) REFERENCES v81_auth_session_subjects(id, organization_id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "exercise_record_events" DROP CONSTRAINT "exercise_record_events_auth_session_organization_fkey";
ALTER TABLE "exercise_record_events" ADD CONSTRAINT "exercise_record_events_auth_session_organization_fkey" FOREIGN KEY (auth_session_id, organization_id) REFERENCES v81_auth_session_subjects(id, organization_id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "exercise_session_events" DROP CONSTRAINT "exercise_session_events_auth_session_organization_fkey";
ALTER TABLE "exercise_session_events" ADD CONSTRAINT "exercise_session_events_auth_session_organization_fkey" FOREIGN KEY (auth_session_id, organization_id) REFERENCES v81_auth_session_subjects(id, organization_id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "exercise_sessions" DROP CONSTRAINT "exercise_sessions_auth_session_organization_fkey";
ALTER TABLE "exercise_sessions" ADD CONSTRAINT "exercise_sessions_auth_session_organization_fkey" FOREIGN KEY (started_by_auth_session_id, organization_id) REFERENCES v81_auth_session_subjects(id, organization_id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "feedback_events" DROP CONSTRAINT "feedback_events_auth_session_id_organization_id_fkey";
ALTER TABLE "feedback_events" ADD CONSTRAINT "feedback_events_auth_session_id_organization_id_fkey" FOREIGN KEY (auth_session_id, organization_id) REFERENCES v81_auth_session_subjects(id, organization_id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "location_consent_events" DROP CONSTRAINT "location_consent_events_auth_session_id_organization_id_fkey";
ALTER TABLE "location_consent_events" ADD CONSTRAINT "location_consent_events_auth_session_id_organization_id_fkey" FOREIGN KEY (auth_session_id, organization_id) REFERENCES v81_auth_session_subjects(id, organization_id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "location_track_events" DROP CONSTRAINT "location_track_events_auth_session_id_organization_id_fkey";
ALTER TABLE "location_track_events" ADD CONSTRAINT "location_track_events_auth_session_id_organization_id_fkey" FOREIGN KEY (auth_session_id, organization_id) REFERENCES v81_auth_session_subjects(id, organization_id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "notification_events" DROP CONSTRAINT "notification_events_auth_session_id_organization_id_fkey";
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_auth_session_id_organization_id_fkey" FOREIGN KEY (auth_session_id, organization_id) REFERENCES v81_auth_session_subjects(id, organization_id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "push_device_events" DROP CONSTRAINT "push_device_events_auth_session_id_organization_id_fkey";
ALTER TABLE "push_device_events" ADD CONSTRAINT "push_device_events_auth_session_id_organization_id_fkey" FOREIGN KEY (auth_session_id, organization_id) REFERENCES v81_auth_session_subjects(id, organization_id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "push_device_events" DROP CONSTRAINT "push_device_events_push_device_id_organization_id_fkey";
ALTER TABLE "push_device_events" ADD CONSTRAINT "push_device_events_push_device_id_organization_id_fkey" FOREIGN KEY (push_device_id, organization_id) REFERENCES v81_push_device_subjects(id, organization_id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "user_preference_events" DROP CONSTRAINT "user_preference_events_auth_session_id_organization_id_fkey";
ALTER TABLE "user_preference_events" ADD CONSTRAINT "user_preference_events_auth_session_id_organization_id_fkey" FOREIGN KEY (auth_session_id, organization_id) REFERENCES v81_auth_session_subjects(id, organization_id) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "user_preference_events" DROP CONSTRAINT "user_preference_events_user_preference_id_organization_id_fkey";
ALTER TABLE "user_preference_events" ADD CONSTRAINT "user_preference_events_user_preference_id_organization_id_fkey" FOREIGN KEY (user_preference_id, organization_id) REFERENCES v81_user_preference_subjects(id, organization_id) ON UPDATE CASCADE ON DELETE RESTRICT;
COMMIT;
