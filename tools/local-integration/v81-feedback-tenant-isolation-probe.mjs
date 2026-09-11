import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { seedFoundationFixture } from '../../backend/test/helpers/database.ts';
import { TEST_PASSWORD } from '../../backend/test/helpers/test-environment.ts';
import { loginSyntheticStudent } from './v81-help-student-isolation-probe.mjs';

export async function probeFeedbackTenantIsolation({ prisma, fixture, request, baseUrl, adminToken }) {
  const outsider = await seedFoundationFixture(prisma, randomUUID().slice(0, 8).toUpperCase());
  await prisma.$executeRaw`INSERT INTO v81_admin_access(user_id,organization_id,kind)
    VALUES (${outsider.adminUserId}::uuid,${outsider.organizationId}::uuid,'SUPER')`;
  let login = await request('/auth/password-login', null, { account: outsider.adminEmail, password: TEST_PASSWORD });
  const security = await request('/auth/account-security', login.accessToken);
  const password = 'Synthetic-Changed-' + randomUUID();
  await request('/auth/own-password', login.accessToken, { currentPassword: TEST_PASSWORD,
    newPassword: password, confirmPassword: password, expectedVersion: security.version });
  login = await request('/auth/password-login', null, { account: outsider.adminEmail, password });
  const students = [];
  for (const scope of [fixture, outsider]) students.push(await loginSyntheticStudent({ prisma, scope, request }));
  const admins = [adminToken, login.accessToken];
  const feedbacks = [];
  for (const [index, member] of students.entries()) {
    feedbacks.push(await request('/feedback', member.token,
      { category: 'PRIVACY', content: `Synthetic private tenant feedback ${index} ${randomUUID()}` }));
  }
  for (const [index, feedback] of feedbacks.entries()) {
    const other = 1 - index;
    const before = await request(`/admin/feedback/${feedback.id}`, admins[index]);
    const notificationsBefore = await prisma.notification.count({ where: { targetId: feedback.id } });
    const body = { status: 'RESOLVED', publicReply: 'Synthetic resolution', expectedVersion: before.version };
    const deniedRequests = [
      [`/feedback/${feedback.id}`, students[other].token],
      [`/student/feedback/${feedback.id}/history`, students[other].token],
      [`/admin/feedback/${feedback.id}`, admins[other]],
      [`/admin/feedback/${feedback.id}/handling`, admins[other], body],
    ];
    for (const [path, token, input] of deniedRequests) {
      const response = await fetch(baseUrl + path, { method: input ? 'POST' : 'GET', headers: {
        authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': randomUUID(),
      }, ...(input ? { body: JSON.stringify(input) } : {}) });
      assert.equal(response.status, 404, path);
      const value = JSON.stringify(await response.json());
      assert.ok(!value.includes(before.content) && !value.includes(students[index].student.email));
    }
    assert.deepEqual(await request(`/admin/feedback/${feedback.id}`, admins[index]), before);
    assert.equal(await prisma.notification.count({ where: { targetId: feedback.id } }), notificationsBefore);
    for (const search of [feedback.id, students[index].student.email, before.content]) {
      const page = await request(`/admin/feedback?search=${encodeURIComponent(search)}`, admins[other]);
      assert.equal(page.total, 0);
      assert.deepEqual(page.items, []);
      assert.equal(page.summary.total, 1);
    }
    const changed = await request(`/admin/feedback/${feedback.id}/handling`, admins[index], body);
    assert.equal(changed.version, before.version + 1);
    const own = await request(`/student/feedback/${feedback.id}/history`, students[index].token);
    assert.equal(own.items.length, 1);
    assert.equal(own.items[0].publicReply, body.publicReply);
    const otherNotifications = await request('/notifications?limit=100', students[other].token);
    assert.ok(otherNotifications.every(item => item.targetId !== feedback.id));
    const ownNotifications = await request('/notifications?limit=100', students[index].token);
    assert.equal(ownNotifications.filter(item => item.targetId === feedback.id).length, 1);
  }
  console.log(JSON.stringify({ check: 'FEEDBACK_BIDIRECTIONAL_TENANT_READ_WRITE_SEARCH_HISTORY_NOTIFICATION_ISOLATION',
    result: 'PASS', organizations: 2, rejectedCrossTenantRequests: 8 }));
}
