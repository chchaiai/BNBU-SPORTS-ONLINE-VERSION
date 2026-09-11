import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loginSyntheticStudent } from './v81-help-student-isolation-probe.mjs';

// Keep the existing entry point for local runners; deletion is deferred by user decision.
export async function probeDeletionChallenge({ prisma, fixture, request, baseUrl, teacherToken, adminToken }) {
  const member = await loginSyntheticStudent({ prisma, scope: fixture, request });
  const before = await prisma.user.findUniqueOrThrow({ where: { id: member.student.userId } });
  const key = randomUUID();
  const input = { expectedVersion: before.version, locale: 'zh-CN' };
  const post = token => fetch(baseUrl + '/me/account-deletion-challenges', { method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': key },
    body: JSON.stringify(input) });
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await post(member.token);
    assert.equal(response.status, 503);
    const result = await response.json();
    assert.equal(result.code, 'SYSTEM_SERVICE_UNAVAILABLE');
    assert.equal(result.details?.currentState, 'FEATURE_DEFERRED');
  }
  for (const token of [teacherToken, adminToken]) assert.equal((await post(token)).status, 403);
  assert.deepEqual(await prisma.user.findUniqueOrThrow({ where: { id: member.student.userId } }), before);
  const [count] = await prisma.$queryRaw`SELECT count(*)::int AS n FROM v81_account_deletion_challenges WHERE user_id=${member.student.userId}::uuid`;
  assert.equal(count.n, 0);
  assert.ok(await request('/me', member.token));
  console.log(JSON.stringify({ check: 'DELETION_DEFERRED_NO_CHALLENGE_NO_ACCOUNT_CHANGE_SESSION_REMAINS_VALID', result: 'PASS' }));
}
