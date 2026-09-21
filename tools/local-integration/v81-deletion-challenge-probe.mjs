import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loginSyntheticStudent } from './v81-help-student-isolation-probe.mjs';

// Synthetic student self-service deletion using the local SMTP capture.
export async function probeDeletionChallenge({ prisma, fixture, request, baseUrl, teacherToken, adminToken }) {
  const member = await loginSyntheticStudent({ prisma, scope: fixture, request });
  const before = await prisma.user.findUniqueOrThrow({ where: { id: member.student.userId } });
  const key = randomUUID();
  const input = { expectedVersion: before.version, locale: 'zh-CN' };
  const post = token => fetch(baseUrl + '/me/account-deletion-challenges', { method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': key },
    body: JSON.stringify(input) });
  const response = await post(member.token);
  assert.equal(response.status, 201);
  const challenge = (await response.json()).data;
  assert.deepEqual((await (await post(member.token)).json()).data, challenge);
  for (const token of [teacherToken, adminToken]) assert.equal((await post(token)).status, 403);
  const messages = await (await fetch('http://mailpit:8025/api/v1/messages?limit=100')).json();
  const message = messages.messages.find(item => JSON.stringify(item.To).includes(member.student.email));
  assert.ok(message);
  const detail = await (await fetch(`http://mailpit:8025/api/v1/message/${message.ID}`)).json();
  const verificationCode = String(detail.Text).match(/(?:code is|验证码是)\s*(\d{6})/u)?.[1];
  assert.ok(verificationCode);
  const result = await request(`/me/account-deletion-challenges/${challenge.challengeId}/confirm`, member.token,
    {expectedVersion:challenge.version,verificationCode});
  assert.equal(result.status, 'DELETED');
  assert.equal(await prisma.user.count({where:{id:member.student.userId}}),0);
  const expired = await fetch(baseUrl+'/me',{headers:{authorization:`Bearer ${member.token}`}});
  assert.equal(expired.status,401);
  console.log(JSON.stringify({check:'STUDENT_SELF_DELETION_SMTP_ACCOUNT_ERASED_SESSION_REVOKED',result:'PASS'}));
}
