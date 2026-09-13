-- Additive capability only: migration does not delete business data.
DO $$
DECLARE guard record; definition text; insert_definition text;
BEGIN
 FOR guard IN SELECT t.tgname,c.relname,pg_get_triggerdef(t.oid) AS definition
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
 WHERE NOT t.tgisinternal AND (t.tgtype & 8)=8 AND (t.tgtype & 1)=1
 AND c.relnamespace='public'::regnamespace AND c.relname=ANY(ARRAY['class_sections','class_section_excluded_dates','course_invites','enrollments','enrollment_status_events','join_capabilities','official_roster_imports','official_roster_entries','roster_alignment_runs','roster_alignment_platform_entries','roster_alignment_results','roster_resolution_events','exercise_sessions','exercise_session_segments','exercise_session_events','media_evidence','media_upload_sessions','media_status_events','media_processing_attempts','exercise_records','exercise_record_media','exercise_record_daily_slots','exercise_record_events','review_records','score_rules','score_rule_approval_events','student_scores','student_score_revisions','score_contributions','score_adjustments','score_adjustment_approval_events','score_publication_events','score_recalculation_attempts','exemption_applications','exemption_application_events','exemption_review_records','exemption_application_media','location_tracks','location_track_events','location_samples','location_sample_secrets','location_summaries','location_retention_events','v81_course_rules','v81_record_workflows','v81_material_versions','v81_material_items','v81_interruptions','v81_manual_modes','v81_credit_projections','v81_certification_credits','v81_application_materials','v81_swim_intakes','v81_swim_intake_items','v81_final_grade_revisions','v81_physical_result_revisions','v81_physical_import_batches','v81_physical_import_row_revisions','v81_physical_import_confirmations','v81_confirmed_rosters','v81_ocr_batches','v81_ocr_page_attempts','v81_ocr_jobs','v81_ocr_draft_revisions','v81_ocr_physical_confirmations','v81_roster_basis_history','v81_makeup_windows','v81_makeup_revocations','v81_makeup_session_sources','v81_ocr_execution_services','v81_settlement_report_revisions','notifications','notification_events','outbox_events','idempotency_records'])
 LOOP
  IF guard.definition LIKE '%v81_student_erasure_row_allowed%' THEN CONTINUE; END IF;
  IF guard.definition LIKE '% WHEN %' THEN RAISE EXCEPTION 'Review conditional erasure guard %',guard.tgname;END IF;
  definition:=guard.definition;
  IF definition LIKE '% INSERT OR %' THEN
   insert_definition:=regexp_replace(definition,'(BEFORE|AFTER) .* ON public\.','\1 INSERT ON public.');
   insert_definition:=replace(insert_definition,format('TRIGGER %I ',guard.tgname),format('TRIGGER %I ',guard.tgname||'_insert'));
   definition:=replace(definition,'INSERT OR ','');
  ELSE insert_definition:=NULL;END IF;
  definition:=replace(definition,' EXECUTE FUNCTION ',format(' WHEN (NOT v81_student_erasure_row_allowed(%L,to_jsonb(OLD))) EXECUTE FUNCTION ',guard.relname));
  EXECUTE format('DROP TRIGGER %I ON %I',guard.tgname,guard.relname);EXECUTE definition;IF insert_definition IS NOT NULL THEN EXECUTE insert_definition;END IF;
 END LOOP;
