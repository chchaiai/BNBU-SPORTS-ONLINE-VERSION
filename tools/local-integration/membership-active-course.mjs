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
  assert.equal((await db.$queryRaw`SELECT current_database() AS name`)[0].name, 'v81_browser_test');
  const fixture = await seedFoundationFixture(db, `DEMAND-${randomUUID().slice(0, 8).toUpperCase()}`);
  await db.v81AccountSecurity.createMany({ data: [fixture.adminUserId, fixture.teacherUserId, fixture.teacherBUserId].map(userId => ({
    userId, organizationId: fixture.organizationId, mustChangePassword: false, passwordChangedAt: new Date(),
  })) });
  await db.v81AdminAccess.create({ data: { userId: fixture.adminUserId, organizationId: fixture.organizationId,
    kind: 'SUPER', permissions: [], mustChangePassword: false } });
  const record = await seedSubmittedExerciseRecord(db, fixture, randomUUID().slice(0, 8).toUpperCase());
  const login = async account => {
    const result = await api('/auth/password-login', null, { account, password: TEST_PASSWORD });
    assert.equal(result.status, 200, result.errorCode);
    return result.data.accessToken;
  };
  const teacher = await login(fixture.teacherEmail);
  const otherTeacher = await login(fixture.teacherBEmail);
  const admin = await login(fixture.adminEmail);

  const before=await api('/exercise-records?limit=100',teacher);assert.equal(before.status,200);
  const rows=value=>Array.isArray(value)?value:value.items;
  assert.ok(rows(before.data).some(r=>r.id===record.recordId));
  const enrollment=await db.enrollment.findUniqueOrThrow({where:{id:rows(before.data).find(r=>r.id===record.recordId).enrollmentId}});
  const removed=await api(`/enrollments/${enrollment.id}/remove`,teacher,{reason:'Synthetic active course member removal regression',expectedVersion:enrollment.version});assert.equal(removed.status,200);
  const after=await api('/exercise-records?limit=100',teacher);assert.equal(after.status,200);assert.ok(!rows(after.data).some(r=>r.id===record.recordId));
  assert.equal((await db.classSection.findUniqueOrThrow({where:{id:enrollment.classSectionId}})).status,'ACTIVE');
  assert.equal(await db.exerciseRecord.count({where:{id:record.recordId}}),1);
  pass('ACTIVE_COURSE_REMOVED_MEMBER_RECORD_HIDDEN_HISTORY_PRESERVED');
}finally{await db.$disconnect();}
