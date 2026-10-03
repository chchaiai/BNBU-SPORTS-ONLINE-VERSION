import test from 'node:test';
import assert from 'node:assert/strict';
import {createMotionLoader, queueCheckinSuccess, consumeCheckinSuccess, updateCheckinNumber} from './js/checkin-motion-loader.js';
import {sameCheckinSession, restoreCheckinLayout} from './js/checkin-layout.js';
import {buildLocalPreviewWorkspace} from './js/local-preview.js';
import {storeAuthSession, clearApiSession} from './js/api.js';
import {saveSession, loadSession} from './js/session.js';
import {checkinActions, renderCheckIn} from './js/screens/checkin.js';

test('optional animation load is shared and resource failure resolves harmlessly', async () => {
  let calls = 0;
  const load = createMotionLoader(async () => {calls++; throw new Error('resource unavailable');});
  assert.deepEqual(await Promise.all([load(), load(), load()]), [null, null, null]);
  assert.equal(await load(), null); assert.equal(calls, 1);
});

test('numbers remain usable before the engine loads, including unknown values', () => {
  const el = {textContent: '32 分钟'};
  updateCheckinNumber(el, '33 分钟'); assert.equal(el.textContent, '33 分钟');
  updateCheckinNumber(el, '—'); assert.equal(el.textContent, '—');
});

test('a confirmed submission celebration can be consumed only once for its owner', () => {
  const app = {}, root = {dataset: {checkinPage: 'submitted', checkinOwner: 'student'}};
  assert.equal(consumeCheckinSuccess(app, root), null); // Merely rendering a restored success is insufficient.
  queueCheckinSuccess(app, 'student', 'record-1');
  assert.deepEqual(consumeCheckinSuccess(app, root), {owner: 'student', recordId: 'record-1'});
  assert.equal(consumeCheckinSuccess(app, root), null);
  queueCheckinSuccess(app, 'student', 'record-2');
  root.dataset.checkinOwner = 'different-student';
  assert.equal(consumeCheckinSuccess(app, root), null);
  root.dataset.checkinOwner = 'student';
  assert.equal(consumeCheckinSuccess(app, root), null);
});

test('upload completion, failed submission, and leaving the screen cannot trigger celebration', () => {
  for (const page of ['finished', 'running', 'records', undefined]) {
    const app = {}; queueCheckinSuccess(app, 'student', 'record');
    assert.equal(consumeCheckinSuccess(app, page ? {dataset: {checkinPage: page, checkinOwner: 'student'}} : null), null);
    assert.equal(app._checkinCelebration, undefined);
  }
});

test('continuity follows the exercise identity, with an explicit preparation-to-start transition', () => {
  const before = {owner: 'student', session: 's1', page: 'running'};
  const root = {dataset: {checkinOwner: 'student', checkinSession: 's1', checkinPage: 'finished'}};
  assert.equal(sameCheckinSession(before, root), true);
  root.dataset.checkinSession = 's2'; assert.equal(sameCheckinSession(before, root), false);
  root.dataset.checkinPage = 'running'; before.page = 'preparation'; before.session = '';
  assert.equal(sameCheckinSession(before, root), true);
  root.dataset.checkinOwner = 'other'; assert.equal(sameCheckinSession(before, root), false);
});

test('rerender preserves typing caret, disclosure, and both scroll positions before optional motion', () => {
  const scroller = {scrollTop: 0}, proofStrip = {dataset: {checkinScroll: 'proofs'}, scrollLeft: 0};
  const details = {dataset: {checkinDisclosure: 'requirements'}, open: false};
  const field = {disabled: false, focus(opts) {this.focused = opts.preventScroll;}, setSelectionRange(a, b) {this.selection = [a, b];}};
  const root = {dataset: {checkinPage: 'finished', checkinOwner: 'student', checkinSession: 's1'},
    querySelectorAll: selector => selector.includes('disclosure') ? [details] : selector.includes('scroll') ? [proofStrip] : [],
    closest: () => scroller, contains: el => el === field, ownerDocument: {getElementById: () => field}};
  const viewport = {querySelector: selector => selector === '[data-checkin-page]' ? root : null};
  restoreCheckinLayout(viewport, {page: 'finished', owner: 'student', session: 's1', scrollTop: 320,
    field: {id: 'checkin-description', start: 4, end: 6}, disclosures: new Map([['requirements', true]]), scroll: new Map([['proofs', 96]]), scrollY: new Map([['proofs', 210]])});
  assert.equal(scroller.scrollTop, 320); assert.equal(proofStrip.scrollLeft, 96);
  assert.equal(proofStrip.scrollTop, 210);
  assert.equal(details.open, true); assert.deepEqual(field.selection, [4, 6]); assert.equal(field.focused, true);
});

