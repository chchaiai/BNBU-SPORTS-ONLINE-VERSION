CREATE OR REPLACE FUNCTION guard_v81_makeup_window() RETURNS trigger LANGUAGE plpgsql AS $$
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
      AND (NEW.starts_at AT TIME ZONE o.timezone)::date>=c.check_in_start_date
      AND ((NEW.ends_at-interval '1 microsecond') AT TIME ZONE o.timezone)::date<=c.check_in_end_date
      AND (NEW.starts_at AT TIME ZONE o.timezone)::date>=s.start_date
      AND ((NEW.ends_at-interval '1 microsecond') AT TIME ZONE o.timezone)::date<=s.end_date)
    THEN RAISE EXCEPTION 'Makeup requires responsible teacher active member current semester and published exercise dates'; END IF;
  RETURN NEW;
END;
$$;
