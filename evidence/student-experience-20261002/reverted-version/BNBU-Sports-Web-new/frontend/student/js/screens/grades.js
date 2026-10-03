import { tx } from '../i18n.js';
import { icon } from '../icons.js';
import { esc } from '../ui.js';
import { progressMarkup } from '../student-experience.js';
import { renderStudentRecords } from '../lazy-student-screens.js';
const minutes = value => Number.isFinite(value) ? Math.round(Math.max(0, value) * 60) : '—';
export function renderGrades(app) {
  app.ui.grades ||= {section: 'progress'};
  const {student, grades, progress, hourRule: rule} = app.state.workspace;
  const section = app.ui.grades.section;
  const updated = (student.gradeCalculatedAt || '').replace('T', ' ').slice(0,16);
  const header = `<header class="student-heading"><div><p class="student-eyebrow">${tx('运动档案', 'ACTIVITY JOURNAL')}</p><h1>${tx('记录与进度', 'Records & progress')}</h1></div></header>`;
  const tabs = `<div class="student-segments" role="tablist" aria-label="${tx('运动档案', 'Activity journal')}"><span class="student-segment-indicator" data-student-motion="grades-indicator" style="--segment:${section === 'records' ? 1 : 0}" aria-hidden="true"></span>${[['progress',tx('进度','Progress')],['records',tx('记录','Records')]].map(([value,label])=>`<button role="tab" aria-selected="${value===section}" data-action="grades.section" data-value="${value}">${label}</button>`).join('')}</div>`;
  if (section === 'records') return `<div class="tab-content col student-page student-grades">${header}${tabs}${renderStudentRecords(app)}</div>`;
  const known = Number.isFinite(progress.totalValidHours), target = Number.isFinite(rule.total) && rule.total > 0;
  const remaining = known && target ? Math.max(0, rule.total - progress.totalValidHours) : null;
  const supporting = progress.qualificationStatus === 'QUALIFIED' ? tx('已完成本学期打卡要求', 'Semester requirement complete') : remaining === null ? tx('进度或目标暂未获取', 'Progress or goal unavailable') : remaining === 0 ? tx('等待确认达标状态', 'Awaiting qualification confirmation') : tx(`距离学期目标还需 ${minutes(remaining)} 分钟`, `${minutes(remaining)} minutes to your semester goal`);
  const gender = String(student.gender || '').toLowerCase();
  const distance = gender === 'male' ? '1000' : gender === 'female' ? '800' : '800 / 1000';
  const seconds = grades.enduranceRunTimeSeconds;
  const time = Number.isSafeInteger(seconds) && seconds >= 0 ? `${Math.floor(seconds/60)}′${String(seconds%60).padStart(2,'0')}″` : tx('暂未记录', 'Not recorded');
  const endurance = grades.enduranceRunStatus === 'recorded' ? time : grades.enduranceRunStatus === 'exempt' ? tx('免测', 'Exempt') : tx('暂未记录', 'Not recorded');
  const category = (id, name, value, required) => `<div class="student-category-progress" data-student-motion="progress-${id}"><div class="row"><strong class="grow">${name}</strong><span><b>${minutes(value)}</b> / ${minutes(required)} ${tx('分钟','min')}</span></div>${progressMarkup(id, value, required)}</div>`;
  return `<div class="tab-content col student-page student-grades">${header}${tabs}
    <section class="swiss-panel student-summary student-progress-hero" data-student-motion="progress-total"><div class="row"><span class="student-eyebrow grow">${tx('本学期已计入', 'THIS SEMESTER')}</span>${app.state.isLoading ? `<span class="student-refresh" role="status">${tx('更新中…','Updating…')}</span>` : icon('bar-chart',22)}</div><div class="student-total"><strong data-student-number="semester-minutes" data-value="${known?progress.totalValidHours:''}">${minutes(progress.totalValidHours)}</strong><span>${tx('分钟','minutes')}</span></div>${progressMarkup('semester', progress.totalValidHours, rule.total)}<div class="student-meter-caption"><span>${tx('学期目标','Semester goal')} ${target ? minutes(rule.total) : '—'} ${tx('分钟','min')}</span></div><p class="body-medium text-muted">${supporting}</p></section>
    <section class="swiss-panel student-category-breakdown" aria-label="${tx('分类进度','Progress by category')}">${category('course',tx('课程相关','Course-related'),progress.course,rule.courseRequired)}${category('general',tx('自主运动','Independent exercise'),progress.general,rule.generalRequired)}</section>
    <section class="swiss-panel student-fitness" data-student-motion="fitness"><div class="row"><span class="student-small-icon">${icon('directions-run',22)}</span><div class="grow"><h2>${tx('体测记录','Fitness record')}</h2><p class="body-small text-muted">${distance} ${tx('米耐力跑','m endurance run')}</p></div><strong>${esc(endurance)}</strong></div><p class="body-small text-muted">${grades.enduranceRunStatus === 'exempt' ? tx('耐力跑免测，不记录用时','Endurance exemption · no recorded time') : tx('仅显示教师确认的用时或免测结果。','Confirmed time or exemption only.')}</p></section>
    ${updated ? `<p class="student-updated">${tx('更新于','Updated')} ${esc(updated)}</p>` : ''}
  </div>`;
}
export const gradesActions = {'grades.section': (app, el) => {if(app.ui.grades.section === el.dataset.value) return; app.ui.grades.section = el.dataset.value; app.render();}};
