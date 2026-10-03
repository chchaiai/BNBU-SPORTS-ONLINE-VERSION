import { t, tx } from '../i18n.js';
import { icon } from '../icons.js';
import { esc } from '../ui.js';
import { proofTodoContext } from '../proof-todo.js';
import { canStartExercise, hasSubmittedCheckInToday, loadSession, sessionDurationMs, formatTimer } from '../session.js';
import { joinRequestEntryPanel } from './join.js';
import { progressMarkup } from '../student-experience.js';
import { renderHomeAppPromo } from '../app-download-promo.js';

export function dashboardProgressStatusLabel(studentStatus, progressStatus) {
  const membership = String(studentStatus ?? '').trim().toUpperCase();
  if (membership === 'PENDING') return tx('已退班', 'Withdrawn');
  if (membership !== 'ACTIVE') return tx('状态未知', 'Status unavailable');
  return ['COMPLETED', 'QUALIFIED', '已达标'].includes(String(progressStatus ?? '').trim().toUpperCase()) ? tx('已达标', 'Completed') : tx('进行中', 'In progress');
}
const minutes = value => Number.isFinite(value) ? Math.round(value * 60) : '—';

export function renderDashboard(app) {
  const workspace = app.state.workspace, student = workspace.student;
  const progress = workspace.progress, rule = workspace.hourRule, window = workspace.checkInTimeWindow;
  const session = loadSession(student.id), phase = session?.phase;
  const ongoing = ['active', 'paused', 'finished'].includes(phase);
  const checkedIn = hasSubmittedCheckInToday(workspace), unread = app.unreadNoticeCount();
  const enrolled = app.hasActiveEnrollment();
  const waiting = !app.isApiMode() && window.windowMode === 'unavailable';
  const blocked = !app.isApiMode() && !waiting ? canStartExercise(window) : null;
  const title = phase === 'finished' ? tx('完成最后一步', 'One last step') : phase === 'paused' ? tx('休息一下，随时继续', 'Take a break. Resume anytime.') : phase === 'active' ? tx('保持自己的节奏', 'Find your own pace') : checkedIn ? tx('今天的运动已提交', 'Today’s exercise is submitted') : tx('从一次运动开始', 'Start with a little movement');
  const description = phase === 'finished' ? tx('确认凭证和运动说明后，即可提交本次记录。', 'Review your evidence and notes to submit this exercise.') : phase === 'paused' ? tx('计时已暂停，继续后接着累计。', 'The timer is paused. Continue when you are ready.') : phase === 'active' ? tx('正在记录本次运动，回来就能继续。', 'Your exercise is being recorded.') : checkedIn ? tx('查看记录，了解审核状态与计入时长。', 'View your review status and credited time in records.') : waiting ? tx('正在同步打卡时间窗', 'Syncing check-in hours') : blocked || (window.dailyStartTime && window.dailyEndTime ? tx(`每日开放 ${window.dailyStartTime}–${window.dailyEndTime}（北京时间）`, `Open daily ${window.dailyStartTime}–${window.dailyEndTime} (Beijing time)`) : tx('选择喜欢的项目，记录今天的运动。', 'Choose an activity and record today’s movement.'));
  const action = checkedIn && !ongoing ? 'dashboard.openRecords' : 'dashboard.openCheckIn';
  const label = phase === 'finished' ? tx('继续填写记录', 'Finish your record') : ongoing ? tx('返回本次运动', 'Return to exercise') : checkedIn ? tx('查看记录', 'View records') : t('dashboard_start_checkin');
  const hero = enrolled || ongoing ? `<section class="swiss-panel student-task" data-student-motion="home-task">
    <div class="row"><span class="student-eyebrow grow">${ongoing ? tx('本次运动', 'CURRENT ACTIVITY') : tx('今日运动', 'TODAY’S ACTIVITY')}</span><span class="student-state-dot${phase === 'active' ? ' is-active' : ''}">${phase === 'finished' ? tx('待提交', 'To submit') : phase === 'paused' ? tx('已暂停', 'Paused') : phase === 'active' ? tx('进行中', 'In progress') : checkedIn ? tx('已提交', 'Submitted') : tx('准备开始', 'Ready')}</span></div>
    <h2>${title}</h2>
    ${ongoing ? `<div class="student-live-time" ${phase !== 'finished' ? 'data-dashboard-duration' : ''}>${formatTimer(sessionDurationMs(session))}</div>` : `<span class="student-task-icon" aria-hidden="true">${icon(checkedIn ? 'check-circle' : 'directions-run', 38)}</span>`}
    <p class="body-medium text-muted">${esc(description)}</p>
    <button class="primary-btn pressable" data-action="${action}">${icon(ongoing ? 'play-arrow' : checkedIn ? 'assignment' : 'add-box', 20)}<span>${label}</span></button>
  </section>` : '';
  const todos = (workspace.proofTodos || []).filter(Boolean);
  const todoPanel = todos.length ? `<section class="student-todos" aria-label="${tx('补证待办', 'Evidence tasks')}" data-student-motion="home-todos"><div class="row"><strong class="grow">${tx('需要补充凭证', 'Evidence needed')}</strong><span class="student-count">${todos.length}</span></div>${todos.map(item => `<button class="student-todo-row pressable" data-action="dashboard.openProofTodo" data-record-id="${esc(item.recordId || '')}"><span>${proofTodoContext(item)}</span><span class="student-todo-action">${tx('去补证', 'Add evidence')}${icon('chevron-right', 18)}</span></button>`).join('')}</section>` : '';
  const request = workspace.courseJoinRequest;
  const join = request && request.status !== 'ACTIVE' ? joinRequestEntryPanel(request) : !enrolled ? `<section class="swiss-panel student-task"><h2>${t('dashboard_join_course')}</h2><p class="body-medium text-muted">${t('dashboard_join_course_hint')}</p><button class="primary-btn pressable" data-action="dashboard.scanJoin">${icon('qr-code-scanner', 20)}${t('login_scan_button')}</button><button class="text-btn pressable" data-action="dashboard.enterCode">${t('dashboard_enter_invite')}</button></section>` : '';
  const knownTarget = Number.isFinite(rule.total) && rule.total > 0;
  const total = Number.isFinite(progress.totalValidHours) ? Math.max(0, progress.totalValidHours) : null;
  return `<div class="tab-content col dashboard-content student-page" data-student-page="home">
    <header class="student-heading"><div><p class="student-eyebrow">BNBU SPORTS</p><h1>${t('dashboard_greeting', esc(student.name))}</h1></div><span class="bell-wrap"><button class="bell-btn pressable" data-action="dashboard.openNotifications" aria-label="${t('dashboard_open_notifications')}">${icon('notifications', 22)}</button>${unread > 0 ? `<span class="bell-badge" data-student-number="unread" data-value="${unread}">${unread > 99 ? '99+' : unread}</span>` : ''}</span></header>
    ${todoPanel}${hero}${join}
    <section class="swiss-panel student-summary" data-student-motion="home-summary"><div class="row"><h2 class="grow">${tx('本学期', 'This semester')}</h2><button class="text-btn pressable" data-action="dashboard.openProgress">${tx('查看进度', 'View progress')}${icon('chevron-right', 18)}</button></div>
      <div class="student-total"><strong data-student-number="semester-minutes" data-value="${total ?? ''}">${minutes(total)}</strong><span>${tx('已计入分钟', 'credited minutes')}</span></div>
      ${progressMarkup('semester', total, rule.total)}
      <div class="student-meter-caption"><span>${tx('学期目标', 'Semester goal')} ${knownTarget ? minutes(rule.total) : '—'} ${tx('分钟', 'min')}</span><span>${dashboardProgressStatusLabel(student.status, progress.qualificationStatus || progress.status)}</span></div>
      <div class="student-metric-pair"><div><span>${tx('课程相关', 'Course-related')}</span><strong>${minutes(progress.course)} <small>${tx('分钟', 'min')}</small></strong></div><div><span>${tx('自主运动', 'Independent')}</span><strong>${minutes(progress.general)} <small>${tx('分钟', 'min')}</small></strong></div></div>
    </section>
    ${renderHomeAppPromo()}
  </div>`;
}

export const dashboardActions = {
  'dashboard.openNotifications': app => {app.state.notificationSheetOpen = true; app.ui.notifications ||= {filter: 'all', selectedNoticeId: null}; app.render();},
  'dashboard.openCheckIn': app => {if (app.ui.checkin) {app.ui.checkin.selectedRecordId = null; app.ui.checkin.tab = 'exercise';} app.selectTab('checkin');},
  'dashboard.openRecords': app => {app.ui.grades = {...app.ui.grades, section: 'records', selectedRecordId:null}; if(app.ui.checkin) app.ui.checkin.selectedRecordId = null; app.selectTab('grades');},
  'dashboard.openProgress': app => {app.ui.grades = {...app.ui.grades, section: 'progress'}; app.selectTab('grades');},
  'dashboard.openProofTodo': (app, el) => app.actions['checkin.selectProof'](app, el),
  'dashboard.scanJoin': app => {app.ui.scan = null; app.openSub('scan', {});},
  'dashboard.enterCode': app => {app.ui.enterCode = null; app.openSub('enterCode', {});},
};
