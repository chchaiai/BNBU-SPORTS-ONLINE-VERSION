-- Installing the cleanup machinery does not delete existing accounts or objects.
BEGIN;
CREATE TABLE feedback_object_cleanup (
  storage_key text PRIMARY KEY,
  next_attempt_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0
);
CREATE INDEX feedback_object_cleanup_due_idx ON feedback_object_cleanup(next_attempt_at);

DO $$
DECLARE definition text; needle text;
BEGIN
  definition := pg_get_functiondef('erase_v81_student(uuid,uuid,uuid)'::regprocedure);
  needle := '''notifications'',''notification_events'',''feedback'',''feedback_events''';
  IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'Expected erasure allowlist missing'; END IF;
  definition := replace(definition,needle,needle || ',''feedback_attachments''');
  needle := '  PERFORM set_config(''bnbu.student_erasure'',''active'',true);';
  IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'Expected erasure cleanup insertion point missing'; END IF;
  definition := replace(definition,needle,$cleanup$
  INSERT INTO v81_student_media_erasure(id,organization_id,student_id,storage_key,finalize_after)
    SELECT split_part(k.storage_key,'/',3)::uuid,target_organization,target_student,k.storage_key,
      CASE WHEN k.kind='upload_key'
        THEN greatest(clock_timestamp(),(a.row_data->>'created_at')::timestamptz+interval '20 minutes')
        ELSE clock_timestamp() END
    FROM pg_temp.v81_erasure_rows a
    CROSS JOIN LATERAL (VALUES ('upload_key',a.row_data->>'upload_key'),('storage_key',a.row_data->>'storage_key')) k(kind,storage_key)
    WHERE a.relation_name='feedback_attachments' AND a.erase AND k.storage_key IS NOT NULL
    ON CONFLICT (storage_key) DO NOTHING;
$cleanup$ || needle);
  EXECUTE definition;
END;
$$;
COMMIT;
