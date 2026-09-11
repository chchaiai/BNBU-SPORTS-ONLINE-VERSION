-- Explicitly authorized administrator erasure of one student's operational data.
-- Audit logs and non-login history subjects remain immutable. No trigger is disabled.
CREATE TABLE v81_student_media_erasure (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id),
  student_id uuid NOT NULL, storage_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), deleted_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  finalize_after timestamptz NOT NULL DEFAULT clock_timestamp(),
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX v81_student_media_erasure_pending_idx ON v81_student_media_erasure(next_attempt_at,attempts,created_at,id)
  WHERE deleted_at IS NULL;

CREATE FUNCTION v81_student_erasure_row_allowed(relation_name text, old_row jsonb)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE permitted boolean;
BEGIN
  IF current_setting('bnbu.student_erasure',true) IS DISTINCT FROM 'active'
    OR to_regclass('pg_temp.v81_erasure_rows') IS NULL THEN RETURN false; END IF;
  EXECUTE 'SELECT EXISTS(SELECT 1 FROM pg_temp.v81_erasure_rows WHERE relation_name=$1 AND row_data=$2 AND erase)'
    INTO permitted USING relation_name,old_row;
  RETURN permitted;
END;
$$;

-- Add an exact-row exception to existing history guards. Ordinary writes retain all guards.
DO $$
DECLARE guard record; definition text;
BEGIN
  FOR guard IN SELECT t.tgname,c.relname,pg_get_triggerdef(t.oid) AS definition
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    WHERE NOT t.tgisinternal AND (t.tgtype & 8)=8 AND (t.tgtype & 1)=1
      AND c.relnamespace='public'::regnamespace AND c.relname=ANY(ARRAY[
        'enrollment_status_events','exercise_session_segments','exercise_session_events',
        'media_status_events','media_processing_attempts','exercise_records','exercise_record_media',
        'exercise_record_daily_slots','exercise_record_events','review_records','student_score_revisions',
        'score_contributions','score_adjustment_approval_events','score_publication_events',
        'notifications','notification_events','push_device_events','push_devices','user_preference_events',
        'user_preferences','feedback_events','feedback','exemption_application_events','exemption_review_records',
        'location_consent_events','location_track_events','location_retention_events',
        'roster_alignment_platform_entries','roster_alignment_results','roster_resolution_events',
        'v81_material_versions','v81_material_items','v81_application_materials','v81_swim_intakes',
        'v81_swim_intake_items','v81_final_grade_revisions','v81_physical_result_revisions',
        'v81_physical_import_confirmations','v81_ocr_physical_confirmations',
        'v81_makeup_windows','v81_makeup_revocations','v81_makeup_session_sources',
        'v81_settlement_report_revisions'])
  LOOP
    IF guard.definition LIKE '% WHEN %' THEN
      RAISE EXCEPTION 'Review existing conditional erasure guard: %',guard.tgname;
    END IF;
    definition := replace(guard.definition,' EXECUTE FUNCTION ',
      format(' WHEN (NOT v81_student_erasure_row_allowed(%L,to_jsonb(OLD))) EXECUTE FUNCTION ',guard.relname));
    EXECUTE format('DROP TRIGGER %I ON %I',guard.tgname,guard.relname);
    EXECUTE definition;
  END LOOP;
END;
$$;