END;$$;
CREATE FUNCTION erase_v81_course(target_organization uuid,target_course uuid,target_actor uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
#variable_conflict use_column
DECLARE relation_name text;edge record;join_condition text;affected integer;added integer;remaining integer;removed integer;counts jsonb;
allowed text[]:=ARRAY['class_sections','class_section_excluded_dates','course_invites','enrollments','enrollment_status_events','join_capabilities','official_roster_imports','official_roster_entries','roster_alignment_runs','roster_alignment_platform_entries','roster_alignment_results','roster_resolution_events','exercise_sessions','exercise_session_segments','exercise_session_events','media_evidence','media_upload_sessions','media_status_events','media_processing_attempts','exercise_records','exercise_record_media','exercise_record_daily_slots','exercise_record_events','review_records','score_rules','score_rule_approval_events','student_scores','student_score_revisions','score_contributions','score_adjustments','score_adjustment_approval_events','score_publication_events','score_recalculation_attempts','exemption_applications','exemption_application_events','exemption_review_records','exemption_application_media','location_tracks','location_track_events','location_samples','location_sample_secrets','location_summaries','location_retention_events','v81_course_rules','v81_record_workflows','v81_material_versions','v81_material_items','v81_interruptions','v81_manual_modes','v81_credit_projections','v81_certification_credits','v81_application_materials','v81_swim_intakes','v81_swim_intake_items','v81_final_grade_revisions','v81_physical_result_revisions','v81_physical_import_batches','v81_physical_import_row_revisions','v81_physical_import_confirmations','v81_confirmed_rosters','v81_ocr_batches','v81_ocr_page_attempts','v81_ocr_jobs','v81_ocr_draft_revisions','v81_ocr_physical_confirmations','v81_roster_basis_history','v81_makeup_windows','v81_makeup_revocations','v81_makeup_session_sources','v81_ocr_execution_services','v81_settlement_report_revisions','notifications','notification_events','outbox_events','idempotency_records'];
BEGIN
 PERFORM id FROM organizations WHERE id=target_organization FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM class_sections c JOIN teacher_profiles t ON t.id=c.teacher_id AND t.organization_id=c.organization_id
 JOIN users u ON u.id=t.user_id AND u.organization_id=t.organization_id
 WHERE c.id=target_course AND c.organization_id=target_organization AND u.id=target_actor AND u.role='TEACHER' AND u.status='ACTIVE' AND u.deleted_at IS NULL)
 THEN RAISE EXCEPTION 'Course erasure requires responsible teacher';END IF;
 IF NOT EXISTS(SELECT 1 FROM system_policies WHERE organization_id=target_organization AND system_mode='NORMAL') THEN RAISE EXCEPTION 'Course erasure requires NORMAL mode';END IF;
 CREATE TEMP TABLE v81_erasure_rows(relation_name text NOT NULL,row_data jsonb NOT NULL,erase boolean NOT NULL,
 row_hash text GENERATED ALWAYS AS (md5(row_data::text)) STORED,PRIMARY KEY(relation_name,row_hash)) ON COMMIT DROP;
 INSERT INTO pg_temp.v81_erasure_rows SELECT 'class_sections',to_jsonb(c),true FROM class_sections c WHERE id=target_course AND organization_id=target_organization;
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
    INSERT INTO pg_temp.v81_erasure_rows SELECT 'media_evidence',to_jsonb(m),true FROM media_evidence m
      WHERE m.organization_id=target_organization AND EXISTS(SELECT 1 FROM pg_temp.v81_erasure_rows r
        WHERE r.relation_name=ANY(ARRAY['exercise_record_media','exemption_application_media','v81_material_items','v81_application_materials'])
          AND r.row_data->>'media_id'=m.id::text) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS affected=ROW_COUNT;added:=added+affected;
    EXIT WHEN added=0;
  END LOOP;

 IF EXISTS(SELECT 1 FROM pg_temp.v81_erasure_rows WHERE row_data ? 'class_section_id' AND row_data->>'class_section_id' IS NOT NULL AND row_data->>'class_section_id'<>target_course::text)
 THEN RAISE EXCEPTION 'Course erasure crosses course boundary';END IF;
 IF EXISTS(SELECT 1 FROM pg_temp.v81_erasure_rows WHERE row_data ? 'organization_id' AND row_data->>'organization_id'<>target_organization::text)
 THEN RAISE EXCEPTION 'Course erasure crosses organization boundary';END IF;
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
    SELECT (m.row_data->>'id')::uuid,target_organization,(m.row_data->>'owner_student_id')::uuid,m.row_data->>'storage_key',
      greatest(clock_timestamp(),coalesce((SELECT max((u.row_data->>'capability_expires_at')::timestamptz)+interval '5 minutes'
        FROM pg_temp.v81_erasure_rows u WHERE u.relation_name='media_upload_sessions'
          AND u.row_data->>'media_id'=m.row_data->>'id'),clock_timestamp()))
    FROM pg_temp.v81_erasure_rows m WHERE m.relation_name='media_evidence' AND m.row_data->>'storage_key' IS NOT NULL ON CONFLICT DO NOTHING;
  PERFORM set_config('bnbu.student_erasure','active',true);

 UPDATE student_scores SET current_working_revision_id=NULL,published_revision_id=NULL WHERE organization_id=target_organization AND class_section_id=target_course;
 DELETE FROM pg_temp.v81_erasure_rows WHERE relation_name='student_scores';
 INSERT INTO pg_temp.v81_erasure_rows SELECT 'student_scores',to_jsonb(s),true FROM student_scores s WHERE organization_id=target_organization AND class_section_id=target_course;
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
