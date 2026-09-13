"""Exercise the exact additive migration in a rolled-back PostgreSQL transaction."""
import json
import subprocess
from pathlib import Path
root = Path(__file__).resolve().parents[2]
migration = (root / 'backend/prisma/migrations/0076_notification_review_content/migration.sql').read_text(encoding='utf-8')
sql = """BEGIN;
CREATE TEMP TABLE notifications(notification_type text NOT NULL, title text NOT NULL, body text NOT NULL);
INSERT INTO notifications VALUES ('EXERCISE_RECORD_RESULT','original title','teacher original');
""" + migration + """
DO $test$
DECLARE candidate jsonb; failures int := 0;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM notifications WHERE title='original title' AND body='teacher original' AND review_content IS NULL) THEN RAISE EXCEPTION 'Legacy row changed'; END IF;
 INSERT INTO notifications VALUES ('EXERCISE_RECORD_RESULT','accepted','original','{"version":1,"stage":"VALID","reasonCode":null,"publicComment":null}');
 INSERT INTO notifications VALUES ('EXERCISE_RECORD_RESULT','invalid','original','{"version":1,"stage":"INVALID","reasonCode":"UNCLEAR_EVIDENCE","publicComment":"Original teacher text"}');
 FOREACH candidate IN ARRAY ARRAY['{}'::jsonb,'[]'::jsonb,'{"version":1,"reasonCode":null,"publicComment":null}'::jsonb,'{"version":2,"stage":"VALID","reasonCode":null,"publicComment":null}'::jsonb,'{"version":1,"stage":"VALID","reasonCode":null,"publicComment":42}'::jsonb]
 LOOP
  BEGIN
   INSERT INTO notifications VALUES ('EXERCISE_RECORD_RESULT','x','y',candidate);
  EXCEPTION WHEN check_violation THEN failures := failures + 1;
  END;
 END LOOP;
 IF failures <> 5 THEN RAISE EXCEPTION 'Rejected only % of 5 invalid structures',failures; END IF;
 BEGIN
  INSERT INTO notifications VALUES ('FEEDBACK_UPDATED','x','y','{"version":1,"stage":"VALID","reasonCode":null,"publicComment":null}');
  RAISE EXCEPTION 'Unrelated type accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 IF (SELECT count(*) FROM notifications) <> 3 THEN RAISE EXCEPTION 'Unexpected rows'; END IF;
END $test$;
ROLLBACK;
"""
result = subprocess.run(['docker','exec','-i','bnbu-v81-full-integration-integration-postgres-1','psql','-U','bnbu_test','-d','bnbu_sports_test','-v','ON_ERROR_STOP=1'],input=sql,text=True,capture_output=True,encoding='utf-8')
if result.returncode:
 raise RuntimeError(result.stderr)
evidence={'check':'NOTIFICATION_MIGRATION_POSTGRES','result':'PASS','scope':'Exact migration against temporary notifications table inside rollback transaction; not full application integration or production migration','checks':['Legacy row unchanged','Valid review facts accepted','Five invalid structures rejected','Other notification type rejected','Transaction rolled back'],'output':result.stdout.strip()}
(root / 'evidence/ocr-triplatform-20260913/notification-migration-postgres.json').write_text(json.dumps(evidence,indent=2)+'\n',encoding='utf-8')
print(json.dumps(evidence))
