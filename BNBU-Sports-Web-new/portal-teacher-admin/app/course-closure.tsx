"use client";
import {useEffect,useRef,useState} from 'react';
import {ApiError,apiSessionUserId,currentApiSessionEpoch,request,toUserFacingError} from './api-client';
type Section={id:string;status:string;version:number;displayName:string};
type Intent={key:string;body:{reason:string;expectedVersion:number;confirmationCourseName:string;confirmCourseRetirement:true}};
export function CourseClosure({classSectionId,onClosed,}:{classSectionId:string;onClosed:()=>void;archived?:boolean}){
 const [section,setSection]=useState<Section|null>(null),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false),[pending,setPending]=useState(false),[busy,setBusy]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState(''),[confirmationName,setConfirmationName]=useState(''),[reviewing,setReviewing]=useState(false);
 const mounted=useRef(true),locked=useRef(false),epoch=currentApiSessionEpoch();
 const valid=()=>mounted.current&&epoch===currentApiSessionEpoch();
 const path=`/class-sections/${classSectionId}`,storageKey=`bnbu:course-delete:${apiSessionUserId()}:${classSectionId}`;
 const load=async()=>{setPending(sessionStorage.getItem(storageKey)!==null);const result=await request<Section>(path);if(valid()){setSection(result);setPending(sessionStorage.getItem(storageKey)!==null);}};
 const run=async(action:()=>Promise<void>)=>{if(locked.current)return;locked.current=true;setBusy(true);setError('');try{await action();}catch(failure){if(valid())setError(toUserFacingError(failure,'zh').message);}finally{locked.current=false;if(valid())setBusy(false);}};
 useEffect(()=>{mounted.current=true;void run(load);return()=>{mounted.current=false;};},[classSectionId]);
 const close=async()=>{
  let intent:Intent;const stored=sessionStorage.getItem(storageKey);
  if(stored){intent=JSON.parse(stored);if(!intent.key||!Number.isSafeInteger(intent.body?.expectedVersion)||intent.body.confirmCourseRetirement!==true||typeof intent.body.confirmationCourseName!=='string'||typeof intent.body.reason!=='string'||!intent.body.reason.trim()){setError('删除请求恢复记录异常，请联系管理员核查。');return;}}
  else{if(!section||!confirmed||!reason.trim()||confirmationName.trim()!==section.displayName){setError('请填写删除原因并确认业务影响。');return;}intent={key:crypto.randomUUID(),body:{reason:reason.trim(),expectedVersion:section.version,confirmationCourseName:confirmationName.trim(),confirmCourseRetirement:true}};sessionStorage.setItem(storageKey,JSON.stringify(intent));setPending(true);}
  try{await request<Section>(path+'/delete',{method:'POST',body:intent.body,headers:{'Idempotency-Key':intent.key}});if(valid()){sessionStorage.removeItem(storageKey);setPending(false);setSection(null);setMessage('课程已移出当前列表，学生账号和全部历史记录已保留。');onClosed();}}
  catch(failure){if(valid()&&failure instanceof ApiError&&[409,422].includes(failure.status)){sessionStorage.removeItem(storageKey);setPending(false);await load();}throw failure;}
 };
 return <section aria-label="删除课程" className="course-target-section">
  <h3>删除课程</h3>
  <p>结束本课程及在课关系，保留学生账号、邮箱绑定、运动记录、审核、学时及照片视频。学生仍可查看本人历史。</p>
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  {!reviewing&&!pending?<button className="danger-button" type="button" disabled={busy||!section} onClick={()=>setReviewing(true)}>删除课程</button>:<>
   <h4>再次确认删除范围</h4><p>仅删除「{section?.displayName}」的当前课程关系。学生账号、全部历史及其他课程数据保留；没有班级的学生可重新扫码或输入邀请码进班。</p>
   <label htmlFor="course-delete-name">输入完整课程名称确认<input id="course-delete-name" value={confirmationName} disabled={busy||pending} onChange={event=>setConfirmationName(event.target.value)}/></label>
   <label htmlFor="course-delete-reason">删除原因<textarea id="course-delete-reason" maxLength={1000} value={reason} disabled={busy||pending} onChange={event=>setReason(event.target.value)}/></label>
   <label><input type="checkbox" checked={confirmed} disabled={busy||pending} onChange={event=>setConfirmed(event.target.checked)}/>我确认上述影响范围，并确认保留学生账号和全部历史</label>
   {pending&&<p>上次删除结果待确认，将按原请求重试。</p>}
   <button className="danger-button" type="button" disabled={busy||(!pending&&(!section||!confirmed||!reason.trim()||confirmationName.trim()!==section.displayName))} onClick={()=>void run(close)}>{pending?'重试原删除请求':'确认删除课程'}</button>
   {!pending&&<button className="secondary-button" type="button" disabled={busy} onClick={()=>setReviewing(false)}>取消</button>}
  </>}
 </section>;
}
