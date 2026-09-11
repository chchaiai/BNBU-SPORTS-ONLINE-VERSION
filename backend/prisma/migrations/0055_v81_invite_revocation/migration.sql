-- Preserve rotation provenance while allowing explicit revocation without a successor.
ALTER TABLE course_invites DROP CONSTRAINT course_invites_revoke_shape_check;
ALTER TABLE course_invites ADD CONSTRAINT course_invites_revoke_shape_check CHECK (
  (status IN ('ACTIVE','EXPIRED') AND revoked_at IS NULL AND revoked_by IS NULL AND revoke_reason IS NULL AND replaced_by_invite_id IS NULL)
  OR (status='REVOKED' AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revoke_reason IS NOT NULL
    AND (replaced_by_invite_id IS NOT NULL OR revoke_reason='TEACHER_REVOKED'))
);
