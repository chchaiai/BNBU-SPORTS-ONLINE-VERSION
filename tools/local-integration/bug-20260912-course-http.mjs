// Runs only against the isolated Docker test database and local HTTP server.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestPrisma, seedFoundationFixture } from '../../backend/test/helpers/database.ts';
import { seedSubmittedExerciseRecord } from '../../backend/test/helpers/exercise-review.ts';
import { TEST_PASSWORD } from '../../backend/test/helpers/test-environment.ts';

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
  const organization = await db.organization.findUniqueOrThrow({where:{id:fixture.organizationId}});
  const requested = await api('/auth/student-sign-in-codes', null, {
    organizationCode:organization.organizationCode,account:record.studentEmail,channel:'EMAIL',locale:'en',
  });
  assert.equal(requested.status,202);
  let code;
  for(let attempt=0;attempt<40&&!code;attempt++){
    const messages=await(await fetch('http://mailpit:8025/api/v1/messages?limit=100')).json();
    const message=messages.messages.find(item=>JSON.stringify(item.To).includes(record.studentEmail));
    if(message){const full=await(await fetch('http://mailpit:8025/api/v1/message/'+message.ID)).json();code=full.Text.match(/\b\d{6}\b/)?.[0];}
    if(!code)await new Promise(resolve=>setTimeout(resolve,500));
  }
  assert.ok(code);
  const signedIn=await api('/auth/student-sign-in-codes/verify',null,{challengeId:requested.data.challengeId,code,deviceId:randomUUID()});
  assert.equal(signedIn.status,200);
  const studentToken=signedIn.data.accessToken;
  await db.classSection.update({where:{id:fixture.teacherAActiveSectionId},data:{isEnrollmentOpen:true}});
  const invitation=await api(`/class-sections/${fixture.teacherAActiveSectionId}/course-invites`,teacher,{});assert.equal(invitation.status,201);
  const section = await db.classSection.findUniqueOrThrow({ where: { id: fixture.teacherAActiveSectionId } });
  const body = { expectedVersion: section.version, confirmationCourseName: section.displayName,
    confirmCourseRetirement: true, reason: 'Synthetic demand history retention regression' };
  const endpoint = `/class-sections/${section.id}/delete`;
  assert.equal((await api(endpoint, otherTeacher, body)).status, 403);
  pass('OTHER_TEACHER_CANNOT_RETIRE_COURSE');
  const key = randomUUID();
  const retired = await api(endpoint, teacher, body, key);
  assert.equal(retired.status, 201, retired.errorCode);
  assert.deepEqual((await api(endpoint, teacher, body, key)).data, retired.data);
  assert.equal(await db.exerciseRecord.count({ where: { id: record.recordId } }), 1);
  assert.equal(await db.exerciseSession.count({ where: { id: record.sessionId } }), 1);
  assert.equal(await db.user.count({ where: { id: record.studentUserId, status: 'ACTIVE', emailVerifiedAt: { not: null } } }), 1);
  assert.equal(await db.enrollment.count({ where: { classSectionId: section.id, status: 'ACTIVE' } }), 0);
  assert.equal(await db.enrollment.count({ where: { classSectionId: section.id, studentId: record.studentId, status: 'REMOVED' } }), 1);
  assert.ok((await db.classSection.findUniqueOrThrow({ where: { id: section.id } })).retiredAt);
  assert.equal(await db.courseInvite.count({where:{classSectionId:section.id,status:'ACTIVE'}}),0);
  assert.equal(await db.courseInvite.count({where:{classSectionId:section.id,status:'REVOKED',revokeReason:'COURSE_RETIRED'}}),1);
  pass('COURSE_RETIREMENT_PRESERVES_ACCOUNT_AND_HISTORY', { idempotent: true });
  assert.equal((await api(`/exercise-records/${record.recordId}`, studentToken)).status, 200);
  pass('STUDENT_CAN_READ_HISTORY_AFTER_COURSE_RETIREMENT');
  const student = await db.studentProfile.findUniqueOrThrow({ where: { id: record.studentId } });
  await db.v81AdminAccess.update({ where: { userId: fixture.adminUserId }, data: { kind: 'SUB', permissions: ['USER_ACCOUNTS'] } });
  const denied = await api(`/admin/students/${student.id}/delete`, admin, {
    expectedVersion: student.version, confirmationStudentNumber: student.studentNumber, reason: 'Synthetic forbidden student erasure',
  });
  assert.equal(denied.status, 403, denied.errorCode);
  assert.equal(await db.user.count({ where: { id: record.studentUserId } }), 1);
  pass('SUBADMIN_CANNOT_ERASE_STUDENT');
  await db.v81AdminAccess.update({ where: { userId: fixture.adminUserId }, data: { kind: 'SUPER', permissions: [] } });
  const profile = await db.teacherProfile.findUniqueOrThrow({ where: { id: fixture.teacherProfileId } });
  const deleted = await api(`/admin/teachers/${profile.id}/delete`, admin, {
    expectedVersion: profile.version, confirmationEmployeeNumber: profile.employeeNumber,
    confirmTeacherDeletion: true, reason: 'Synthetic teacher deletion retains student facts',
  });
  assert.equal(deleted.status, 201, deleted.errorCode);
  assert.equal(await db.user.count({ where: { id: fixture.teacherUserId } }), 0);
  assert.equal(await db.user.count({ where: { id: record.studentUserId, status: 'ACTIVE' } }), 1);
  assert.equal(await db.exerciseRecord.count({ where: { id: record.recordId } }), 1);
  assert.equal(await db.exerciseSession.count({ where: { id: record.sessionId } }), 1);
  assert.equal(await db.classSection.count({ where: { id: fixture.teacherBActiveSectionId, status: 'ACTIVE' } }), 1);
  pass('TEACHER_DELETION_PRESERVES_STUDENT_AND_OTHER_COURSES');
  assert.equal((await api(`/exercise-records/${record.recordId}`, studentToken)).status, 200);
  pass('STUDENT_CAN_READ_HISTORY_AFTER_TEACHER_DELETION');
  console.log(JSON.stringify({ check: 'DEMAND_HISTORY_HTTP_DATABASE', result: 'PASS', checks: evidence.length }));
} finally { await db.$disconnect(); }
