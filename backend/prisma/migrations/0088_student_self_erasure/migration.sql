-- Self-service uses the existing scoped erasure after consuming a session-bound OTP.
-- Installing this function does not erase any account or historical record.
DO $$
DECLARE definition text; needle text;
BEGIN
  definition := pg_get_functiondef('erase_v81_student(uuid,uuid,uuid)'::regprocedure);
  needle := 'THEN' || chr(10) || '    RAISE EXCEPTION ''Student erasure requires current scoped administrator permission'';';
  IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'Expected erasure authorization guard missing'; END IF;
  definition := replace(definition,needle,$guard$AND NOT EXISTS (
    SELECT 1 FROM v81_account_deletion_challenges c
    JOIN users u ON u.id=c.user_id AND u.organization_id=c.organization_id
    JOIN student_profiles s ON s.user_id=u.id AND s.organization_id=u.organization_id
    JOIN auth_sessions a ON a.id=c.auth_session_id AND a.user_id=u.id
    WHERE c.id::text=current_setting('bnbu.self_erasure_challenge',true)
      AND c.organization_id=target_organization AND c.user_id=target_actor AND s.id=target_student
      AND c.status='CONSUMED' AND c.expires_at>clock_timestamp() AND c.failed_attempts<5
      AND c.expected_user_version=u.version AND u.role='STUDENT' AND u.status='ACTIVE' AND u.deleted_at IS NULL
      AND a.status='ACTIVE' AND EXISTS(SELECT 1 FROM system_policies WHERE organization_id=target_organization AND system_mode='NORMAL')
  ) THEN
    RAISE EXCEPTION 'Student erasure requires administrator permission or verified self-service challenge';$guard$);
  EXECUTE definition;
END;
$$;
