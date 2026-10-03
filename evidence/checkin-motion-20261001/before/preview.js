// Isolated loopback UI review. Renders the real student screens with labelled fixtures.
// The preview server has no API routes; the real submit action rejects local previews.
import {app} from '/student/js/app.js';
import {buildLocalPreviewWorkspace, LOCAL_PREVIEW_SESSION_KIND} from '/student/js/local-preview.js';
import {localStore} from '/student/js/store.js';
import {saveSession, clearSession, loadSession} from '/student/js/session.js';
import {checkinActions, checkinTick, attachDraftVideoPreview} from '/student/js/screens/checkin.js';
import {restoreCheckinContinuity} from '/student/js/lazy-student-screens.js';

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

function scenario(value, {restore = false} = {}) {
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
const requested = new URLSearchParams(location.search).get('scene');
const select = document.querySelector('#scenario');
const initial = [...select.options].some(option => option.value === requested) ? requested : 'finished';
select.value = initial;
scenario(initial, {restore: true});
setInterval(() => checkinTick(app), 1000);