CREATE FUNCTION erase_v81_student(target_organization uuid,target_student uuid,target_actor uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
#variable_conflict use_column
DECLARE target_user uuid; target_number text; relation_name text; edge record; join_condition text;
  affected integer; added integer; remaining integer; removed integer; counts jsonb; report_row record;
  revised jsonb; field_name text;
  allowed text[] := ARRAY[
    'users','student_profiles','enrollments','enrollment_status_events','exercise_sessions',
    'exercise_session_segments','exercise_session_events','exercise_records','exercise_record_media',
    'exercise_record_daily_slots','exercise_record_events','review_records','media_evidence',
    'media_status_events','media_processing_attempts','media_upload_sessions','student_scores',
    'student_score_revisions','score_contributions','score_adjustments','score_adjustment_approval_events',
    'score_publication_events','score_recalculation_attempts','exemption_applications',
    'exemption_application_events','exemption_application_media','exemption_review_records',
    'location_consents','location_consent_events','location_tracks','location_track_events',
    'location_retention_events','location_samples','location_sample_secrets','location_summaries',
    'roster_alignment_platform_entries','roster_alignment_results','roster_resolution_events',
    'notifications','notification_events','feedback','feedback_events','auth_sessions','refresh_tokens',
    'email_verification_challenges','account_recovery_challenges','student_sign_in_challenges',
    'push_devices','push_device_events','user_preferences','user_preference_events','join_capabilities',
    'idempotency_records','v81_account_security','v81_account_deletion_challenges',
    'v81_runtime_archive_capabilities','v81_material_versions','v81_material_items','v81_record_workflows',
    'v81_credit_projections','v81_swim_intakes','v81_swim_intake_items','v81_application_materials',
    'v81_certification_credits','v81_final_grade_revisions','v81_physical_result_revisions',
    'v81_physical_import_confirmations','v81_ocr_physical_confirmations','v81_makeup_windows',
    'v81_makeup_revocations','v81_makeup_session_sources','outbox_events'];
BEGIN
  PERFORM id FROM organizations WHERE id=target_organization FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM users u JOIN v81_admin_access a ON a.user_id=u.id
    WHERE u.id=target_actor AND u.organization_id=target_organization AND a.organization_id=target_organization
      AND u.role='ADMIN' AND u.status='ACTIVE' AND u.deleted_at IS NULL AND NOT a.must_change_password
      AND (a.kind='SUPER' OR a.permissions ? 'USER_ACCOUNTS')) THEN
    RAISE EXCEPTION 'Student erasure requires current scoped administrator permission';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM system_policies WHERE organization_id=target_organization AND system_mode='NORMAL')
    THEN RAISE EXCEPTION 'Student erasure requires NORMAL mode'; END IF;
  SELECT s.user_id,s.student_number INTO STRICT target_user,target_number FROM student_profiles s
    JOIN users u ON u.id=s.user_id WHERE s.id=target_student AND s.organization_id=target_organization
      AND u.organization_id=target_organization AND u.role='STUDENT' AND u.deleted_at IS NULL FOR UPDATE OF s,u;
  CREATE TEMP TABLE v81_erasure_rows(relation_name text NOT NULL,row_data jsonb NOT NULL,erase boolean NOT NULL,
    row_hash text GENERATED ALWAYS AS (md5(row_data::text)) STORED,PRIMARY KEY(relation_name,row_hash)) ON COMMIT DROP;
  -- Subjects are traversal anchors only; retirement and immutable audit references are preserved.
  INSERT INTO pg_temp.v81_erasure_rows SELECT 'v81_user_subjects',to_jsonb(s),false
    FROM v81_user_subjects s WHERE id=target_user AND organization_id=target_organization;
  FOREACH relation_name IN ARRAY ARRAY['v81_student_subjects','v81_auth_session_subjects','v81_push_device_subjects','v81_user_preference_subjects'] LOOP
    EXECUTE format('INSERT INTO pg_temp.v81_erasure_rows SELECT %L,to_jsonb(s),false FROM %I s WHERE user_id=$1 AND organization_id=$2',relation_name,relation_name)
      USING target_user,target_organization;
  END LOOP;
  INSERT INTO pg_temp.v81_erasure_rows SELECT 'users',to_jsonb(u),true FROM users u WHERE id=target_user;
  INSERT INTO pg_temp.v81_erasure_rows SELECT 'student_profiles',to_jsonb(s),true FROM student_profiles s WHERE id=target_student;
  -- Compute only FK descendants inside the reviewed table allowlist, including composite tenant keys.
  LOOP
    added:=0;
    FOR edge IN SELECT con.oid,child.relname AS child,parent.relname AS parent,con.conkey,con.confkey,con.conrelid,con.confrelid
      FROM pg_constraint con JOIN pg_class child ON child.oid=con.conrelid JOIN pg_class parent ON parent.oid=con.confrelid
      WHERE con.contype='f' AND con.connamespace='public'::regnamespace AND child.relname=ANY(allowed)
        AND EXISTS(SELECT 1 FROM pg_temp.v81_erasure_rows e WHERE e.relation_name=parent.relname)
    LOOP
      SELECT string_agg(format('to_jsonb(c)->%L=p.row_data->%L',ca.attname,pa.attname),' AND ') INTO join_condition
        FROM unnest(edge.conkey,edge.confkey) k(c,p)
        JOIN pg_attribute ca ON ca.attrelid=edge.conrelid AND ca.attnum=k.c
        JOIN pg_attribute pa ON pa.attrelid=edge.confrelid AND pa.attnum=k.p;
      EXECUTE format('INSERT INTO pg_temp.v81_erasure_rows(relation_name,row_data,erase)
        SELECT %L,to_jsonb(c),true FROM %I c WHERE EXISTS(SELECT 1 FROM pg_temp.v81_erasure_rows p WHERE p.relation_name=%L AND %s)
        ON CONFLICT DO NOTHING',edge.child,edge.child,edge.parent,join_condition);
      GET DIAGNOSTICS affected=ROW_COUNT; added:=added+affected;
    END LOOP;
    EXIT WHEN added=0;
  END LOOP;
  -- Outbox identifiers are intentionally not foreign keys.
  INSERT INTO pg_temp.v81_erasure_rows(relation_name,row_data,erase)
    SELECT 'outbox_events',to_jsonb(o),true FROM outbox_events o WHERE o.organization_id=target_organization
      AND EXISTS(SELECT 1 FROM pg_temp.v81_erasure_rows p WHERE p.erase AND p.row_data->>'id'=o.aggregate_id::text)
    ON CONFLICT DO NOTHING;
  INSERT INTO pg_temp.v81_erasure_rows(relation_name,row_data,erase)
    SELECT 'idempotency_records',to_jsonb(i),true FROM idempotency_records i WHERE i.organization_id=target_organization
      AND EXISTS(SELECT 1 FROM pg_temp.v81_erasure_rows p WHERE p.erase AND p.row_data->>'id'=i.resource_id::text)
    ON CONFLICT DO NOTHING;
  SELECT jsonb_object_agg(relation_name,n) INTO counts FROM
    (SELECT e.relation_name,count(*) n FROM pg_temp.v81_erasure_rows e WHERE erase GROUP BY e.relation_name) x;
  INSERT INTO v81_student_media_erasure(id,organization_id,student_id,storage_key,finalize_after)
    SELECT (m.row_data->>'id')::uuid,target_organization,target_student,m.row_data->>'storage_key',
      greatest(clock_timestamp(),coalesce((SELECT max((u.row_data->>'capability_expires_at')::timestamptz)+interval '5 minutes'
        FROM pg_temp.v81_erasure_rows u WHERE u.relation_name='media_upload_sessions'
          AND u.row_data->>'media_id'=m.row_data->>'id'),clock_timestamp()))
    FROM pg_temp.v81_erasure_rows m WHERE m.relation_name='media_evidence' AND m.row_data->>'storage_key' IS NOT NULL ON CONFLICT DO NOTHING;
  PERFORM set_config('bnbu.student_erasure','active',true);
  -- Remove this student's rows from every saved course report without removing peers' rows.
  FOR report_row IN SELECT * FROM v81_settlement_report_revisions r WHERE organization_id=target_organization
    AND EXISTS(SELECT 1 FROM pg_temp.v81_erasure_rows e WHERE e.relation_name='enrollments' AND e.row_data->>'class_section_id'=r.class_section_id::text)
  LOOP
    revised:=report_row.report;
    FOREACH field_name IN ARRAY ARRAY['rows','extras'] LOOP
      revised:=jsonb_set(revised,ARRAY[field_name],coalesce((SELECT jsonb_agg(item ORDER BY position) FROM jsonb_array_elements(revised->field_name) WITH ORDINALITY entries(item,position)
        WHERE NOT (coalesce(item->>'studentId','')=target_student::text OR coalesce(item->>'studentNumber','')=target_number
          OR EXISTS(SELECT 1 FROM pg_temp.v81_erasure_rows e WHERE e.relation_name='enrollments' AND e.row_data->>'id'=item->>'enrollmentId'))),'[]'::jsonb));
    END LOOP;
    IF revised IS DISTINCT FROM report_row.report THEN
      INSERT INTO pg_temp.v81_erasure_rows(relation_name,row_data,erase) VALUES('v81_settlement_report_revisions',to_jsonb(report_row),true);
      UPDATE v81_settlement_report_revisions SET report=revised,
        report_sha256=encode(sha256(convert_to(revised::text,'UTF8')),'hex') WHERE id=report_row.id;
      DELETE FROM pg_temp.v81_erasure_rows WHERE relation_name='v81_settlement_report_revisions';
    END IF;
  END LOOP;
  -- Break the score/revision reference cycle before deleting both sides.
  UPDATE student_scores SET current_working_revision_id=NULL,published_revision_id=NULL
    WHERE organization_id=target_organization AND student_id=target_student;
  DELETE FROM pg_temp.v81_erasure_rows WHERE relation_name='student_scores';
  INSERT INTO pg_temp.v81_erasure_rows(relation_name,row_data,erase)
    SELECT 'student_scores',to_jsonb(s),true FROM student_scores s WHERE organization_id=target_organization AND student_id=target_student;
  LOOP
    removed:=0;
    FOREACH relation_name IN ARRAY allowed LOOP
      BEGIN
        EXECUTE format('DELETE FROM %I d USING pg_temp.v81_erasure_rows p WHERE p.relation_name=%L AND p.erase AND to_jsonb(d)=p.row_data',relation_name,relation_name);
        GET DIAGNOSTICS affected=ROW_COUNT; removed:=removed+affected;
      EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN NULL; -- Retry parents after their children, within this transaction.
      END;
    END LOOP;
    EXIT WHEN removed=0;
  END LOOP;
  FOREACH relation_name IN ARRAY allowed LOOP
    -- Check primary keys, not the old whole-row hash: an unexpected trigger mutation must fail closed.
    SELECT string_agg(format('to_jsonb(d)->%L=p.row_data->%L',a.attname,a.attname),' AND ') INTO join_condition
      FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
      WHERE c.contype='p' AND c.conrelid=to_regclass('public.'||relation_name);
    IF join_condition IS NULL THEN RAISE EXCEPTION 'Student erasure table has no primary key: %',relation_name; END IF;
    EXECUTE format('SELECT count(*) FROM %I d JOIN pg_temp.v81_erasure_rows p ON p.relation_name=%L AND p.erase AND %s',relation_name,relation_name,join_condition) INTO remaining;
    IF remaining<>0 THEN RAISE EXCEPTION 'Student erasure has unresolved dependency in %',relation_name; END IF;
  END LOOP;
  PERFORM set_config('bnbu.student_erasure','inactive',true);
  RETURN counts;
END;
$$;
