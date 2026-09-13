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
  const now=new Date(),applicationIds=[];
  for(const [applicationType,applicationSubtype,status] of [['PHYSICAL_TEST','RUN_1000M','APPROVED'],['EXERCISE_CHECK_IN','SCHOOL_TEAM','APPROVED'],['EXERCISE_CHECK_IN','STUDENT_CLUB','DRAFT'],['PHYSICAL_TEST','RUN_1000M','SUBMITTED']]){
    const id=randomUUID();applicationIds.push(id);
    await db.exemptionApplication.create({data:{id,organizationId:fixture.organizationId,semesterId:enrollment.semesterId,classSectionId:enrollment.classSectionId,enrollmentId:enrollment.id,studentId:record.studentId,applicationType,applicationSubtype,organizationName:applicationType==='EXERCISE_CHECK_IN'?'Synthetic team':null,reason:'Synthetic membership lifetime fixture',status,submittedAt:status==='DRAFT'?null:now,decidedAt:status==='APPROVED'?now:null,createdAt:now,updatedAt:now}});
    if(applicationType==='EXERCISE_CHECK_IN'&&status==='APPROVED')await db.$executeRaw`INSERT INTO v81_certification_credits(application_id,enrollment_id,organization_id,course_minutes,general_minutes,active,version) VALUES(${id}::uuid,${enrollment.id}::uuid,${fixture.organizationId}::uuid,15,15,true,1)`;
  }
  const removed=await api(`/enrollments/${enrollment.id}/remove`,teacher,{reason:'Synthetic active course member removal regression',expectedVersion:enrollment.version});assert.equal(removed.status,200);
  const after=await api('/exercise-records?limit=100',teacher);assert.equal(after.status,200);assert.ok(!rows(after.data).some(r=>r.id===record.recordId));
  assert.equal((await db.classSection.findUniqueOrThrow({where:{id:enrollment.classSectionId}})).status,'ACTIVE');
  assert.equal(await db.exerciseRecord.count({where:{id:record.recordId}}),1);
  const cleared=await db.exemptionApplication.findMany({where:{id:{in:applicationIds}}});
  assert.equal(cleared.length,4);assert.ok(cleared.every(a=>a.status==='REVOKED'&&a.membershipClearedAt));
  assert.equal(await db.v81CertificationCredit.count({where:{enrollmentId:enrollment.id,active:true}}),0);
  const apps=await api('/exemption-applications?limit=100',teacher);assert.equal(apps.status,200);assert.ok(!rows(apps.data).some(a=>applicationIds.includes(a.id)));
  assert.equal((await api('/exemption-applications/'+applicationIds[0],teacher)).status,404);
  const events=await db.$queryRaw`SELECT resource_id FROM v81_events WHERE resource_type='EXEMPTION_MEMBERSHIP' AND resource_id=ANY(${applicationIds}::uuid[]) AND is_system_actor=true`;
  assert.equal(events.length,4);
  const restored=await api(`/enrollments/${enrollment.id}/restore`,teacher,{reason:'Synthetic restore must not revive cleared applications',expectedVersion:removed.data.version});assert.equal(restored.status,200);
  assert.equal((await db.exemptionApplication.findMany({where:{id:{in:applicationIds},membershipClearedAt:null}})).length,0);
  pass('REMOVAL_CLEARS_APPROVED_PENDING_DRAFT_QUALIFICATIONS_AND_RESTORE_DOES_NOT_REVIVE');
  pass('ACTIVE_COURSE_REMOVED_MEMBER_RECORD_HIDDEN_HISTORY_PRESERVED');
}finally{await db.$disconnect();}
