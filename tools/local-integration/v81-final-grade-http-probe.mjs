import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { seedExerciseSessionStudent } from '../../backend/test/helpers/exercise-session.ts';

export async function probeFinalGradeHttp({ prisma, fixture, request, baseUrl, adminToken, teacherToken, otherTeacherTokens }) {
  const student = await seedExerciseSessionStudent(prisma, fixture, randomUUID().slice(0, 8).toUpperCase());
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: fixture.organizationId } });
  const challenge = await request('/auth/student-sign-in-codes', null, { organizationCode: organization.organizationCode,
    account: student.email, channel: 'EMAIL', locale: 'en' });
  let code;
  for (let i = 0; i < 30 && !code; i++) {
    const messages = await (await fetch('http://mailpit:8025/api/v1/messages?limit=50')).json();
    const message = messages.messages?.find(item => JSON.stringify(item.To ?? []).toLowerCase().includes(student.email));
    if (message) {
      const detail = await (await fetch(`http://mailpit:8025/api/v1/message/${encodeURIComponent(message.ID)}`)).json();
      code = String(detail.Text ?? '').match(/(?:code is|验证码是)\s*(\d{4,10})/u)?.[1];
    }
    if (!code) await delay(500);
  }
  assert.ok(code, 'Synthetic student email must arrive in local Mailpit');
  const login = await request('/auth/student-sign-in-codes/verify', null, { challengeId: challenge.challengeId, code, deviceId: randomUUID() });
  const path = `/enrollments/${student.enrollmentId}/final-grades`;
  const post = (body, token = teacherToken, key = randomUUID()) => fetch(baseUrl + path, { method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify(body) });
  assert.deepEqual((await request(path, teacherToken)).items, []);
  const notificationsBefore = await request('/notifications?limit=100', login.accessToken);
  const firstBody = { finalGrade: -2147483648, published: false, expectedVersion: 0 }, firstKey = randomUUID();
  const first = await request(path, teacherToken, firstBody, firstKey);
  assert.equal(first.finalGrade, -2147483648); assert.equal(first.version, 1);
  assert.deepEqual(await request(path, teacherToken, firstBody, firstKey), first);
  const second = await request(path, teacherToken, { finalGrade: 2147483647, published: true, expectedVersion: 1 });
  assert.equal(second.finalGrade, 2147483647); assert.equal(second.published, true);
  const third = await request(path, teacherToken, { finalGrade: -1, published: true, expectedVersion: 2 });
  assert.equal(third.finalGrade, -1);
  const bodies = [123, 456].map(finalGrade => ({ finalGrade, published: true, expectedVersion: 3 }));
  const keys = bodies.map(() => randomUUID());
  const competing = await Promise.all(bodies.map((body, i) => post(body, teacherToken, keys[i])));
  assert.deepEqual(competing.map(r => r.status).sort(), [201, 409]);
  const winner = competing.findIndex(r => r.status === 201), fourth = (await competing[winner].json()).data;
  assert.equal(fourth.version, 4); assert.deepEqual(await request(path, teacherToken, bodies[winner], keys[winner]), fourth);
  const page = await request(path + '?limit=2', teacherToken);
  assert.deepEqual(page.items.map(r => r.version), [4, 3]); assert.equal(page.nextBeforeVersion, 3);
  const next = await request(path + '?limit=2&beforeVersion=3', teacherToken);
  assert.deepEqual(next.items, [second, first]); assert.equal(next.nextBeforeVersion, null);
  for (const invalid of [{ finalGrade: 2147483648 }, { finalGrade: -2147483649 }, { finalGrade: 1.25 }, { finalGrade: '123' },
    { note: 'Forbidden grade note' }, { remark: 'Forbidden alternate note' }, { reason: 'Forbidden hidden note' }, { published: 'true' }]) {
    assert.equal((await post({ finalGrade: 100, published: true, expectedVersion: 4, ...invalid })).status, 422);
  }
  for (const [token, status] of [[login.accessToken, 403], [adminToken, 403], ...otherTeacherTokens.map(t => [t.token, 404])]) {
    assert.equal((await fetch(baseUrl + path, { headers: { authorization: `Bearer ${token}` } })).status, status);
    assert.equal((await post({ finalGrade: 99, published: true, expectedVersion: 4 }, token)).status, status);
  }
  assert.deepEqual(await request('/notifications?limit=100', login.accessToken), notificationsBefore);
  const history = await request(path, teacherToken);
  assert.equal(history.items.length, 4);
  assert.ok(history.items.every(r => Object.keys(r).sort().join(',') === 'createdAt,enrollmentId,finalGrade,published,version'));
  const events = await prisma.$queryRaw`SELECT event_type,version,facts,actor_id FROM v81_events WHERE organization_id=${fixture.organizationId}::uuid
    AND resource_type='FINAL_GRADE' AND resource_id=${student.enrollmentId}::uuid ORDER BY version`;
  assert.deepEqual(events.map(e => e.version), [1, 2, 3, 4]);
  assert.deepEqual(events.map(e => e.event_type), ['DRAFT_SAVED', 'PUBLISHED', 'PUBLISHED', 'PUBLISHED']);
  assert.ok(events.every(e => e.actor_id === fixture.teacherUserId && !Object.hasOwn(e.facts, 'finalGrade')));
  await assert.rejects(prisma.$executeRaw`UPDATE v81_final_grade_revisions SET final_grade=0 WHERE enrollment_id=${student.enrollmentId}::uuid`);
  await assert.rejects(prisma.$executeRaw`DELETE FROM v81_final_grade_revisions WHERE enrollment_id=${student.enrollmentId}::uuid`);
  await assert.rejects(prisma.$executeRaw`INSERT INTO v81_final_grade_revisions(enrollment_id,organization_id,version,final_grade,published,actor_id,created_at)
    VALUES(${student.enrollmentId}::uuid,${fixture.organizationId}::uuid,5,1,true,${fixture.teacherBUserId}::uuid,${new Date()})`);
  assert.deepEqual(await request(path, teacherToken), history);
  console.log(JSON.stringify({ check: 'FINAL_GRADE_REAL_HTTP_INT32_HISTORY_PUBLISH_CONCURRENT_REPLAY_NO_NOTES_STUDENT_ISOLATION_IMMUTABLE', result: 'PASS', syntheticStudent: true, settlementNotValidated: true }));
  if (process.env.V81_COMPOSITE_GRADES === '1') {
    const { probeCompositeGrades } = await import('./v81-composite-grade-probe.mjs');
    await probeCompositeGrades({ prisma, fixture, request, baseUrl, teacherToken, adminToken, student, studentToken: login.accessToken });
  }
}
