import {tx} from './i18n.js';
import {esc, spinner} from './ui.js';
import {icon} from './icons.js';
import {sessionDurationMs, formatTimer} from './session.js';
import {SPORT_OPTIONS} from './sports-catalog.js';
import {proofQueueState, updateProofQueue} from './checkin-proof-queue.js';

// Presentation only: these values never authorize a start or submission.
export function durationProgress(durationMs, minimumMinutes, maximumSeconds) {
  const known = Number.isFinite(minimumMinutes) && minimumMinutes > 0;
  const duration = Math.max(0, Number(durationMs) || 0);
  const remaining = Number.isFinite(maximumSeconds) && maximumSeconds > 0 ? Math.max(0, maximumSeconds - duration / 1000) : null;
  return {known, ratio: known ? Math.min(1, duration / (minimumMinutes * 60000)) : null,
    reached: known && duration >= minimumMinutes * 60000, nearEnd: remaining !== null && remaining <= 60, remaining};
}

export function exerciseProgressHtml(duration, minimum, maximum) {
  const p = durationProgress(duration, minimum, maximum);
  return `<div class="checkin-goal" data-checkin-goal data-reached="${p.reached}" data-minimum="${p.known ? minimum : ''}" data-maximum="${maximum || ''}">
    <svg class="checkin-goal-arc" viewBox="0 0 300 46" aria-hidden="true"><path class="goal-track" d="M15 39 Q150 -25 285 39" pathLength="100"/><path data-goal-line d="M15 39 Q150 -25 285 39" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${100 - (p.ratio || 0) * 100}"/></svg>
    <p class="checkin-note" data-goal-caption>${goalCaption(p, minimum)}</p>
    <p class="checkin-end-warning" data-end-warning role="status" ${p.nearEnd ? '' : 'hidden'}>${tx('即将到达上限，运动会自动结束','Approaching the limit. Exercise will end automatically.')}</p>
  </div>`;
}
function goalCaption(p, minimum) {
  return !p.known ? tx('最低时长进度 —','Minimum duration progress —') : p.reached
    ? tx('已达最低时长','Minimum duration reached') : tx(`最低时长进度 · ${minimum} 分钟`,`Minimum duration progress · ${minimum} min`);
}
export function refreshExerciseProgress(viewport, duration, minimum, maximum) {
  const goal = viewport?.querySelector('[data-checkin-goal]');
  if (!goal) return;
  const before = goal.dataset.reached === 'true', p = durationProgress(duration, minimum, maximum);
  goal.dataset.reached = String(p.reached);
  goal.querySelector('[data-goal-line]')?.setAttribute('stroke-dashoffset', String(100 - (p.ratio || 0) * 100));
  const caption = goal.querySelector('[data-goal-caption]');
  if (caption) caption.textContent = goalCaption(p, minimum);
  const warning = goal.querySelector('[data-end-warning]');
  if (warning) warning.hidden = !p.nearEnd;
  if (!before && p.reached) goal.dispatchEvent(new CustomEvent('checkin-milestone', {bubbles:true}));
}

export function uploadPresentation(progress = {}) {
  progress ||= {};
  const percent = progress.phase === 'UPLOADING' && Number.isFinite(progress.percent) ? Math.max(0, Math.min(100, progress.percent)) : null;
  const label = progress.phase === 'SUBMITTING' ? tx('正在提交记录','Submitting record')
    : ['CONFIRMING', 'PROCESSING', 'SUCCESS'].includes(progress.phase) ? tx('正在确认凭证','Verifying evidence')
    : percent !== null ? tx(`上传凭证 ${Math.floor(percent)}%`,`Uploading evidence ${Math.floor(percent)}%`) : tx('正在准备凭证','Preparing evidence');
  return {percent, label};
}
export function submitButtonContent(ui) {
  const fileFailure = ui.drafts?.some(draft=>proofQueueState(draft,ui).state === 'failed');
  if (!ui.finish.submitting) return `<span>${ui.finish.error ? ui.previewTransfer === true ? tx('重试保存','Retry saving') : fileFailure ? tx('重试上传','Retry upload') : tx('重试提交','Retry submission') : tx('提交打卡','Submit check-in')}</span>`;
  const label = ui.uploadProgress?.phase === 'SUBMITTING' ? ui.previewTransfer === true ? tx('正在保存记录','Saving record') : tx('正在提交记录','Submitting record') : tx('正在处理凭证','Processing evidence');
  return `<span class="checkin-submit-label">${spinner(18,'on-primary')}${label}</span>`;
}
export function proofUploadHtml(draft, ui) {
  const active = ui.uploadDraftId === draft.id;
  const failure = draft.uploadFailure || draft.processingFailure || active && ui.finish.error;
  const percent = active ? uploadPresentation(ui.uploadProgress).percent : null;
  const label = failure ? tx('需重试','Retry needed') : draft.mediaId ? tx('已验证','Verified') : active ? (percent !== null ? `${Math.floor(percent)}%` : tx('处理中','Processing')) : ui.finish.submitting ? tx('等待上传','Waiting') : '';
  return label ? `<span class="proof-upload-state${failure ? ' is-error' : ''}" data-proof-upload-state>${draft.mediaId ? icon('check',12) : ''}${esc(label)}${percent !== null ? `<span class="proof-upload-line" data-checkin-motion="upload-fill-${esc(draft.id)}" style="width:${percent}%"></span>` : ''}</span>` : '';
}

