import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { seedFoundationFixture } from '../../backend/test/helpers/database.ts';
import { seedExerciseSessionStudent } from '../../backend/test/helpers/exercise-session.ts';

// Independent help visibility scenario: no exercise publication or failed legacy fixture is changed.
export async function loginSyntheticStudent({ prisma, scope, request }) {
    const student = await seedExerciseSessionStudent(prisma, scope, randomUUID().slice(0, 8).toUpperCase());
    const organization = await prisma.organization.findUniqueOrThrow({ where: { id: scope.organizationId } });
    const challenge = await request('/auth/student-sign-in-codes', null, {
      organizationCode: organization.organizationCode, account: student.email, channel: 'EMAIL', locale: 'en',
    });
    let code;
    for (let attempt = 0; attempt < 30 && !code; attempt++) {
      const messages = await (await fetch('http://mailpit:8025/api/v1/messages?limit=50')).json();
      const message = messages.messages?.find(item => JSON.stringify(item.To ?? []).toLowerCase().includes(student.email));
      if (message) {
        const detail = await (await fetch(`http://mailpit:8025/api/v1/message/${encodeURIComponent(message.ID)}`)).json();
        code = String(detail.Text ?? '').match(/(?:code is|验证码是)\s*(\d{4,10})/u)?.[1];
      }
      if (!code) await delay(500);
    }
    assert.ok(code, 'Synthetic student sign-in email received');
    const login = await request('/auth/student-sign-in-codes/verify', null, {
      challengeId: challenge.challengeId, code, deviceId: randomUUID(),
    });
    return { token: login.accessToken, student };
}

export async function probeHelpStudentIsolation({ prisma, fixture, request, baseUrl, adminToken }) {
  const outsider = await seedFoundationFixture(prisma, randomUUID().slice(0, 8).toUpperCase());
  const tokens = [];
  for (const scope of [fixture, outsider]) {
    tokens.push((await loginSyntheticStudent({ prisma, scope, request })).token);
  }
  const content = { titleZh: '隔离测试帮助', titleEn: 'Synthetic isolation help',
    bodyZh: '仅本组织可见', bodyEn: 'Visible within this organization', keywords: ['isolation'],
    category: 'checkin', sortWeight: 0, status: 'draft', expectedVersion: 0 };
  let article = await request('/admin/help-articles', adminToken, content);
  for (const status of ['published', 'archived', 'published']) {
    article = await request(`/admin/help-articles/${article.id}`, adminToken,
      { ...content, status, expectedVersion: article.version });
    for (const locale of ['en', 'zh-CN']) {
      const path = `/student/help-articles?locale=${locale}`;
      const own = await request(path, tokens[0]);
      assert.equal(own.some(item => item.id === article.id), status === 'published');
      assert.deepEqual(await request(path, tokens[1]), []);
      for (const [index, expected] of [[0, status === 'published' ? 200 : 404], [1, 404]]) {
        const response = await fetch(`${baseUrl}/student/help-articles/${article.id}?locale=${locale}`,
          { headers: { authorization: `Bearer ${tokens[index]}` } });
        assert.equal(response.status, expected);
        const serialized = JSON.stringify(await response.json());
        if (expected === 404) {
          assert.ok(!serialized.includes(content.titleEn) && !serialized.includes(content.titleZh));
          assert.ok(!serialized.includes(content.bodyEn) && !serialized.includes(content.bodyZh));
        }
      }
    }
  }
  assert.equal((await request(`/admin/help-articles/${article.id}`, adminToken)).version, 4);
  console.log(JSON.stringify({ check: 'HELP_STUDENT_TWO_ORGANIZATIONS_SMTP_LOGIN_BILINGUAL_PUBLICATION_ISOLATION',
    result: 'PASS', organizations: 2, publicationTransitions: 3, locales: 2 }));
}
