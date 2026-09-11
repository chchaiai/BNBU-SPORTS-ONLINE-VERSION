import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const { hash, argon2id } = createRequire(new URL('../../backend/package.json', import.meta.url))('argon2');

export async function probeSubadminPermissions({ prisma, fixture, request, baseUrl, adminToken, teacherToken }) {
  const id = randomUUID(), email = `synthetic-sub-${id}@example.test`, password = `Synthetic-Initial-${randomUUID()}`, now = new Date();
  await prisma.user.create({ data: { id, organizationId: fixture.organizationId, role: 'ADMIN', status: 'ACTIVE',
    primaryEmail: email, primaryEmailNormalized: email, emailVerifiedAt: now, passwordHash: await hash(password, { type: argon2id }), createdAt: now, updatedAt: now } });
  await prisma.adminProfile.create({ data: { id: randomUUID(), organizationId: fixture.organizationId, userId: id,
    employeeNumber: 'SYNTH-' + id.slice(0, 8).toUpperCase(), fullName: 'Synthetic permission administrator', departmentName: 'Synthetic office', status: 'ACTIVE', createdAt: now, updatedAt: now } });
  await prisma.$executeRaw`INSERT INTO v81_admin_access(user_id,organization_id,kind,permissions) VALUES(${id}::uuid,${fixture.organizationId}::uuid,'SUB','["AUDIT_QUERY"]'::jsonb)`;
  const account = `synthetic-sub-${id}`;
  await prisma.$executeRaw`INSERT INTO v81_account_security(user_id,organization_id,login_account)
    VALUES(${id}::uuid,${fixture.organizationId}::uuid,${account})`;
  const login = await request('/auth/password-login', null, { account, password });
  const security = await request('/auth/account-security', login.accessToken);
  const changedPassword = 'Synthetic-Changed-' + randomUUID();
  await request('/auth/own-password', login.accessToken, { currentPassword: password, newPassword: changedPassword, confirmPassword: changedPassword, expectedVersion: security.version });
  const session = await request('/auth/password-login', null, { account, password: changedPassword });
  const path = `/admin/subadmins/${id}/permissions`;
  const raw = (route, token, body) => fetch(baseUrl + route, { method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': randomUUID() },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const [initial] = await prisma.$queryRaw`SELECT version FROM v81_admin_access WHERE user_id=${id}::uuid`;
  const body = { expectedVersion: initial.version, permissions: ['COURSE_VIEW'] }, key = randomUUID();
  const changed = await request(path, adminToken, body, key);
  assert.deepEqual(changed.permissions, ['COURSE_VIEW']);
  assert.deepEqual(await request(path, adminToken, body, key), changed);
  assert.equal((await raw('/admin/audit-events', session.accessToken)).status, 403);
  assert.equal((await raw(path, session.accessToken, { expectedVersion: changed.version, permissions: ['AUDIT_QUERY'] })).status, 403);
  assert.equal((await raw(path, teacherToken, body)).status, 403);
  assert.equal((await raw(path, adminToken, body)).status, 409);
  for (const permissions of [['SUPER'], ['COURSE_VIEW', 'COURSE_VIEW']])
    assert.equal((await raw(path, adminToken, { expectedVersion: changed.version, permissions })).status, 422);
  assert.equal((await raw(path, adminToken, { expectedVersion: changed.version, permissions: ['AUDIT_QUERY'], password: 'FORBIDDEN' })).status, 422);
  assert.equal((await raw(`/admin/subadmins/${fixture.adminUserId}/permissions`, adminToken, body)).status, 404);
  const restored = await request(path, adminToken, { expectedVersion: changed.version, permissions: ['AUDIT_QUERY'] });
  assert.equal((await raw('/admin/audit-events', session.accessToken)).status, 200);
  const concurrent = await Promise.all([['COURSE_VIEW'], ['HELP_CENTER']].map(permissions => raw(path, adminToken, { expectedVersion: restored.version, permissions })));
  assert.deepEqual(concurrent.map(r => r.status).sort(), [201, 409]);
  const winner = (await concurrent.find(r => r.status === 201).json()).data;
  const revoked = await request(path, adminToken, { expectedVersion: winner.version, permissions: [] });
  assert.deepEqual(revoked.permissions, []);
  assert.equal((await raw('/admin/audit-events', session.accessToken)).status, 403);
  const events = await prisma.$queryRaw`SELECT version,facts FROM v81_events WHERE resource_type='SUBADMIN' AND resource_id=${id}::uuid AND event_type='PERMISSIONS_CHANGED' ORDER BY version`;
  assert.equal(events.length, 4);
  assert.deepEqual(events.map(e => e.version), [initial.version + 1, initial.version + 2, initial.version + 3, initial.version + 4]);
  assert.ok(!JSON.stringify(events).includes(password));
  const user = await prisma.user.findUniqueOrThrow({ where: { id } });
  assert.equal(user.primaryEmail, email);
  assert.equal(user.status, 'ACTIVE');
  const routes = {
    COURSE_VIEW: '/admin/course-directory',
    SEMESTER_MANAGE: '/admin/semesters',
    USER_ACCOUNTS: '/admin/teacher-accounts',
    STUDENT_FEEDBACK: '/admin/feedback',
    GLOBAL_RULES: '/admin/endurance-tables',
    SYSTEM_MODE: '/system-mode/history',
    HELP_CENTER: '/admin/help-articles',
    AUDIT_QUERY: '/admin/audit-events',
  };
  let version = revoked.version;
  for (const permission of Object.keys(routes)) {
    const grant = await request(path, adminToken, { expectedVersion: version, permissions: [permission] });
    version = grant.version;
    for (const [required, route] of Object.entries(routes)) {
      const response = await raw(route, session.accessToken);
      assert.equal(response.status, required === permission ? 200 : 403, `${permission} accessing ${route}`);
    }
    const mode = await request('/system-mode', session.accessToken);
    assert.equal(mode.mode, 'NORMAL');
    const maintenance = { mode: 'MAINTENANCE', expectedVersion: mode.policyVersion,
      reason: 'Synthetic permission verification', titleZh: '测试维护', titleEn: 'Synthetic maintenance',
      bodyZh: '合成权限测试', bodyEn: 'Synthetic permission test', estimatedRecoveryAt: new Date(Date.now() + 3600000).toISOString() };
    const transition = await raw('/system-mode/changes', session.accessToken, maintenance);
    assert.equal(transition.status, permission === 'SYSTEM_MODE' ? 201 : 403, `${permission} changing system mode`);
    if (permission === 'SYSTEM_MODE') {
      const changedMode = (await transition.json()).data;
      const restoredMode = await request('/system-mode/changes', session.accessToken, {
        mode: 'NORMAL', reason: 'Synthetic permission verification completed', expectedVersion: changedMode.policyVersion,
      });
      assert.equal(restoredMode.mode, 'NORMAL');
    }
    assert.equal((await raw('/admin/subadmins', session.accessToken)).status, 403, `${permission} accessing superadmin management`);
  }
  await request(path, adminToken, { expectedVersion: version, permissions: [] });
  for (const route of Object.values(routes)) assert.equal((await raw(route, session.accessToken)).status, 403, `revoked ${route}`);
  console.log(JSON.stringify({ check: 'SUBADMIN_EIGHT_SINGLE_PERMISSION_MATRIX_AND_SYSTEM_MODE_WRITE', result: 'PASS', readChecks: 64, revokedReadChecks: 8, syntheticIdentity: true }));
  console.log(JSON.stringify({ check: 'SUBADMIN_PERMISSION_UPDATE_REPLAY_CONCURRENT_REVOKE_CURRENT_SESSION_NO_ESCALATION', result: 'PASS', syntheticIdentity: true }));
}
