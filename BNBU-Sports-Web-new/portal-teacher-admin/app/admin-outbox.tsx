"use client";
import { useEffect, useRef, useState } from 'react';
import { request, toUserFacingError, type UserFacingError } from './api-client';
import { ErrorPanel } from './error-panel';
import type { AdminLocale } from './admin-types';

type Event={actor:{actorName:string|null;actorEmail:string|null;actorRole:string|null;actorNumber:string|null;operationOutcome:string|null;action:string|null}|null;id:string;eventType:string;status:string;createdAt:string;lastProcessedAt:string|null;attempts:number;retryCount:number;
  lastErrorCode:string|null;aggregateType:string;aggregateId:string;requestId:string|null;availableAt:string};
type Page={items:Event[];total:number;backlog:number;nextCursor:string|null};
const eventLabels:Record<string,string>={AUTH_SESSION_CREATED:'登录账号',AUTH_SESSION_REVOKED:'退出登录',AUTH_REFRESH_TOKEN_ROTATED:'续期登录状态',AUTH_REFRESH_TOKEN_REUSE_DETECTED:'检测到重复登录凭证',AUTH_CHALLENGE_ISSUED:'申请身份验证码',AUTH_CREDENTIAL_RECOVERED:'恢复账号凭证',STUDENT_SIGN_IN_CHALLENGE_CONSUMED:'完成学生邮箱验证',STUDENT_SESSION_ESTABLISHED:'学生登录',EMAIL_VERIFICATION_CHALLENGE_ISSUED:'申请邮箱验证',USER_EMAIL_VERIFIED:'完成邮箱验证',STUDENT_IDENTITY_CREATED:'创建学生身份',ENROLLMENT_REMOVED:'移出教学班',COURSE_CREATED:'创建课程',COURSE_UPDATED:'更新课程',COURSE_STATUS_CHANGED:'变更课程状态',CLASS_SECTION_CLOSED:'关闭教学班',COURSE_INVITE_ROTATED:'更新入班邀请',EXERCISE_SESSION_RECONCILED:'恢复运动记录',EXERCISE_SESSION_RECONCILIATION_REQUIRED:'运动记录待恢复',EXEMPTION_APPLICATION_CHANGED:'更新免测申请',FEEDBACK_CREATED:'提交问题反馈',NOTIFICATION_READ:'阅读通知',USER_PREFERENCES_UPDATED:'更新个人偏好',PUSH_DEVICE_REVOKED:'取消设备通知',ROSTER_IMPORT_RECEIVED:'导入学生名单',ROSTER_ALIGNMENT_COMPLETED:'完成名单核对',ROSTER_ALIGNMENT_FAILED:'名单核对失败',ROSTER_VERSION_ROLLED_BACK:'恢复名单版本',LOCATION_CONSENT_CHANGED:'变更定位授权',LOCATION_PRIVACY_POLICY_CHANGED:'更新定位隐私设置',LOCATION_RETENTION_APPLIED:'处理到期定位记录',EXERCISE_RECORD_DRAFT_CREATED:'创建打卡草稿',EXERCISE_RECORD_DRAFT_UPDATED:'更新打卡草稿',EXERCISE_RECORD_DISCARDED:'放弃打卡草稿',EXERCISE_RECORD_CREATED:'创建打卡记录',EXERCISE_RECORD_SUBMITTED:'提交打卡凭证',EXERCISE_RECORD_UPDATED:'更新打卡记录',EXERCISE_RECORD_REVIEWED:'审核打卡记录',EXERCISE_SESSION_STARTED:'开始运动',EXERCISE_SESSION_COMPLETED:'完成运动',ENROLLMENT_CREATED:'加入教学班',CLASS_SECTION_CREATED:'创建教学班',CLASS_SECTION_UPDATED:'修改教学班',USER_CREATED:'创建账号',USER_UPDATED:'更新账号'};
export function AdminOutbox({locale}:{locale:AdminLocale}){
  const [page,setPage]=useState<Page|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<UserFacingError|null>(null);
  const [status,setStatus]=useState(''),[eventType,setEventType]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState('');
  const [cursor,setCursor]=useState<string|undefined>(),[history,setHistory]=useState<(string|undefined)[]>([]);
  const [revision,setRevision]=useState(0);
  const sequence=useRef(0),zh=locale==='zh';
  const labels:Record<string,string>={PENDING:zh?'尚未消费':'Not consumed',PROCESSING:zh?'处理中':'Processing',PROCESSED:zh?'已消费':'Consumed',FAILED:zh?'处理失败':'Processing failed'};
  useEffect(()=>{
    const current=++sequence.current;
    setBusy(true);setError(null);
    const query=new URLSearchParams({limit:'25'});
    if(status)query.set('status',status);if(eventType.trim())query.set('eventType',eventType.trim());if(cursor)query.set('cursor',cursor);
    if(from)query.set('from',new Date(from).toISOString());if(to)query.set('to',new Date(to).toISOString());
    void request<Page>(`/health/admin/outbox?${query}`).then(value=>{if(sequence.current===current)setPage(value);})
      .catch(failure=>{if(sequence.current===current)setError(toUserFacingError(failure,locale));})
      .finally(()=>{if(sequence.current===current)setBusy(false);});
    return()=>{sequence.current++;};
  },[status,eventType,from,to,cursor,revision,locale]);
  const change=(action:()=>void)=>{setCursor(undefined);setHistory([]);setPage(null);action();};
  const missing=zh?'未记录':'Not recorded';
  return <section className="admin-surface admin-outbox" aria-label={zh?'业务事件详情':'Business event details'}>
    <h3>{zh?'当前组织业务事件':'Current organization business events'}</h3>
    <p>{zh?'这里记录已发生的业务操作。事件消费状态是后台技术状态，不是管理员待办；“尚未消费”不表示原操作失败或邮件未发送。需要审核的打卡请进入打卡审核，需要回复的问题请进入问题反馈。若事件显示处理失败，请将详情中的诊断编号提供给维护人员。':'Backlog counts pending and retry-pending events, not unsent email. Terminal failure is not inferred without a recorded terminal outcome.'}</p>
    <div className="admin-outbox-filters">
      <label>{zh?'状态':'Status'}<select value={status} onChange={e=>change(()=>setStatus(e.target.value))}><option value="">{zh?'全部':'All'}</option>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label>{zh?'事件类型':'Event type'}<input value={eventType} maxLength={128} onChange={e=>change(()=>setEventType(e.target.value))}/></label>
      <label>{zh?'创建时间从':'Created from'}<input type="datetime-local" value={from} onChange={e=>change(()=>setFrom(e.target.value))}/></label>
      <label>{zh?'创建时间至':'Created to'}<input type="datetime-local" value={to} onChange={e=>change(()=>setTo(e.target.value))}/></label>
      <button type="button" disabled={busy} onClick={()=>change(()=>setRevision(value=>value+1))}>{zh?'刷新':'Refresh'}</button>
    </div>
    {error&&<ErrorPanel error={error} locale={locale}/>}
    {busy&&<p role="status">{zh?'正在查询…':'Loading…'}</p>}
    {page&&<><p>{zh?`当前组织未消费或失败事件 ${page.backlog} 条；筛选结果 ${page.total} 条。`:`Organization backlog: ${page.backlog}; matching events: ${page.total}.`}</p>
      <div className="table-scroll"><table><thead><tr>{(zh?['时间','操作人','做了什么','操作反馈','事件消费状态','详情']:['Time','Actor','Action','Outcome','Processing','Details']).map(label=><th key={label}>{label}</th>)}</tr></thead>
      <tbody>{page.items.map(event=><tr key={event.id}><td>{new Date(event.createdAt).toLocaleString(locale)}</td><td><strong>{event.actor?.actorName??(zh?'未记录操作人':'Actor not recorded')}</strong><small className="table-sub">{event.actor?.actorRole==='STUDENT'?(zh?'学生':'Student'):event.actor?.actorRole==='TEACHER'?(zh?'教师':'Teacher'):event.actor?.actorRole==='ADMIN'?(zh?'管理员':'Administrator'):''} {event.actor?.actorNumber}</small><small className="table-sub">{event.actor?.actorEmail}</small></td><td>{(zh?eventLabels[event.eventType]??eventLabels[event.eventType.replace(/_V\d+$/,'')]:null)??event.eventType}</td><td>{event.actor?.operationOutcome==='SUCCEEDED'?(zh?'操作成功':'Succeeded'):event.actor?.operationOutcome==='FAILED'?(zh?'操作失败':'Failed'):event.actor?.operationOutcome??(zh?'未记录':'Not recorded')}</td><td>{labels[event.status]??event.status}{event.lastErrorCode&&<small className="table-sub">{event.lastErrorCode}</small>}</td><td><details><summary>{zh?'查看详情':'Details'}</summary><p>{event.eventType}</p><p>{event.aggregateType}: {event.aggregateId}</p><p>{zh?'尝试 / 重试':'Attempts / retries'}: {event.attempts} / {event.retryCount}</p><p>{zh?'诊断编号':'Diagnostic ID'}: {event.requestId??missing}</p><p>{zh?'最近处理':'Last processed'}: {event.lastProcessedAt?new Date(event.lastProcessedAt).toLocaleString(locale):missing}</p></details></td></tr>)}</tbody></table></div>
      {!page.items.length&&<p>{zh?'没有符合条件的事件。':'No events match the filters.'}</p>}
      <button type="button" disabled={busy||!history.length} onClick={()=>{setCursor(history.at(-1));setHistory(value=>value.slice(0,-1));}}>{zh?'上一页':'Previous'}</button>
      <button type="button" disabled={busy||!page.nextCursor} onClick={()=>{setHistory(value=>[...value,cursor]);setCursor(page.nextCursor??undefined);}}>{zh?'下一页':'Next'}</button>
    </>}
  </section>;
}
