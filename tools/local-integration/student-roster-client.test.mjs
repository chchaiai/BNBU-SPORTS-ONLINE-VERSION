import assert from 'node:assert/strict';
import test from 'node:test';
import { getOwnRosterStatus } from '../../BNBU-Sports-Web-new/frontend/student/js/api.js';

const base = { enrollmentId: 'own-id', classSectionId: 'class-id', generatedAt: '2026-09-07T00:00:00Z' };
test('student roster client preserves unavailable and all independent registration statuses', async () => {
  const nativeFetch = globalThis.fetch;
  try {
    const states = [{ available: false, rosterVersion: null, status: null, registrationComplete: false },
      ...['MATCHED', 'PENDING_REGISTRATION', 'IDENTITY_CONFLICT', 'EXTRA_IN_PLATFORM'].map(status => ({
        available: true, rosterVersion: 1, status, registrationComplete: status === 'MATCHED' }))];
    for (const state of states) {
      const value = { ...base, ...state };
      globalThis.fetch = async (url, options) => {
        assert.equal(String(url), '/api/v1/enrollments/own-id/roster-status');
        assert.equal(options.method, 'GET');
        return Response.json({ data: value, meta: {} });
      };
      assert.deepEqual(await getOwnRosterStatus('own-id'), value);
    }
  } finally { globalThis.fetch = nativeFetch; }
});
test('student roster client rejects mismatched identities, false completion and whole-roster payloads', async () => {
  const nativeFetch = globalThis.fetch;
  const valid = { ...base, available: true, rosterVersion: 1, status: 'MATCHED', registrationComplete: true };
  try {
    for (const value of [{ ...valid, enrollmentId: 'someone-else' }, { ...valid, available: false },
      { ...valid, status: 'IDENTITY_CONFLICT' }, { ...valid, rosterVersion: null },
      { ...valid, sourceRows: [] }, { ...valid, generatedAt: 'not-a-date' }]) {
      globalThis.fetch = async () => Response.json({ data: value, meta: {} });
      await assert.rejects(getOwnRosterStatus('own-id'));
    }
  } finally { globalThis.fetch = nativeFetch; }
});