test('reduced motion and a hidden document suppress decorative work', async t => {
  const media = {matches: true, addEventListener() {}};
  globalThis.matchMedia = () => media; t.after(() => delete globalThis.matchMedia);
  const {canAnimate} = await import('./js/checkin-motion.js');
  const root = {isConnected: true, ownerDocument: {hidden: false, documentElement: {dataset: {}}}};
  assert.equal(canAnimate(root), false);
  media.matches = false; assert.equal(canAnimate(root), true);
  root.ownerDocument.hidden = true; assert.equal(canAnimate(root), false);
  root.ownerDocument.hidden = false; root.ownerDocument.documentElement.dataset.previewReducedMotion = 'true';
  assert.equal(canAnimate(root), false);
});

for (const outcome of ['success', 'failure', 'already-submitted']) test(`submission motion follows the real API outcome: ${outcome}`, async t => {
  const memory = new Map();
  globalThis.localStorage = {getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key)};
  storeAuthSession({accessToken: 'test', refreshToken: 'test', accessTokenExpiresAt: '2099-01-01T00:00:00Z', user: {id: 'motion-student'}});
  t.after(() => {clearApiSession(); delete globalThis.localStorage;});
  const workspace = buildLocalPreviewWorkspace(); workspace.student.id = 'motion-student';
  let resolveDone, resolveReached, respond;
  const done = new Promise(resolve => {resolveDone = resolve;});
  const reached = new Promise(resolve => {resolveReached = resolve;});
  const response = new Promise(resolve => {respond = resolve;});
  const app = {state: {workspace, tab: 'checkin'}, ui: {}, isApiMode: () => true, isLocalPreview: () => false,
    hasActiveEnrollment: () => true, isWriteAllowed: () => true, reloadApiWorkspace() {},
    render() {if (loadSession('motion-student')?.phase === 'submitted' || this.ui.checkin?.finish.error) resolveDone();},
    showDialog(dialog) {this.state.dialog = dialog; resolveDone();}};
  saveSession('motion-student', {phase: 'finished', serverId: 'motion-session', startedAt: Date.now() - 2100000,
    endedAt: Date.now(), activeDurationMillis: 2100000, maximumDurationSeconds: 7200,
    details: {sportType: 'running', creditType: 'general', description: '完成跑步练习'}});
  renderCheckIn(app);
  app.ui.checkin.drafts = [{id: 'proof', serverOnly: true, mediaId: 'proof', type: 'image', url: ''}];
  const record = {id: 'motion-record', sessionId: 'motion-session', version: 2, description: '完成跑步练习',
    status: outcome === 'already-submitted' ? 'SUBMITTED' : 'DRAFT'};
  let submits = 0;
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    const path = String(url);
    if (path.includes('/audit-logs/client-errors')) return Response.json({data: {}});
    if (path.includes('/exercise-records?')) return Response.json({data: [record], meta: {pagination: {nextCursor: null}}});
    if (path.endsWith('/evidence-context')) return Response.json({data: {sessionId: 'motion-session', mediaIds: ['proof']}});
    if (path.endsWith('/media/proof')) return Response.json({data: {id: 'proof', sessionId: 'motion-session', businessPurpose: 'EXERCISE_RECORD', uploadStatus: 'AVAILABLE', mediaType: 'IMAGE'}});
    if (path.endsWith('/submit')) {submits++; resolveReached(); return response;}
    throw new Error(`Unexpected API request: ${init.method || 'GET'} ${path}`);
  });
  checkinActions['checkin.submit'](app);
  if (outcome !== 'already-submitted') {
    await reached;
    assert.equal(app._checkinCelebration, undefined);
    assert.equal(loadSession('motion-student').phase, 'finished');
    respond(outcome === 'success' ? Response.json({data: {...record, status: 'SUBMITTED', creditedDurationSeconds: 2100}})
      : Response.json({code: 'VALIDATION_FAILED', requestId: 'motion-test'}, {status: 422}));
  }
  await done;
  assert.equal(submits, outcome === 'already-submitted' ? 0 : 1);
  if (outcome === 'success') {
    assert.deepEqual(app._checkinCelebration, {owner: 'motion-student', recordId: 'motion-record'});
    assert.equal(loadSession('motion-student').phase, 'submitted');
  } else {
    assert.equal(app._checkinCelebration, undefined);
    assert.equal(loadSession('motion-student').phase, outcome === 'failure' ? 'finished' : 'submitted');
  }
});
