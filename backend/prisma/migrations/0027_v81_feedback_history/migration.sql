ALTER TABLE feedback DROP CONSTRAINT feedback_status_check;
ALTER TABLE feedback ADD CONSTRAINT feedback_status_check
  CHECK (status IN ('OPEN', 'IN_PROGRESS', 'WAITING_TECH', 'RESOLVED', 'CLOSED'));

ALTER TABLE feedback_events
  ADD COLUMN previous_status VARCHAR(24),
  ADD COLUMN next_status VARCHAR(24),
  ADD COLUMN public_reply VARCHAR(2000);
ALTER TABLE feedback_events DROP CONSTRAINT feedback_events_type_check;
ALTER TABLE feedback_events ADD CONSTRAINT feedback_events_type_check
  CHECK (event_type IN ('CREATED', 'STATUS_CHANGED', 'REPLIED', 'HANDLED'));
ALTER TABLE feedback_events ADD CONSTRAINT feedback_events_handled_content_check CHECK (
  event_type <> 'HANDLED' OR (
    previous_status IS NOT NULL AND previous_status IN ('OPEN', 'IN_PROGRESS', 'WAITING_TECH', 'RESOLVED', 'CLOSED')
    AND next_status IS NOT NULL AND next_status IN ('IN_PROGRESS', 'WAITING_TECH', 'RESOLVED', 'CLOSED')
    AND public_reply IS NOT NULL AND length(btrim(public_reply)) > 0
  )
);
-- Existing append-only trigger continues to prohibit updates/deletes of handling history.
