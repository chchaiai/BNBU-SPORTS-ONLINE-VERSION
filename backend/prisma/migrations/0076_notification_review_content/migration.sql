-- Add immutable display facts without rewriting existing notification text.
ALTER TABLE notifications ADD COLUMN review_content jsonb;
ALTER TABLE notifications ADD CONSTRAINT notifications_review_content_shape CHECK (
  review_content IS NULL OR COALESCE((
    notification_type = 'EXERCISE_RECORD_RESULT'
    AND jsonb_typeof(review_content) = 'object'
    AND review_content @> '{"version":1}'::jsonb
    AND review_content->>'stage' IN ('VALID','INVALID','AWAITING_SUPPLEMENT','PENDING_TEACHER')
    AND review_content ?& ARRAY['reasonCode','publicComment']
    AND jsonb_typeof(review_content->'reasonCode') IN ('string','null')
    AND jsonb_typeof(review_content->'publicComment') IN ('string','null')
  ), FALSE)
);
