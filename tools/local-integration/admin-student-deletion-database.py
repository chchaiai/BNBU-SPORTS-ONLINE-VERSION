"""Rollback-only relational erasure regression against the dedicated local Docker database."""
import json
import subprocess
from pathlib import Path

fixture = json.loads(Path('.local/v81-browser-state/state.json').read_text(encoding='utf-8'))['fixture']
organization, actor = fixture['organizationId'], fixture['adminUserId']
command = ['docker', 'exec', '-i', 'bnbu-v81-local-validation-sql-postgres-1', 'psql',
           '-U', 'v81_probe', '-d', 'v81_browser_test', '-At', '-v', 'ON_ERROR_STOP=1']

def query(source):
    result = subprocess.run(command, input=source, text=True, capture_output=True, encoding='utf-8')
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()

students = json.loads(query(f"""SELECT json_agg(id) FROM (SELECT s.id FROM student_profiles s
  WHERE organization_id='{organization}' ORDER BY
    (SELECT count(*) FROM exemption_applications a WHERE a.student_id=s.id) DESC,
    (SELECT count(*) FROM exercise_records r WHERE r.student_id=s.id) DESC LIMIT 3) x;"""))
for student in students:
    output = query(f"""BEGIN;
      CREATE TEMP TABLE peer_before ON COMMIT DROP AS SELECT md5(coalesce(string_agg(j::text,'' ORDER BY j::text),'')) value FROM (
        SELECT to_jsonb(r) j FROM exercise_records r WHERE student_id<>'{student}'
        UNION ALL SELECT to_jsonb(e) FROM enrollments e WHERE student_id<>'{student}'
        UNION ALL SELECT to_jsonb(a) FROM exemption_applications a WHERE student_id<>'{student}') x;
      SELECT erase_v81_student('{organization}','{student}','{actor}');
      DO $$ BEGIN
        IF EXISTS(SELECT 1 FROM student_profiles WHERE id='{student}') OR EXISTS(SELECT 1 FROM enrollments WHERE student_id='{student}')
          OR EXISTS(SELECT 1 FROM exercise_records WHERE student_id='{student}') OR EXISTS(SELECT 1 FROM exemption_applications WHERE student_id='{student}')
          THEN RAISE EXCEPTION 'Student data remains'; END IF;
        IF (SELECT value FROM peer_before) IS DISTINCT FROM (SELECT md5(coalesce(string_agg(j::text,'' ORDER BY j::text),'')) FROM (
          SELECT to_jsonb(r) j FROM exercise_records r WHERE student_id<>'{student}'
          UNION ALL SELECT to_jsonb(e) FROM enrollments e WHERE student_id<>'{student}'
          UNION ALL SELECT to_jsonb(a) FROM exemption_applications a WHERE student_id<>'{student}') x)
          THEN RAISE EXCEPTION 'Peer data changed'; END IF;
      END $$;
      ROLLBACK;""")
    counts = next(line for line in output.splitlines() if line.startswith('{'))
    print(json.dumps({'check': 'RICH_STUDENT_ERASURE_ROLLBACK', 'result': 'PASS', 'deletedCounts': json.loads(counts)}))

query("""BEGIN; DO $$ BEGIN
  BEGIN
    DELETE FROM exercise_record_events WHERE id=(SELECT id FROM exercise_record_events LIMIT 1);
    RAISE EXCEPTION 'ERASURE_GUARD_BYPASSED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%history is append-only%' THEN RAISE; END IF;
  END;
END $$; ROLLBACK;""")
print(json.dumps({'check': 'HISTORY_GUARD_OUTSIDE_ERASURE', 'result': 'PASS'}))

report_target = json.loads(query("""SELECT row_to_json(t) FROM (SELECT s.id,s.student_number,r.organization_id,a.user_id actor
  FROM v81_settlement_report_revisions r CROSS JOIN LATERAL jsonb_array_elements(r.report->'rows') item
  JOIN student_profiles s ON s.id::text=item->>'studentId'
  JOIN v81_admin_access a ON a.organization_id=r.organization_id AND a.kind='SUPER'
  JOIN users u ON u.id=a.user_id AND u.status='ACTIVE' WHERE NOT a.must_change_password LIMIT 1) t;"""))
student = report_target['id']
query(f"""BEGIN;
  CREATE TEMP TABLE report_peers ON COMMIT DROP AS
    SELECT r.id,jsonb_agg(item ORDER BY position) rows FROM v81_settlement_report_revisions r
    CROSS JOIN LATERAL jsonb_array_elements(r.report->'rows') WITH ORDINALITY x(item,position)
    WHERE r.organization_id='{report_target['organization_id']}' AND coalesce(item->>'studentId','')<>'{student}'
      AND coalesce(item->>'studentNumber','')<>(SELECT student_number FROM student_profiles WHERE id='{student}') GROUP BY r.id;
  SELECT erase_v81_student('{report_target['organization_id']}','{student}','{report_target['actor']}');
  DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM v81_settlement_report_revisions r CROSS JOIN LATERAL jsonb_array_elements(r.report->'rows') item
      WHERE item->>'studentId'='{student}') THEN RAISE EXCEPTION 'Deleted student remains in report'; END IF;
    IF EXISTS(SELECT 1 FROM report_peers p JOIN v81_settlement_report_revisions r ON r.id=p.id WHERE r.report->'rows' IS DISTINCT FROM p.rows)
      THEN RAISE EXCEPTION 'Report peer rows changed'; END IF;
    IF EXISTS(SELECT 1 FROM v81_settlement_report_revisions WHERE report_sha256<>encode(sha256(convert_to(report::text,'UTF8')),'hex'))
      THEN RAISE EXCEPTION 'Report digest mismatch'; END IF;
  END $$;
  ROLLBACK;""")
print(json.dumps({'check': 'SAVED_REPORT_STUDENT_ERASURE_PEERS_AND_DIGEST', 'result': 'PASS'}))
