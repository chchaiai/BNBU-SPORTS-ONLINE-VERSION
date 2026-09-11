import assert from 'node:assert/strict';
import test from 'node:test';
import { listSubadminAccounts, toSubadminPermissions, toSubadminRoutes, requestSubadminIdentity, verifySubadminIdentity, createSubadminAccount } from '../app/subadmin-api.ts';

test('subadmin list follows server pagination, rejects loops and propagates permission denial', async () => {
  const previousFetch = globalThis.fetch, previousWindow = globalThis.window;
  globalThis.window = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  const calls = [];
  try {
    globalThis.fetch = async url => {
      calls.push(String(url));
      return Response.json({ data: calls.length === 1
        ? { items: [{ id: 'first' }], nextCursor: 'next' }
        : { items: [{ id: 'second' }], nextCursor: null }, meta: {} });
    };
    assert.deepEqual(await listSubadminAccounts(), [{ id: 'first' }, { id: 'second' }]);
    assert.deepEqual(calls, ['/api/v1/admin/subadmins', '/api/v1/admin/subadmins?after=next']);
    globalThis.fetch = async () => Response.json({ data: { items: [], nextCursor: 'repeated' }, meta: {} });
    await assert.rejects(listSubadminAccounts(), /SUBADMIN_CURSOR_REPEATED/);
    globalThis.fetch = async () => Response.json({ code: 'PERMISSION_RESOURCE_SCOPE_DENIED', message: 'Denied' }, { status: 403 });
    await assert.rejects(listSubadminAccounts(), error => error.status === 403);
    globalThis.fetch = async (url, options) => {
      assert.equal(url, '/api/v1/admin/subadmin-identity-challenges');
      assert.equal(new Headers(options.headers).get('Idempotency-Key'), 'otp-request-key');
      assert.deepEqual(JSON.parse(options.body), { email: 'synthetic@example.invalid', locale: 'zh-CN' });
      return Response.json({ data: { status: 'ACTIVE' }, meta: {} });
    };
    await requestSubadminIdentity('synthetic@example.invalid', 'zh', 'otp-request-key');
    globalThis.fetch = async (url, options) => {
      assert.equal(url, '/api/v1/admin/subadmin-identity-challenges/challenge/verify');
      assert.equal(new Headers(options.headers).get('Idempotency-Key'), 'verify-key');
      assert.deepEqual(JSON.parse(options.body), { code: '123456', expectedVersion: 3 });
      return Response.json({ data: { status: 'VERIFIED' }, meta: {} });
    };
    await verifySubadminIdentity({ id: 'challenge', version: 3 }, '123456', 'verify-key');
    globalThis.fetch = async (url, options) => {
      assert.equal(url, '/api/v1/admin/subadmins');
      assert.equal(new Headers(options.headers).get('Idempotency-Key'), 'create-key');
      const body = JSON.parse(options.body);
      assert.deepEqual(body.permissions, ['AUDIT_QUERY']);
      assert.equal(body.identityChallengeId, 'challenge');
      assert.equal(body.initialPassword, 'synthetic-password');
      assert.ok(!Object.hasOwn(body, 'email'));
      return Response.json({ data: { id: 'created' }, meta: {} });
    };
    await createSubadminAccount({ identityChallengeId: 'challenge', account: 'synthetic', name: 'Test',
      department: '', permissions: ['audit'], initialPassword: 'synthetic-password', confirmPassword: 'synthetic-password' }, 'create-key');
    assert.deepEqual(toSubadminPermissions(['subadmins', 'audit', 'courses']), ['COURSE_VIEW', 'AUDIT_QUERY']);
    assert.deepEqual(toSubadminRoutes(['AUDIT_QUERY']), ['audit']);
  } finally { globalThis.fetch = previousFetch; globalThis.window = previousWindow; }
});
