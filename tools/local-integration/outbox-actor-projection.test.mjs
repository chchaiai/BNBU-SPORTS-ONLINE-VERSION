import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

// Runs only synthetic rows in connection-local temporary tables, rolled back at the end.
test('media actors use organization and exact version; workers and legacy events stay distinct', {
  skip: !process.env.OUTBOX_TEST_CONTAINER,
}, () => {
  const source = readFileSync(new URL('../../backend/src/modules/health/outbox-diagnostics.service.ts', import.meta.url), 'utf8');
  const query = source.slice(source.indexOf('SELECT e.id,coalesce'), source.indexOf('`) : [];', source.indexOf('SELECT e.id,coalesce')))
    .replace('${principal.organizationId}', "'00000000-0000-4000-8000-000000000001'")
    .replace('${Prisma.join(page.map(item=>item.id))}', Array.from({length: 6}, (_, i) => `'00000000-0000-4000-8000-00000000001${i}'`).join(','));
  const sql = `BEGIN;
CREATE TEMP TABLE outbox_events(id uuid, organization_id uuid, aggregate_type text, aggregate_id uuid, event_version int, payload jsonb);
CREATE TEMP TABLE media_status_events(id uuid, organization_id uuid, media_id uuid, event_version int, actor_type text, actor_user_id uuid, request_id text);
CREATE TEMP TABLE audit_logs(id uuid, organization_id uuid, target_id uuid, request_id text, actor_user_id uuid, outcome text, action_type text, occurred_at timestamptz);
CREATE TEMP TABLE users(id uuid, organization_id uuid, primary_email text, role text);
CREATE TEMP TABLE student_profiles(user_id uuid, organization_id uuid, full_name text, student_number text);
CREATE TEMP TABLE teacher_profiles(user_id uuid, organization_id uuid, full_name text);
CREATE TEMP TABLE admin_profiles(user_id uuid, organization_id uuid, full_name text);
INSERT INTO users VALUES ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','synthetic@example.invalid','STUDENT');
INSERT INTO student_profiles SELECT id,organization_id,'Synthetic student','S001' FROM users;
INSERT INTO outbox_events SELECT ('00000000-0000-4000-8000-00000000001'||n)::uuid,'00000000-0000-4000-8000-000000000001',CASE WHEN n=5 THEN 'OTHER' ELSE 'MEDIA_EVIDENCE' END,'00000000-0000-4000-8000-000000000003',n+1,CASE WHEN n=5 THEN '{"requestId":"legacy"}'::jsonb ELSE '{}'::jsonb END FROM generate_series(0,5) n;
INSERT INTO media_status_events SELECT id,organization_id,aggregate_id,event_version,CASE WHEN event_version=2 THEN 'WORKER' ELSE 'USER' END,CASE WHEN event_version=2 THEN NULL ELSE '00000000-0000-4000-8000-000000000002'::uuid END,'media-request' FROM outbox_events WHERE event_version<=2;
-- Another version and organization must not fill missing actors.
INSERT INTO media_status_events VALUES ('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000099','00000000-0000-4000-8000-000000000003',3,'USER','00000000-0000-4000-8000-000000000002','wrong-organization');
INSERT INTO audit_logs VALUES ('00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','legacy','00000000-0000-4000-8000-000000000002','SUCCEEDED','LEGACY',now());
SELECT coalesce(json_agg(result ORDER BY result.id),'[]'::json) FROM (${query}) result;
ROLLBACK;`;
  const result = spawnSync('docker', ['exec','-i',process.env.OUTBOX_TEST_CONTAINER,'sh','-c','psql -X -q -t -A -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'], { input: sql, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const rows = JSON.parse(result.stdout.trim());
  assert.equal(rows.length, 6);
  assert.equal(rows[0].actorName, 'Synthetic student');
  assert.equal(rows[0].operationOutcome, 'SUCCEEDED');
  assert.equal(rows[1].actorRole, 'SYSTEM');
  assert.equal(rows[1].actorName, null);
  for (const row of rows.slice(2, 5)) { assert.equal(row.actorName, null); assert.equal(row.operationOutcome, null); }
  assert.equal(rows[5].actorName, 'Synthetic student');
  assert.equal(rows[5].action, 'LEGACY');
});
