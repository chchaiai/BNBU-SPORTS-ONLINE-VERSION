import { localStore } from './store.js';
import { esc } from './ui.js';
import { tx } from './i18n.js';

export function currentCourse(workspace) {
  const courses = workspace.courses.filter(c => c.isCurrent && c.enrollmentStatus === 'enrolled');
  return courses.find(c => c.enrollmentId === workspace.selectedEnrollmentId) || courses[0] || null;
}

export function courseSwitchLocked(app) {
  const session = localStore.getExerciseSession(app.state.workspace.student.id);
  return app.state.isLoading || app.state.courseSwitchInProgress || app.state.subScreen || app.ui.checkin?.sessionTransitioning ||
    app.ui.checkin?.finish?.submitting || app.ui.checkin?.loadingRecords ||
    !!app.state.workspace.activeServerSession || ['active','paused','finished'].includes(session?.phase);
}

export function renderCourseSwitcher(app) {
  const courses = app.state.workspace.courses.filter(c => c.isCurrent && c.enrollmentStatus === 'enrolled');
  if (courses.length < 2) return '';
  const selected = currentCourse(app.state.workspace);
  return `<section class="course-card" style="margin:8px 0 12px;padding:14px" aria-label="${tx('切换班级','Switch class')}">
    <div style="font-weight:600;margin-bottom:8px">${tx('当前班级','Current class')}</div>
    <div class="col" style="gap:8px">${courses.map(c => `<button class="${c.enrollmentId === selected?.enrollmentId ? 'primary-btn' : 'outlined-btn'}" style="min-height:44px;padding:8px 12px;white-space:normal" data-action="courses.switch" data-enrollment-id="${esc(c.enrollmentId)}" aria-pressed="${c.enrollmentId === selected?.enrollmentId}" ${courseSwitchLocked(app) ? 'disabled' : ''}>${esc(c.name)}${c.teacher ? ' · '+esc(c.teacher) : ''}</button>`).join('')}</div>
    <p class="body-small text-muted" style="margin:10px 0 0">${courseSwitchLocked(app) ? tx('请先完成当前操作或运动提交，再切换班级。','Finish the current action or exercise submission before switching.') : tx('打卡、学时和申请按班级独立计算。','Check-ins, progress and applications are separate for each class.')}</p>
  </section>`;
}

export async function switchCourse(app, enrollmentId) {
  if (courseSwitchLocked(app) || enrollmentId === app.state.workspace.selectedEnrollmentId) return;
  if (!app.state.workspace.courses.some(c => c.enrollmentId === enrollmentId && c.isCurrent && c.enrollmentStatus === 'enrolled')) return;
  app.state.courseSwitchInProgress = true;
  try { await app.reloadApiWorkspace(null, enrollmentId); }
  finally { app.state.courseSwitchInProgress = false; app.render(); }
}
