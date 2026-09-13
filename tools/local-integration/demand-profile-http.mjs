import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createTestPrisma, seedFoundationFixture } from '../../backend/test/helpers/database.ts';
import { TEST_PASSWORD } from '../../backend/test/helpers/test-environment.ts';

const database = new URL('postgresql://sql-postgres:5432/v81_browser_test');
database.username = process.env.PGUSER; database.password = process.env.PGPASSWORD;
const db = createTestPrisma(database.href), base = 'http://127.0.0.1:3199/api/v1';
async function api(path, token, body, headers = {}) {
  const response = await fetch(base + path, { method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID(),
      ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await response.json();
  return { status: response.status, data: value.data, errorCode: value.error?.code };
}
const pass = check => console.log(JSON.stringify({ check, result: 'PASS' }));
try {
  assert.equal((await db.$queryRaw`SELECT current_database() AS name`)[0].name, 'v81_browser_test');
  const fixture = await seedFoundationFixture(db, `PROFILE-${randomUUID().slice(0, 6).toUpperCase()}`);
  await db.classSection.update({ where: { id: fixture.teacherAActiveSectionId }, data: { isEnrollmentOpen: true } });
  await db.v81AccountSecurity.create({ data: { userId: fixture.teacherUserId, organizationId: fixture.organizationId,
    mustChangePassword: false, passwordChangedAt: new Date() } });
  const teacherLogin = await api('/auth/password-login', null, { account: fixture.teacherEmail, password: TEST_PASSWORD });
  assert.equal(teacherLogin.status, 200, teacherLogin.errorCode);
  const teacher = teacherLogin.data.accessToken;
  async function invite(sectionId) {
    const result = await api(`/class-sections/${sectionId}/course-invites`, teacher, {});
    assert.equal(result.status, 201, result.errorCode);
    return result.data.inviteToken;
  }
  const firstInvite = await invite(fixture.teacherAActiveSectionId);
  const identity = { fullName: 'Synthetic Permanent Student', studentNumber: `P-${randomUUID().slice(0, 8).toUpperCase()}`,
    gender: 'FEMALE', gradeYear: 2026, collegeName: 'Synthetic College', majorName: 'Computing', dateOfBirth: '2004-02-29', regionCode: 'HK' };
  async function join(token, memberToken) {
    const capability = await api(`/course-invites/${token}/join-capabilities${memberToken ? '/member' : ''}`, memberToken, identity);
    assert.equal(capability.status, 201, capability.errorCode);
    const result = await api(`/course-invites/${token}/join`, null, {}, { 'x-join-capability': capability.data.joinCapability });
    assert.equal(result.status, 201, result.errorCode);
    return result.data;
  }
  const first = await join(firstInvite);
  let studentToken = first.authSession.accessToken;
  let me = (await api('/me', studentToken)).data;
  assert.equal(me.studentProfile.collegeName, identity.collegeName);
  assert.equal(me.studentProfile.majorName, identity.majorName);
  assert.equal(me.studentProfile.dateOfBirth, identity.dateOfBirth);
  assert.equal(me.studentProfile.regionCode, identity.regionCode);
  pass('NEW_STUDENT_PROFILE_PERSISTED');
  const email = `demand-${randomUUID().slice(0, 8)}@mail.bnbu.edu.cn`;
  const challenge = await api('/me/email-verification-challenges', studentToken, { email, locale: 'en', expectedVersion: me.user.version });
  assert.equal(challenge.status, 202, challenge.errorCode);
  assert.equal(challenge.data.mode, 'FIRST_BIND');
  let code;
  for (let attempt = 0; attempt < 30 && !code; attempt++) {
    const messages = await (await fetch('http://mailpit:8025/api/v1/messages?limit=100')).json();
    for (const message of messages.messages) {
      if (!JSON.stringify(message.To).toLowerCase().includes(email)) continue;
      const content = await (await fetch(`http://mailpit:8025/api/v1/message/${message.ID}`)).json();
      code = content.Text.match(/\b\d{6}\b/)?.[0];
    }
    if (!code) await delay(1000);
  }
  assert.ok(code, 'local Mailpit verification code delivered');
  const bound = await api(`/me/email-verification-challenges/${challenge.data.challengeId}/verify`, studentToken, { newEmailCode: code });
  assert.equal(bound.status, 200, bound.errorCode);
  me = (await api('/me', studentToken)).data;
  assert.equal(me.user.emailVerified, true);
  pass('FIRST_EMAIL_BINDING_REAL_SMTP');
  const removed = await api(`/enrollments/${first.enrollment.id}/remove`, teacher, {
    expectedVersion: first.enrollment.version, reason: 'Synthetic semester transition',
  });
  assert.equal(removed.status, 200, removed.errorCode);
  const verifiedAt = (await db.user.findUniqueOrThrow({ where: { id: first.studentProfile.userId } })).emailVerifiedAt;
  // Prepare the next CURRENT semester as isolated test data; all joins use real HTTP.
  const nextSemesterId = randomUUID(), nextSectionId = randomUUID();
  await db.$transaction(async tx => {
    await tx.semester.update({ where: { id: fixture.semesterId }, data: { status: 'ARCHIVED' } });
    const previous = await tx.semester.findUniqueOrThrow({ where: { id: fixture.semesterId } });
    await tx.semester.create({ data: { ...previous, id: nextSemesterId, termCode: 'SECOND',
      displayName: 'Synthetic next semester', status: 'CURRENT', version: 1 } });
    const section = await tx.classSection.findUniqueOrThrow({ where: { id: fixture.teacherAActiveSectionId } });
    await tx.classSection.create({ data: { ...section, id: nextSectionId, semesterId: nextSemesterId,
      classCode: `N${randomUUID().slice(0,8).toUpperCase()}`, displayName: 'Synthetic next course', version: 1 } });
  });
  const nextInvite = await invite(nextSectionId);
  assert.equal((await api(`/course-invites/${nextInvite}/join-capabilities`, null, identity)).status, 401);
  pass('PUBLIC_IDENTITY_CANNOT_OPEN_VERIFIED_ACCOUNT');
  const beforeChallenges = await db.emailVerificationChallenge.count({ where: { userId: first.studentProfile.userId } });
  const next = await join(nextInvite, studentToken);
  assert.equal(next.studentProfile.id, first.studentProfile.id);
  assert.equal(next.studentProfile.userId, first.studentProfile.userId);
  studentToken = next.authSession.accessToken;
  me = (await api('/me', studentToken)).data;
  assert.equal(me.user.emailVerified, true);
  for (const field of ['collegeName','majorName','dateOfBirth','regionCode']) assert.equal(me.studentProfile[field], identity[field]);
  const persisted = await db.user.findUniqueOrThrow({ where: { id: first.studentProfile.userId } });
  assert.equal(persisted.emailVerifiedAt.toISOString(), verifiedAt.toISOString());
  assert.equal(await db.emailVerificationChallenge.count({ where: { userId: persisted.id } }), beforeChallenges);
  assert.equal(await db.enrollment.count({ where: { studentId: first.studentProfile.id } }), 2);
  pass('CROSS_SEMESTER_SAME_ACCOUNT_PROFILE_EMAIL_NO_REBIND');
} finally { await db.$disconnect(); }
