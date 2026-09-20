import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyWorkspace } from './js/data.js';
import { storeAuthSession, clearApiSession, listMyRecordPage } from './js/api.js';
import { checkinActions, renderCheckIn, reloadRecordList } from './js/screens/checkin.js';

const record = (id, status = 'SUBMITTED') => ({ id, status, businessDate: '2026-09-17', sportType: 'RUNNING', creditType: 'GENERAL', actualDurationSeconds: 1800 });
const page = (data, nextCursor = null) => Response.json({ data, meta: { pagination: { nextCursor } } });
function setup(t) {
  const memory = new Map();
  t.mock.method(globalThis, 'fetch', async () => page([record('history')]));
  globalThis.localStorage = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v), removeItem: k => memory.delete(k) };
  storeAuthSession({ accessToken: 'test', refreshToken: 'test', accessTokenExpiresAt: '2099-01-01T00:00:00Z', user: { id: 'student' } });
  t.after(() => { clearApiSession(); delete globalThis.localStorage; });
  return { state: { authenticated: true, workspace: emptyWorkspace() }, ui: {}, isApiMode: () => true, render() {}, isWriteAllowed: () => true };
}

test('empty browser loads history directly even when workspace loading failed', async t => {
  const app = setup(t);
  app.state.lastError = { code: 'SYSTEM_SERVICE_UNAVAILABLE' };
  await checkinActions['checkin.tab'](app, { dataset: { tab: 'records' } });
  assert.deepEqual(app.state.workspace.records.map(r => r.id), ['history']);
  assert.match(globalThis.fetch.mock.calls[0].arguments[0], /exercise-records/);
});
test('draft-only pages advance to submitted history', async t => {
  setup(t); let calls = 0;
  globalThis.fetch = async url => { calls++; return url.includes('cursor=older') ? page([record('old')], 'last') : page([record('draft', 'DRAFT')], 'older'); };
  const result = await listMyRecordPage();
  assert.equal(result.data[0].id, 'old'); assert.equal(result.meta.pagination.nextCursor, 'last'); assert.equal(calls, 2);
});
test('failed read shows retry instead of no records and retry restores history', async t => {
  const app = setup(t); globalThis.fetch = async () => Response.json({ code: 'SYSTEM_SERVICE_UNAVAILABLE' }, { status: 503 });
  await checkinActions['checkin.tab'](app, { dataset: { tab: 'records' } });
  const html = renderCheckIn(app); assert.ok(!html.includes('暂无记录')); assert.ok(html.includes('checkin.refreshRecords'));
  globalThis.fetch = async () => page([record('restored')]);
  await checkinActions['checkin.refreshRecords'](app);
  assert.equal(app.ui.checkin.recordListError, null); assert.equal(app.state.workspace.records[0].id, 'restored');
});
test('logout while reading cannot attach previous account history', async t => {
  const app = setup(t); let release;
  globalThis.fetch = () => new Promise(resolve => { release = resolve; });
  const pending = reloadRecordList(app); clearApiSession(); app.ui = {}; app.state.workspace = emptyWorkspace();
  release(page([record('previous-account')])); await pending;
  assert.deepEqual(app.state.workspace.records, []);
});
test('pagination deduplicates records and rejects repeated cursors', async t => {
  const app = setup(t); await reloadRecordList(app); app.state.workspace.recordNextCursor = 'next';
  globalThis.fetch = async () => page([record('history'), record('older')]);
  await reloadRecordList(app, true); assert.deepEqual(app.state.workspace.records.map(r => r.id), ['history', 'older']);
  globalThis.fetch = async () => page([record('draft', 'DRAFT')], 'loop');
  await assert.rejects(listMyRecordPage());
});
