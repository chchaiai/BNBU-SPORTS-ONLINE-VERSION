import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { seedExerciseSessionStudent } from '../../backend/test/helpers/exercise-session.ts';

export async function probeMakeupHttp({ prisma, fixture, request, baseUrl, teacherToken, adminToken, otherTeacherTokens, readMailboxJson = async url => (await fetch(url)).json() }) {
  const member = await seedExerciseSessionStudent(prisma, fixture, randomUUID().slice(0, 8).toUpperCase());
  const removed = await seedExerciseSessionStudent(prisma, fixture, randomUUID().slice(0, 8).toUpperCase(), 'REMOVED');
  const classId = fixture.teacherAActiveSectionId, path = `/class-sections/${classId}/makeup-windows`;
  await prisma.classSection.update({ where: { id: classId }, data: {
    dailyStartTime: new Date('1970-01-01T00:00:00Z'), dailyEndTime: new Date('1970-01-01T23:59:59Z') } });
  const template = await request('/rule-templates', adminToken, { displayName: 'Synthetic makeup template', expectedVersion: 0 });
  await request(`/class-sections/${classId}/v81-rules`, teacherToken, { templateId: template.id, minimumMinutes: 30, weeklyLimit: 3, courseTarget: 600, generalTarget: 600,
    regularDeadline: '2027-01-23T00:00:00Z', closingDeadline: '2027-01-30T00:00:00Z', settlementPlannedAt: '2027-01-30T01:00:00Z', publish: true, expectedVersion: 0 });
  const body = { enrollmentId: member.enrollmentId, expectedRuleVersion: 1, startsAt: '2027-01-24T00:00:00Z', endsAt: '2027-01-26T00:00:00Z' };
  const post = (route, data, key = randomUUID(), token = teacherToken) => fetch(baseUrl + route, { method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify(data) });
  assert.deepEqual((await request(path, teacherToken)).items, []);
  for (const [token, status] of [[adminToken, 403], ...otherTeacherTokens.map(({ token }) => [token, 404])]) {
    assert.equal((await post(path, body, randomUUID(), token)).status, status);
    assert.equal((await fetch(baseUrl + path, { headers: { authorization: `Bearer ${token}` } })).status, status);
  }
  for (const [data, status] of [[{ ...body, enrollmentId: removed.enrollmentId }, 409], [{ ...body, expectedRuleVersion: 2 }, 409],
    [{ ...body, startsAt: '2027-01-22T00:00:00Z' }, 422], [{ ...body, endsAt: '2027-01-31T00:00:00Z' }, 422],
    [{ ...body, startsAt: '2027-01-24' }, 422]]) assert.equal((await post(path, data)).status, status);
  const key = randomUUID(), first = await request(path, teacherToken, body, key);
  assert.equal(first.windowState, 'SCHEDULED'); assert.equal(first.version, 1); assert.equal(first.revocation, null);
  assert.deepEqual(await request(path, teacherToken, body, key), first);
  const second = await request(path, teacherToken, { ...body, startsAt: '2027-01-27T00:00:00Z', endsAt: '2027-01-28T00:00:00Z' });
  const page = await request(path + '?limit=1', teacherToken);
  assert.equal(page.items[0].id, second.id); assert.equal(page.nextBeforeId, second.id);
  const next = await request(path + '?limit=1&beforeId=' + page.nextBeforeId, teacherToken);
  assert.equal(next.items[0].id, first.id); assert.equal(next.nextBeforeId, null);
  const revokePath = `/makeup-windows/${first.id}/revocation`, revocation = { expectedVersion: 1, reason: 'Synthetic schedule cancellation' };
  for (const [token, status] of [[adminToken, 403], ...otherTeacherTokens.map(({ token }) => [token, 404])])
    assert.equal((await post(revokePath, revocation, randomUUID(), token)).status, status);
  const keys = [randomUUID(), randomUUID()], competing = await Promise.all(keys.map(key => post(revokePath, revocation, key)));
  assert.deepEqual(competing.map(response => response.status).sort(), [201, 409]);
  const winner = competing.findIndex(response => response.status === 201), revoked = (await competing[winner].json()).data;
  assert.equal(revoked.windowState, 'REVOKED'); assert.equal(revoked.version, 2); assert.equal(revoked.revocation.reason, revocation.reason);
  assert.deepEqual(await request(revokePath, teacherToken, revocation, keys[winner]), revoked);
  assert.equal((await request(path, teacherToken)).items.find(w => w.id === first.id).windowState, 'REVOKED');
  const events = await prisma.$queryRaw`SELECT event_type,version FROM v81_events WHERE resource_type='MAKEUP_WINDOW' AND resource_id=${first.id}::uuid ORDER BY version`;
  assert.deepEqual(events, [{ event_type: 'CREATED', version: 1 }, { event_type: 'REVOKED', version: 2 }]);
  assert.equal((await prisma.$queryRaw`SELECT id FROM v81_makeup_windows WHERE class_section_id=${classId}::uuid`).length, 2);
  console.log(JSON.stringify({ check: 'MAKEUP_HTTP_GRANT_SCOPE_RULE_BOUNDS_REPLAY_PAGINATION_CONCURRENT_REVOCATION_AUDIT', result: 'PASS', membersSeeded: true }));
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: fixture.organizationId } });
  const challenge = await request('/auth/student-sign-in-codes', null, { organizationCode: organization.organizationCode,
    account: member.email, channel: 'EMAIL', locale: 'en' });
  let code;
  for (let i = 0; i < 30 && !code; i++) {
    const messages = await readMailboxJson('http://mailpit:8025/api/v1/messages?limit=50');
    const message = messages.messages?.find(item => JSON.stringify(item.To ?? []).toLowerCase().includes(member.email));
    if (message) {
      const detail = await readMailboxJson(`http://mailpit:8025/api/v1/message/${encodeURIComponent(message.ID)}`);
      code = String(detail.Text ?? '').match(/(?:code is|验证码是)\s*(\d{4,10})/u)?.[1];
    }
    if (!code) await delay(500);
  }
  assert.ok(code, 'Synthetic student email code must arrive in local Mailpit');
  const login = await request('/auth/student-sign-in-codes/verify', null, { challengeId: challenge.challengeId, code, deviceId: randomUUID() });
  const ownPath = `/enrollments/${member.enrollmentId}/makeup-windows`;
  const own = await request(ownPath + '?limit=1', login.accessToken);
  assert.equal(own.enrollmentId, member.enrollmentId); assert.equal(own.classSectionId, classId);
  assert.equal(own.items[0].id, second.id); assert.equal(own.nextBeforeId, second.id);
  const ownNext = await request(ownPath + '?limit=1&beforeId=' + own.nextBeforeId, login.accessToken);
  assert.deepEqual(ownNext.items, [revoked]); assert.equal(ownNext.nextBeforeId, null);
  for (const [route, token, status] of [[ownPath, teacherToken, 403], [ownPath, adminToken, 403],
    [`/enrollments/${removed.enrollmentId}/makeup-windows`, login.accessToken, 404],
    [`/enrollments/${randomUUID()}/makeup-windows`, login.accessToken, 404], [ownPath + '?limit=101', login.accessToken, 422]]) {
    assert.equal((await fetch(baseUrl + route, { headers: { authorization: `Bearer ${token}` } })).status, status);
  }
  const enrollment = await prisma.enrollment.findUniqueOrThrow({ where: { id: member.enrollmentId }, include: { student: true } });
  const notifications = await prisma.notification.findMany({ where: { recipientUserId: enrollment.student.userId,
    targetId: member.enrollmentId, notificationType: { in: ['MAKEUP_WINDOW_GRANTED', 'MAKEUP_WINDOW_REVOKED'] } } });
  assert.equal(notifications.length, 3);
  assert.equal(notifications.filter(n => n.notificationType === 'MAKEUP_WINDOW_GRANTED').length, 2);
  const notice = notifications.find(n => n.notificationType === 'MAKEUP_WINDOW_REVOKED');
  assert.ok(notice.body.includes(revocation.reason)); assert.ok(notice.body.includes(organization.timezone));
  assert.ok(notifications.every(n => n.organizationId === fixture.organizationId && n.targetType === 'ENROLLMENT'));
  const inbox = await request('/notifications?limit=100', login.accessToken);
  assert.deepEqual(inbox.filter(n => n.notificationType.startsWith('MAKEUP_WINDOW_')).map(n => n.id).sort(), notifications.map(n => n.id).sort());
  const readKey = randomUUID();
  const read = await request(`/notifications/${notice.id}/read`, login.accessToken, {}, readKey);
  assert.ok(read.readAt);
  assert.deepEqual(await request(`/notifications/${notice.id}/read`, login.accessToken, {}, readKey), read);
  assert.ok(!(await request('/notifications?limit=100&unreadOnly=true', login.accessToken)).some(n => n.id === notice.id));
  console.log(JSON.stringify({ check: 'STUDENT_OWN_MAKEUP_OTP_SCOPE_PAGINATION_REVOCATION_NOTIFICATION_EXACTLY_ONCE', result: 'PASS', syntheticStudents: true }));
}
