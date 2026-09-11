import assert from 'node:assert/strict';
import test from 'node:test';
import { formatLocalRecoveryTime } from '../../BNBU-Sports-Web-new/frontend/student/js/local-time.js';

test('recovery instants use local time and invalid values never leak', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'Asia/Shanghai';
    assert.equal(formatLocalRecoveryTime('2026-09-11T14:14:00.000Z'), '2026年9月11日22点14分');
    process.env.TZ = 'America/New_York';
    assert.equal(formatLocalRecoveryTime('2026-09-11T14:14:00.000Z'), '2026年9月11日10点14分');
    assert.equal(formatLocalRecoveryTime('invalid'), null);
    assert.equal(formatLocalRecoveryTime(null), null);
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});

test('student starts a fresh refresh intent after definitive maintenance rejection', async () => {
  const api = await import('../../BNBU-Sports-Web-new/frontend/student/js/api.js');
  const original = globalThis.fetch, keys = [];
  let refreshed = false;
  api.storeAuthSession({ sessionId: 'synthetic-session', accessToken: 'old', refreshToken: 'synthetic-token', accessTokenExpiresAt: '2099-01-01T00:00:00Z', user: { id: 'synthetic-user' } });
  try {
    globalThis.fetch = async (url, init) => {
      if (String(url).endsWith('/auth/refresh')) {
        keys.push(init.headers['Idempotency-Key']);
        if (keys.length === 1) return Response.json({ code: 'SYSTEM_MAINTENANCE' }, { status: 503 });
        refreshed = true;
        return Response.json({ data: { sessionId: 'synthetic-session', accessToken: 'new', refreshToken: 'new-refresh', accessTokenExpiresAt: '2099-01-01T00:00:00Z', user: { id: 'synthetic-user' } } });
      }
      return refreshed ? Response.json({ data: { ok: true } }) : Response.json({ code: 'AUTH_TOKEN_EXPIRED' }, { status: 401 });
    };
    await assert.rejects(api.request('/student/progress'), error => error.code === 'SYSTEM_MAINTENANCE');
    assert.deepEqual(await api.request('/student/progress'), { ok: true });
    assert.equal(keys.length, 2);
    assert.notEqual(keys[0], keys[1]);
  } finally { api.clearApiSession(); globalThis.fetch = original; }
});
