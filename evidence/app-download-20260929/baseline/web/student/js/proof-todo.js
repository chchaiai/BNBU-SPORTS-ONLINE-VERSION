import {tx,currentLocale,getLanguage} from './i18n.js';
import {esc} from './ui.js';
import {SPORT_OPTIONS} from './sports-catalog.js';
import {matchExactPublicReason} from './v81-review.js';

export function proofTodoContext(item) {
  const en=getLanguage()==='en-US';
  const sport=SPORT_OPTIONS.find(option=>option.value===String(item.sportType||'').toLowerCase());
  const label=item.sportName || (sport?(en?sport.en:sport.zh):tx('运动打卡','Exercise check-in'));
  const date=Number.isFinite(Date.parse(item.startedAt))?new Intl.DateTimeFormat(currentLocale(),{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(item.startedAt)):tx('日期待加载','Date unavailable');
  const duration=Number.isFinite(item.actualDurationSeconds)?tx(`${Math.floor(item.actualDurationSeconds/60)} 分钟`,`${Math.floor(item.actualDurationSeconds/60)} min`):'';
  const reason=matchExactPublicReason(item.reasonCode||item.studentVisibleReason);
  const reasonText=reason?(en?reason.en:reason.zh):tx('请查看教师说明或联系任课教师','Review the teacher note or contact your teacher');
  const deadline=Number.isFinite(Date.parse(item.deadlineAt))?new Intl.DateTimeFormat(currentLocale(),{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(item.deadlineAt)):tx('暂未获取','Unavailable');
  return `<div class="col" style="gap:6px;width:100%" data-proof-record-id="${esc(item.recordId)}">
    <strong class="body-large">${esc(date)} · ${esc(label)}${duration?` · ${esc(duration)}`:''}</strong>
    <span class="body-small text-muted">${esc(item.courseName||tx('课程打卡','Course exercise'))} · ${tx('教师复核要求补证','Supplement requested by teacher')}</span>
    <span class="body-medium">${tx('补证理由：','Reason: ')}${esc(reasonText)}</span>
    ${item.publicComment?`<span class="body-medium">${tx('教师说明：','Teacher note: ')}${esc(item.publicComment)}</span>`:''}
    <span class="body-small text-muted">${item.paused?tx('补证计时已暂停','Supplement timer paused'):item.expired?tx('补证已逾期','Supplement deadline missed'):tx(`截止：${deadline}（北京时间）`,`Due: ${deadline} (Beijing time)`)}</span>
  </div>`;
}
