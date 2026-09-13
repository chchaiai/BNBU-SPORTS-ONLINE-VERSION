// Runs only against the isolated Docker test database and local HTTP server.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestPrisma, seedFoundationFixture } from '/workspace/backend/test/helpers/database.ts';
import { seedSubmittedExerciseRecord } from '/workspace/backend/test/helpers/exercise-review.ts';
import { TEST_PASSWORD } from '/workspace/backend/test/helpers/test-environment.ts';

const database = new URL('postgresql://sql-postgres:5432/v81_browser_test');
database.username = process.env.PGUSER;
database.password = process.env.PGPASSWORD;
const db = createTestPrisma(database.href);
const base = 'http://127.0.0.1:3199/api/v1';
const evidence = [];
async function api(path, token, body, key = randomUUID()) {
  const response = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', 'idempotency-key': key,
      ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const value = await response.json();
  return { status: response.status, data: value.data, errorCode: value.error?.code };
}
const pass = (check, facts = {}) => { const result = { check, result: 'PASS', ...facts }; evidence.push(result); console.log(JSON.stringify(result)); };
try {
 let result;try{await db.$transaction(async tx=>{
 const members=await tx.$queryRaw`SELECT e.id FROM enrollments e WHERE EXISTS(SELECT 1 FROM v81_settlement_report_revisions r WHERE r.class_section_id=e.class_section_id)`;
 assert.ok(members.length>0);
 const snapshot=()=>tx.$queryRaw`SELECT r.id,r.report_sha256,(SELECT coalesce(jsonb_agg(jsonb_build_array(a.id,a.status,a.version,a.membership_cleared_at) ORDER BY a.id),'[]'::jsonb) FROM exemption_applications a WHERE a.class_section_id=r.class_section_id) AS applications FROM v81_settlement_report_revisions r ORDER BY r.id`;
 const before=await snapshot();for(const m of members){await tx.$executeRaw`UPDATE enrollments SET status='REMOVED',ended_at=now(),end_reason='Synthetic rollback-only settlement guard test',updated_at=now(),version=version+1 WHERE id=${m.id}::uuid AND status='ACTIVE'`;await tx.$executeRaw`SELECT clear_removed_enrollment_applications(${m.id}::uuid)`;}
 assert.deepEqual(await snapshot(),before);result={members:members.length,reports:before.length};throw new Error('ROLLBACK_TEST_COMPLETE');
 });}catch(error){if(error.message!=='ROLLBACK_TEST_COMPLETE')throw error;}
 console.log(JSON.stringify({check:'SETTLED_REPORTS_AND_APPLICATION_FACTS_UNCHANGED',result:'PASS',...result}));
}finally{await db.$disconnect();}
