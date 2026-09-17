-- Responsible teachers may adjust daily times and pause/resume published courses.
-- Calendar dates and submission deadlines remain immutable after publication.
CREATE OR REPLACE FUNCTION protect_v81_published_schedule() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM v81_course_rules WHERE class_section_id=OLD.id AND published_at IS NOT NULL)
    AND ROW(NEW.check_in_start_date,NEW.check_in_end_date,NEW.submission_deadline_at)
      IS DISTINCT FROM ROW(OLD.check_in_start_date,OLD.check_in_end_date,OLD.submission_deadline_at) THEN
    RAISE EXCEPTION 'Published V8.1 calendar dates are immutable';
  END IF;
  RETURN NEW;
END;
$$;
