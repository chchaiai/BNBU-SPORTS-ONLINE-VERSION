"use client";
import {useEffect,useRef,useState} from 'react';
import {ApiError,apiSessionUserId,currentApiSessionEpoch,request,toUserFacingError} from './api-client';
type Section={id:string;status:string;version:number};
type Intent={key:string;body:{reason:string;expectedVersion:number}};
export function CourseClosure({classSectionId,onClosed,archived=false}:{classSectionId:string;onClosed:()=>void;archived?:boolean}){
 const [section,setSection]=useState<Section|null>(null),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false),[pending,setPending]=useState(false),[busy,setBusy]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('');
 const mounted=useRef(true),locked=useRef(false),epoch=currentApiSessionEpoch();
 const valid=()=>mounted.current&&epoch===currentApiSessionEpoch();
 const path=`/class-sections/${classSectionId}`,storageKey=`bnbu:course-close:${apiSessionUserId()}:${classSectionId}`;
 const load=async()=>{const result=await request<Section>(path);if(valid()){setSection(result);setPending(sessionStorage.getItem(storageKey)!==null);}};
 const run=async(action:()=>Promise<void>)=>{if(locked.current)return;locked.current=true;setBusy(true);setError('');try{await action();}catch(failure){if(valid())setError(toUserFacingError(failure,'zh').message);}finally{locked.current=false;if(valid())setBusy(false);}};
 useEffect(()=>{mounted.current=true;void run(load);return()=>{mounted.current=false;};},[classSectionId]);
 const close=async()=>{
  let intent:Intent;const stored=sessionStorage.getItem(storageKey);
  if(stored){intent=JSON.parse(stored);if(!intent.key||!Number.isSafeInteger(intent.body?.expectedVersion)||typeof intent.body.reason!=='string'||!intent.body.reason.trim()){setError('关闭请求恢复记录异常，请联系管理员核查。');return;}}
  else{if(!section||!confirmed||!reason.trim()){setError('请填写关闭原因并确认业务影响。');return;}intent={key:crypto.randomUUID(),body:{reason:reason.trim(),expectedVersion:section.version}};sessionStorage.setItem(storageKey,JSON.stringify(intent));setPending(true);}
  try{const result=await request<Section>(path+'/close',{method:'POST',body:intent.body,headers:{'Idempotency-Key':intent.key}});if(valid()){sessionStorage.removeItem(storageKey);setPending(false);setSection(result);setMessage('课程已关闭，全部在课学生已移出，关闭前合法业务仍可继续处理。');onClosed();}}
  catch(failure){if(valid()&&failure instanceof ApiError&&[409,422].includes(failure.status)){sessionStorage.removeItem(storageKey);setPending(false);await load();}throw failure;}
 };
 const closed=archived||(section&&['CLOSED','ARCHIVED'].includes(section.status));
 return <section aria-label="课程关闭" className="course-target-section">
  <h3>课程关闭</h3><p>关闭后自动移出全部在课学生，停止新入班、新运动和新申请。关闭前合法业务继续按原期限处理，审核、补证及结算仍需完成。</p>
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  {closed&&!pending?<p>{archived||section?.status==='ARCHIVED'?'课程已归档，仅保留历史查询和旧事实更正。':'课程已关闭，仍可处理原有待办和结算。'}</p>:<>
   <label htmlFor="course-close-reason">关闭原因<textarea id="course-close-reason" maxLength={1000} value={reason} disabled={busy||pending} onChange={event=>setReason(event.target.value)}/></label>
   <label><input type="checkbox" checked={confirmed} disabled={busy||pending} onChange={event=>setConfirmed(event.target.checked)}/>我已确认关闭影响，继续处理关闭前的合法业务</label>
   {pending&&<p>上次关闭结果待确认，将按原请求重试。</p>}
   <button className="secondary-button" type="button" disabled={busy||!section||(!pending&&(!confirmed||!reason.trim()))} onClick={()=>void run(close)}>{pending?'重试原关闭请求':'确认关闭课程'}</button>
  </>}
  <button className="text-button" type="button" disabled={busy} onClick={()=>void run(load)}>刷新关闭状态</button>
 </section>;
}
