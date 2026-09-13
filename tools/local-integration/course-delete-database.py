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


sections=json.loads(query(f"SELECT json_agg(x) FROM (SELECT c.id,t.user_id FROM class_sections c JOIN teacher_profiles t ON t.id=c.teacher_id WHERE c.organization_id='{organization}' ORDER BY (SELECT count(*) FROM exercise_records e WHERE e.class_section_id=c.id) DESC LIMIT 3) x"))
for section in sections:
 course=section['id'];teacher=section['user_id']
 preserved=f"SELECT to_jsonb(u) j FROM users u UNION ALL SELECT to_jsonb(s) FROM student_profiles s UNION ALL SELECT to_jsonb(e) FROM enrollments e WHERE class_section_id<>'{course}' UNION ALL SELECT to_jsonb(r) FROM exercise_records r WHERE class_section_id<>'{course}'"
 result=query(f"""BEGIN;
 CREATE TEMP TABLE preserved_before ON COMMIT DROP AS SELECT md5(string_agg(j::text,'' ORDER BY j::text)) value FROM ({preserved}) x;
 SELECT erase_v81_course('{organization}','{course}','{teacher}');
 DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM class_sections WHERE id='{course}') OR EXISTS(SELECT 1 FROM exercise_records WHERE class_section_id='{course}') THEN RAISE EXCEPTION 'Course rows remain';END IF;
 IF (SELECT value FROM preserved_before) IS DISTINCT FROM (SELECT md5(string_agg(j::text,'' ORDER BY j::text)) FROM ({preserved}) x) THEN RAISE EXCEPTION 'Other course or account data changed';END IF;
 END $$;
 ROLLBACK;""")
 print(json.dumps({'check':'RICH_COURSE_ERASURE_ROLLBACK','result':'PASS','studentAccountsAndOtherCoursesUnchanged':True,'counts':json.loads(next(line for line in result.splitlines() if line.startswith('{')))}))
