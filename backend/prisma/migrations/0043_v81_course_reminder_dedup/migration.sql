CREATE UNIQUE INDEX v81_course_deadline_notification_once
  ON notifications(organization_id,recipient_user_id,target_type,target_id)
  WHERE notification_type='COURSE_DEADLINE_REMINDER' AND target_id IS NOT NULL;
