-- Subadministrators use a distinct login account. Their contact email may also
-- belong to a student, without changing other users' email uniqueness.
BEGIN;
ALTER TABLE users ADD COLUMN email_identity_scope varchar(16) NOT NULL DEFAULT 'PRIMARY';
ALTER TABLE users ADD CONSTRAINT users_email_identity_scope_check
  CHECK (email_identity_scope = 'PRIMARY' OR (email_identity_scope = 'SUBADMIN' AND role = 'ADMIN'));
UPDATE users u SET email_identity_scope = 'SUBADMIN'
FROM v81_admin_access a WHERE a.user_id = u.id AND a.organization_id = u.organization_id AND a.kind = 'SUB';
CREATE UNIQUE INDEX users_organization_email_scope_normalized_key
  ON users (organization_id, email_identity_scope, primary_email_normalized);
DROP INDEX users_organization_email_normalized_key;
COMMIT;
