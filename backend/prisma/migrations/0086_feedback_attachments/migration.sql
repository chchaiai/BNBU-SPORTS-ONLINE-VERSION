CREATE TABLE feedback_attachments (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  owner_id uuid NOT NULL REFERENCES v81_user_subjects(id),
  feedback_id uuid REFERENCES feedback(id),
  file_name varchar(180) NOT NULL,
  mime_type varchar(120) NOT NULL,
  size integer NOT NULL CHECK (size BETWEEN 1 AND 52428800),
  upload_key text NOT NULL,
  storage_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX feedback_attachments_feedback_idx ON feedback_attachments(organization_id,feedback_id);
CREATE INDEX feedback_attachments_owner_idx ON feedback_attachments(organization_id,owner_id,created_at);
