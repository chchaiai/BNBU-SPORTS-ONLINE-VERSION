// Isolated loopback UI review. Renders the real student screens with labelled fixtures.
// The preview server has no API routes; the real submit action rejects local previews.
import {app} from '/student/js/app.js';
import {buildLocalPreviewWorkspace, LOCAL_PREVIEW_SESSION_KIND} from '/student/js/local-preview.js';
import {localStore} from '/student/js/store.js';
import {saveSession, clearSession, loadSession} from '/student/js/session.js';
import {checkinActions, checkinTick, attachDraftVideoPreview} from '/student/js/screens/checkin.js';
import {restoreCheckinContinuity} from '/student/js/lazy-student-screens.js';
import {previewCheckinCelebration} from '/student/js/checkin-motion-loader.js';
import {MAX_PROOF_IMAGES} from '/student/js/api.js';

if (!['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname)) throw new Error('Loopback preview only');
const owner = 'INSTRUMENT-CHECKIN-LOCAL-PREVIEW';
localStore.setSession({kind: LOCAL_PREVIEW_SESSION_KIND, accountId: owner});
app._viewport = document.querySelector('#review-viewport');
app.overlay = {healthReminderAck: true};
Object.assign(app.actions, checkinActions, {
  'root.tab': (a, el) => a.selectTab(el.dataset.tab),
  'dialog.close': a => {a.state.dialog = null; a.render();},
});
app.registerAfterRender(attachDraftVideoPreview);
Object.assign(app.state, {
  systemMode: 'NORMAL', systemModeChecked: true, isRestoringSession: false,
  privacyConsentChecked: true, needsPrivacyConsent: false, authenticated: true,
  requiresContactBinding: false, postEnrollmentGuideCompleted: true, preLoginGuideCompleted: true,
  workspace: buildLocalPreviewWorkspace(), tab: 'checkin', subScreen: null, isLoading: false,
});
app.state.workspace.student.id = owner;
await restoreCheckinContinuity(app);
const actualApiMode = app.isApiMode.bind(app);
const picture = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="#77988a"/><path d="M85 300 135 30H270L320 300M200 30V300M108 170H298M126 75H280" fill="none" stroke="#eef4ee" stroke-width="4"/><path d="M75 128H325" stroke="#294e48" stroke-width="4"/><rect x="100" y="240" width="200" height="34" rx="10" fill="#294e48"/><text x="200" y="263" text-anchor="middle" font-family="sans-serif" font-size="16" fill="white">示例运动凭证</text></svg>`);

let switchingScenario = false;
function scenario(value, {restore = false} = {}) {
  switchingScenario = true;
  const existing = restore && localStorage.getItem('instrument-preview-scene') === value ? loadSession(owner) : null;
  app.isApiMode = actualApiMode;
  app.state.workspace = buildLocalPreviewWorkspace();
  app.state.workspace.student.id = owner;
  app.state.tab = 'checkin'; app.state.dialog = null; app.ui.checkin = null;
  clearSession(owner);
  app.render();
  const ui = app.ui.checkin;
  ui.draftScope = 'pending'; ui.drafts = [];
  ui.setup.creditType = 'general'; ui.setup.generalSportType = 'stretch_flex';
  if (['running', 'paused', 'finished', 'filled', 'submitted', 'short', 'uploading', 'failed', 'empty-proof'].includes(value)) {
    const now = Date.now(), duration = value === 'short' ? 5 * 60000 : (32 * 60 + 18) * 1000;
    const phase = value === 'running' ? 'active' : value === 'paused' ? 'paused' : value === 'submitted' ? 'submitted' : 'finished';
    saveSession(owner, existing || {
      phase, startedAt: now - duration, lastResumedAt: phase === 'active' ? now : null,
      endedAt: phase === 'finished' || phase === 'submitted' ? now : null,
      accumulatedMs: duration, activeDurationMillis: duration, maximumDurationSeconds: 7200,
      details: {creditType: 'general', sportType: 'stretch_flex', description: ['finished', 'empty-proof'].includes(value) ? '' : '完成肩背、髋部与腿部伸展，配合呼吸进行柔韧练习。'},
      summary: {duration: '00:32:18', sportType: '伸展与柔韧', creditType: '自主运动', proofCount: 1},
    });
    if (value !== 'empty-proof') ui.drafts = [{id: 'instrument-fixture-photo', type: 'image', url: picture, byteCount: 215000, capturedAt: new Date(now).toISOString()}];
  }
  if (value === 'unknown') app.state.workspace.creditPolicy = null;
  if (value === 'uploading') {ui.finish.submitting = true; ui.uploadProgress = {phase: 'UPLOADING', percent: 42}; ui.mediaNotice = '正在上传 42%（示例）';}
  if (value === 'failed') ui.mediaNotice = '上传失败，凭证已保留，请重试提交。（示例）';
  if (['records', 'record-error'].includes(value)) ui.tab = 'records';
  if (value === 'record-error') {
    app.state.workspace.records = [];
    ui.recordListError = {title: '记录暂时无法读取', message: '网络暂时不可用，请重试。（示例）', code: 'SYSTEM_SERVICE_UNAVAILABLE'};
    app.isApiMode = () => true;
  }
  app.scrollPositions.clear();
  app.render();
  localStorage.setItem('instrument-preview-scene', value);
  const url = new URL(location.href); url.searchParams.set('scene', value); history.replaceState(null, '', url);
  switchingScenario = false;
}

app._viewport.addEventListener('click', event => {
  const el = event.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const handler = app.actions[el.dataset.action];
  if (handler) Promise.resolve(handler(app, el, event)).catch(console.error);
});
for (const kind of ['input', 'change']) app._viewport.addEventListener(kind, event => {
  const el = event.target.closest(`[data-${kind}]`);
  if (el) app.actions[el.dataset[kind]]?.(app, el, event);
});
document.querySelector('#scenario').addEventListener('change', event => scenario(event.target.value));
document.querySelector('#theme').addEventListener('click', () => {
  document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
});
document.querySelector('#add-proof').addEventListener('click', () => {
  const ui = app.ui.checkin;
  if (!ui || ui.finish.submitting || ui.drafts.length >= MAX_PROOF_IMAGES) return;
  ui.drafts.push({id: `motion-example-${crypto.randomUUID()}`, type: 'image', url: picture,
    byteCount: 215000, capturedAt: new Date().toISOString()});
  app.render();
});
document.querySelector('#remove-proof').addEventListener('click', () => {
  const ui = app.ui.checkin;
  if (!ui || ui.finish.submitting) return;
  ui.drafts.pop(); app.render();
});
document.querySelector('#advance-minute').addEventListener('click', () => {
  const session = loadSession(owner);
  if (!session || !['active', 'paused', 'finished'].includes(session.phase)) return;
  session.accumulatedMs += 60000; session.activeDurationMillis += 60000;
  saveSession(owner, session); app.render();
});
document.querySelector('#celebrate').addEventListener('click', () => previewCheckinCelebration(app._viewport));
function motionMode(value) {
  if (value === 'system') delete document.documentElement.dataset.previewReducedMotion;
  else document.documentElement.dataset.previewReducedMotion = value === 'reduced' ? 'true' : 'false';
  const url = new URL(location.href); url.searchParams.set('motion', value); history.replaceState(null, '', url);
}
document.querySelector('#motion-mode').addEventListener('change', event => {motionMode(event.target.value); app.render();});
document.querySelector('#rerender').addEventListener('click', () => app.render());
app.registerAfterRender(() => {
  const root = app._viewport.querySelector('[data-checkin-page]');
  const page = root?.dataset.checkinPage;
  const editable = ['running', 'finished'].includes(page) && !app.ui.checkin?.finish.submitting;
  document.querySelector('#add-proof').disabled = !editable || app.ui.checkin.drafts.length >= MAX_PROOF_IMAGES;
  document.querySelector('#remove-proof').disabled = !editable || !app.ui.checkin.drafts.length;
  document.querySelector('#advance-minute').disabled = !editable;
  document.querySelector('#celebrate').disabled = page !== 'submitted';
  const selector = document.querySelector('#scenario');
  if (!switchingScenario && ['preparation', 'running', 'paused', 'finished', 'filled'].includes(selector.value)) {
    const next = page === 'running' ? (root.dataset.checkinPhase === 'paused' ? 'paused' : 'running')
      : page === 'finished' ? (loadSession(owner)?.details.description?.trim() ? 'filled' : 'finished') : page;
    if (next && [...selector.options].some(option => option.value === next)) {
      selector.value = next;
      const url = new URL(location.href); url.searchParams.set('scene', next); history.replaceState(null, '', url);
      localStorage.setItem('instrument-preview-scene', next);
    }
  }
});
const requested = new URLSearchParams(location.search).get('scene');
const requestedMotion = new URLSearchParams(location.search).get('motion');
const mode = ['full', 'reduced'].includes(requestedMotion) ? requestedMotion : 'system';
document.querySelector('#motion-mode').value = mode; motionMode(mode);
const select = document.querySelector('#scenario');
const initial = [...select.options].some(option => option.value === requested) ? requested : 'finished';
select.value = initial;
scenario(initial, {restore: true});
setInterval(() => checkinTick(app), 1000);
