CREATE TABLE v81_makeup_windows (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  class_section_id UUID NOT NULL REFERENCES class_sections(id),
  enrollment_id UUID NOT NULL REFERENCES enrollments(id),
  rule_version INTEGER NOT NULL CHECK(rule_version>0),
  starts_at TIMESTAMPTZ NOT NULL CHECK(isfinite(starts_at)),
  ends_at TIMESTAMPTZ NOT NULL CHECK(isfinite(ends_at)),
  actor_id UUID NOT NULL REFERENCES users(id),
  request_id VARCHAR(64) NOT NULL CHECK(length(btrim(request_id))>0),
  created_at TIMESTAMPTZ NOT NULL CHECK(isfinite(created_at)),
  CHECK(starts_at<ends_at AND created_at<ends_at)
);
CREATE INDEX v81_makeup_enrollment_window_idx ON v81_makeup_windows(enrollment_id,starts_at,ends_at);
CREATE FUNCTION guard_v81_makeup_window() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM class_sections WHERE id=NEW.class_section_id FOR UPDATE;
  PERFORM id FROM enrollments WHERE id=NEW.enrollment_id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM enrollments e JOIN class_sections c ON c.id=e.class_section_id
    JOIN semesters s ON s.id=e.semester_id JOIN teacher_profiles t ON t.id=c.teacher_id
    JOIN student_profiles student ON student.id=e.student_id JOIN users u ON u.id=student.user_id
    JOIN organizations o ON o.id=c.organization_id JOIN system_policies p ON p.organization_id=o.id
    JOIN v81_course_rules r ON r.class_section_id=c.id
    WHERE e.id=NEW.enrollment_id AND e.class_section_id=NEW.class_section_id AND e.organization_id=NEW.organization_id
      AND c.organization_id=NEW.organization_id AND t.user_id=NEW.actor_id AND e.status='ACTIVE'
      AND student.status='ACTIVE' AND student.deleted_at IS NULL AND u.status='ACTIVE' AND u.deleted_at IS NULL
      AND c.status='ACTIVE' AND s.status='CURRENT' AND p.system_mode='NORMAL'
      AND r.published_at IS NOT NULL AND r.published_at<=NEW.created_at AND r.version=NEW.rule_version
      AND NEW.starts_at>=r.regular_deadline AND NEW.ends_at<=r.closing_deadline
      AND (NEW.starts_at AT TIME ZONE o.timezone)::date>=s.start_date
      AND ((NEW.ends_at-interval '1 microsecond') AT TIME ZONE o.timezone)::date<=s.end_date)
    THEN RAISE EXCEPTION 'Makeup requires responsible teacher active member current semester and published closing window'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_makeup_window_guard BEFORE INSERT ON v81_makeup_windows FOR EACH ROW EXECUTE FUNCTION guard_v81_makeup_window();
CREATE TRIGGER v81_makeup_window_immutable BEFORE UPDATE OR DELETE ON v81_makeup_windows FOR EACH ROW EXECUTE FUNCTION prevent_v81_history_mutation();
CREATE TABLE v81_makeup_revocations (
  window_id UUID PRIMARY KEY REFERENCES v81_makeup_windows(id),
  actor_id UUID NOT NULL REFERENCES users(id),
  reason VARCHAR(1000) NOT NULL CHECK(length(btrim(reason))>0),
  request_id VARCHAR(64) NOT NULL CHECK(length(btrim(request_id))>0),
  created_at TIMESTAMPTZ NOT NULL CHECK(isfinite(created_at))
);
CREATE FUNCTION guard_v81_makeup_revocation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM v81_makeup_windows WHERE id=NEW.window_id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM v81_makeup_windows w JOIN class_sections c ON c.id=w.class_section_id
    JOIN teacher_profiles t ON t.id=c.teacher_id JOIN semesters s ON s.id=c.semester_id
    JOIN system_policies p ON p.organization_id=w.organization_id
    WHERE w.id=NEW.window_id AND t.user_id=NEW.actor_id AND NEW.created_at>=w.created_at
      AND s.status<>'ARCHIVED' AND p.system_mode='NORMAL')
    THEN RAISE EXCEPTION 'Makeup revocation requires responsible teacher legal time and writable semester'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_makeup_revocation_guard BEFORE INSERT ON v81_makeup_revocations FOR EACH ROW EXECUTE FUNCTION guard_v81_makeup_revocation();
CREATE TRIGGER v81_makeup_revocation_immutable BEFORE UPDATE OR DELETE ON v81_makeup_revocations FOR EACH ROW EXECUTE FUNCTION prevent_v81_history_mutation();
CREATE TABLE v81_makeup_session_sources (
  session_id UUID PRIMARY KEY REFERENCES exercise_sessions(id),
  window_id UUID NOT NULL REFERENCES v81_makeup_windows(id),
  created_at TIMESTAMPTZ NOT NULL CHECK(isfinite(created_at))
);
CREATE FUNCTION guard_v81_makeup_session_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM v81_makeup_windows WHERE id=NEW.window_id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM v81_makeup_windows w JOIN exercise_sessions s ON s.enrollment_id=w.enrollment_id
    WHERE w.id=NEW.window_id AND s.id=NEW.session_id AND s.organization_id=w.organization_id AND s.class_section_id=w.class_section_id
      AND s.started_at>=w.created_at AND s.started_at>=w.starts_at AND s.started_at<w.ends_at AND NEW.created_at=s.started_at
      AND NOT EXISTS(SELECT 1 FROM v81_makeup_revocations r WHERE r.window_id=w.id AND r.created_at<=s.started_at))
    THEN RAISE EXCEPTION 'Makeup session must belong to its member and start within accepted unrevoked window'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER v81_makeup_session_source_guard BEFORE INSERT ON v81_makeup_session_sources FOR EACH ROW EXECUTE FUNCTION guard_v81_makeup_session_source();
CREATE TRIGGER v81_makeup_session_source_immutable BEFORE UPDATE OR DELETE ON v81_makeup_session_sources FOR EACH ROW EXECUTE FUNCTION prevent_v81_history_mutation();