export function descriptionSaveState(session, saved) {
  return Boolean(saved && saved.phase === 'finished' && saved.startedAt === session.startedAt && saved.serverId === session.serverId && saved.details?.description === session.details.description);
}

export function refreshCheckinTransfer(app) {
  const ui = app.ui.checkin, root = app._viewport?.querySelector('[data-checkin-page="finished"]');
  if (root?.dataset.checkinOwner !== app.state.workspace.student.id || !updateProofQueue(root, ui)) { app.render(); return; }
  const button = root.querySelector('[data-action="checkin.submit"]');
  const phase = ui.uploadProgress?.phase === 'SUBMITTING' ? 'submitting' : 'evidence';
  if (button && button.dataset.transferPhase !== phase) {
    button.innerHTML = submitButtonContent(ui);
    button.dataset.transferPhase = phase;
  }
}

// Move only enough to uncover the field. Repeated validation of a visible field
// must not start another centered scroll while the error is expanding.
export function fieldScrollDelta(field, visible, inset = 20) {
  if (field.top < visible.top + inset) return field.top - visible.top - inset;
  if (field.bottom > visible.bottom - inset) return Math.min(field.bottom - visible.bottom + inset, field.top - visible.top - inset);
  return 0;
}

export function revealCheckinField(field, reduced = false) {
  const scroll = field?.closest?.('[data-scroll-key]');
  if (!scroll?.getBoundingClientRect) return;
  const win = field.ownerDocument.defaultView, viewport = win.visualViewport;
  const rect = scroll.getBoundingClientRect(), dock = scroll.querySelector('.checkin-dock');
  const visible = {top:Math.max(rect.top, viewport?.offsetTop || 0),
    bottom:Math.min(rect.bottom, (viewport?.offsetTop || 0) + (viewport?.height || win.innerHeight), dock?.getBoundingClientRect().top ?? Infinity)};
  const delta = fieldScrollDelta(field.getBoundingClientRect(), visible);
  if (Math.abs(delta) > 1) scroll.scrollBy({top:delta, behavior:reduced ? 'instant' : 'smooth'});
}
export function resizeDescription(field) {
  if (!field?.style) return;
  const scroll = field.closest('[data-scroll-key]'), top = scroll?.scrollTop;
  const before = field.getBoundingClientRect().height;
  field.style.transition = 'none';
  field.style.height = 'auto';
  const next = Math.max(128, Math.min(400, field.scrollHeight + 2));
  field.style.height = `${before}px`;
  void field.offsetHeight;
  field.style.removeProperty('transition');
  field.style.height = `${next}px`;
  if (scroll) scroll.scrollTop = top;
}
export function recordFilterMatches(record, filter) {
  return filter === 'all' || !filter || record.creditType === filter;
}
export function sheetSnap(height, delta, velocity = 0) {
  if (delta > height * .3 || velocity > .75) return 'closed';
  if (delta < -45 || velocity < -.5) return 'expanded';
  return 'rest';
}
export function recordsSkeletonHtml() {
  return `<div class="checkin-record-skeleton" role="status" aria-label="${tx('正在读取打卡记录','Loading check-in records')}">${[0,1,2].map(() => `<div aria-hidden="true"><i></i><span><b></b><b></b></span><em></em></div>`).join('')}</div>`;
}
export function renderExerciseReturn(session, owner) {
  if (!['active','paused','finished'].includes(session?.phase)) return '';
  const sport = SPORT_OPTIONS.find(s => s.value === session.details?.sportType);
  const label = session.details?.customSportName || (sport ? tx(sport.zh,sport.en) : tx('本次运动','Exercise'));
  return `<div class="checkin-return-host" data-checkin-page="home" data-checkin-phase="${session.phase}" data-checkin-session="${esc(String(session.serverId || session.startedAt))}" data-checkin-owner="${esc(owner)}"><button class="checkin-return-capsule pressable" data-action="root.tab" data-tab="checkin"><span class="sport-glyph compact">${icon(sport?.icon || 'sport-other',20)}</span><span><strong data-checkin-motion="sport">${esc(label)}</strong><small>${session.phase === 'finished' ? tx('已结束 · 返回查看','Ended · View details') : session.phase === 'paused' ? tx('已暂停 · 返回运动','Paused · Return') : tx('运动中 · 返回运动','Active · Return')}</small></span><b data-dashboard-duration data-checkin-motion="timer">${formatTimer(sessionDurationMs(session))}</b>${icon('chevron-right',16)}</button></div>`;
}
