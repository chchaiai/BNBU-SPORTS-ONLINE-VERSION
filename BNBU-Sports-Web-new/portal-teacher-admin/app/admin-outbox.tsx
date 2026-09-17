"use client";
import { useEffect, useRef, useState } from 'react';
import { request, toUserFacingError, type UserFacingError } from './api-client';
import { ErrorPanel } from './error-panel';
import type { AdminLocale } from './admin-types';

type Event={id:string;eventType:string;status:string;createdAt:string;lastProcessedAt:string|null;attempts:number;retryCount:number;
  lastErrorCode:string|null;aggregateType:string;aggregateId:string;requestId:string|null;availableAt:string};
type Page={items:Event[];total:number;backlog:number;nextCursor:string|null};
export function AdminOutbox({locale}:{locale:AdminLocale}){
  const [page,setPage]=useState<Page|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<UserFacingError|null>(null);
  const [status,setStatus]=useState('PENDING'),[eventType,setEventType]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState('');
  const [cursor,setCursor]=useState<string|undefined>(),[history,setHistory]=useState<(string|undefined)[]>([]);
  const [revision,setRevision]=useState(0);
  const sequence=useRef(0),zh=locale==='zh';
  const labels:Record<string,string>={PENDING:zh?'待处理':'Pending',PROCESSING:zh?'处理中':'Processing',PROCESSED:zh?'已成功':'Succeeded',FAILED:zh?'重试中（等待重试）':'Retry pending'};
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
    <p>{zh?'积压数量为待处理与等待重试事件之和，不代表未发送邮件。最终失败需有终止处理事实，现有记录不据此推断。':'Backlog counts pending and retry-pending events, not unsent email. Terminal failure is not inferred without a recorded terminal outcome.'}</p>
    <div className="admin-outbox-filters">
      <label>{zh?'状态':'Status'}<select value={status} onChange={e=>change(()=>setStatus(e.target.value))}><option value="">{zh?'全部':'All'}</option>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label>{zh?'事件类型':'Event type'}<input value={eventType} maxLength={128} onChange={e=>change(()=>setEventType(e.target.value))}/></label>
      <label>{zh?'创建时间从':'Created from'}<input type="datetime-local" value={from} onChange={e=>change(()=>setFrom(e.target.value))}/></label>
      <label>{zh?'创建时间至':'Created to'}<input type="datetime-local" value={to} onChange={e=>change(()=>setTo(e.target.value))}/></label>
      <button type="button" disabled={busy} onClick={()=>change(()=>setRevision(value=>value+1))}>{zh?'刷新':'Refresh'}</button>
    </div>
    {error&&<ErrorPanel error={error} locale={locale}/>}
    {busy&&<p role="status">{zh?'正在查询…':'Loading…'}</p>}
    {page&&<><p>{zh?`当前组织积压 ${page.backlog} 条；筛选结果 ${page.total} 条。`:`Organization backlog: ${page.backlog}; matching events: ${page.total}.`}</p>
      <div className="table-scroll"><table><thead><tr>{(zh?['事件类型 / 编号','状态','创建时间','最近处理时间','尝试 / 重试次数','失败原因 / 错误码','关联业务对象','诊断编号']:['Event / ID','Status','Created','Last processed','Attempts / retries','Failure / error code','Business object','Diagnostic ID']).map(label=><th key={label}>{label}</th>)}</tr></thead>
      <tbody>{page.items.map(event=><tr key={event.id}><td>{event.eventType}<small className="table-sub">{event.id}</small></td><td>{labels[event.status]??event.status}</td><td>{new Date(event.createdAt).toLocaleString(locale)}</td><td>{event.lastProcessedAt?new Date(event.lastProcessedAt).toLocaleString(locale):missing}</td><td>{event.attempts} / {event.retryCount}</td><td>{event.lastErrorCode??missing}</td><td>{event.aggregateType}<small className="table-sub">{event.aggregateId}</small></td><td>{event.requestId??missing}</td></tr>)}</tbody></table></div>
      {!page.items.length&&<p>{zh?'没有符合条件的事件。':'No events match the filters.'}</p>}
      <button type="button" disabled={busy||!history.length} onClick={()=>{setCursor(history.at(-1));setHistory(value=>value.slice(0,-1));}}>{zh?'上一页':'Previous'}</button>
      <button type="button" disabled={busy||!page.nextCursor} onClick={()=>{setHistory(value=>[...value,cursor]);setCursor(page.nextCursor??undefined);}}>{zh?'下一页':'Next'}</button>
    </>}
  </section>;
}
