"use client";
import {useEffect,useRef,useState} from 'react';
import {AdminDialog,AdminField} from './admin-components';
import {ErrorPanel} from './error-panel';
import {ApiError,getMe,toUserFacingError,type UserFacingError} from './api-client';
import type {AdminLocale,StudentProfileProjection} from './admin-types';
import {createStudentUpdateBatch,readStudentUpdateBatch,runStudentUpdateBatch,updateJournalKey,type StudentBatchAction,type StudentUpdateBatch} from './student-update-batch';

export function AdminStudentBulkUpdate({selection,ownerId,locale,close}:{selection:{action:StudentBatchAction;students:StudentProfileProjection[]}|null;ownerId:string;locale:AdminLocale;close:()=>void}) {
  const [batch,setBatch]=useState<StudentUpdateBatch|null>(null),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[stopping,setStopping]=useState(false),[initialized,setInitialized]=useState(false),[blocked,setBlocked]=useState(false);
  const [error,setError]=useState<UserFacingError|null>(null);
  const active=useRef(false),running=useRef(false),stop=useRef(false);
  const zh=locale==='zh';
  useEffect(()=>{active.current=true;stop.current=false;try{setBatch(readStudentUpdateBatch(sessionStorage.getItem(updateJournalKey(ownerId)),ownerId));}catch{setBlocked(true);}setInitialized(true);return()=>{active.current=false;stop.current=true;};},[ownerId]);
  const uncertain=batch?.items.some(i=>i.status==='unconfirmed')??false;
  useEffect(()=>{if(!busy&&!uncertain)return;const prevent=(e:BeforeUnloadEvent)=>e.preventDefault();window.addEventListener('beforeunload',prevent);return()=>window.removeEventListener('beforeunload',prevent);},[busy,uncertain]);
  if (!selection&&!batch) return null;
  const action=batch?.action??selection!.action,targets=batch?.items.map(i=>i.student)??selection!.students;
  const eligible=batch?.items.filter(i=>['pending','unconfirmed'].includes(i.status)).length??targets.filter(s=>action==='profile'||(!!s.enrollmentCapacitySemesterId&&(s.maximumActiveEnrollments??1)<2)).length;
  const save=(value:StudentUpdateBatch)=>sessionStorage.setItem(updateJournalKey(ownerId),JSON.stringify(value));
  async function execute(){
    if(running.current||!initialized||blocked||(!batch&&!reason.trim()))return;
    running.current=true;stop.current=false;setBusy(true);setStopping(false);setError(null);
    try{
      const me=await getMe();if(me.user.id!==ownerId||me.user.role!=='ADMIN')throw new ApiError(403,{code:'PERMISSION_DENIED'});
      if(stop.current)return;
      const intent=batch??createStudentUpdateBatch(ownerId,action,targets,reason);
      save(intent);setBatch(intent);
      await runStudentUpdateBatch(intent,{save,stopped:()=>stop.current,changed:()=>{if(active.current)setBatch({...intent,items:[...intent.items]});}});
    }catch(failure){if(active.current)setError(toUserFacingError(failure,locale));}
    finally{running.current=false;if(active.current)setBusy(false);}
  }
  function finish(){if(running.current||uncertain)return;try{sessionStorage.removeItem(updateJournalKey(ownerId));}catch(failure){setError(toUserFacingError(failure,locale));return;}setBatch(null);setReason('');setError(null);setBlocked(false);close();}
  const itemsById=new Map(batch?.items.map(item=>[item.student.id,item])??[]);
  const labels={pending:zh?'未处理':'Pending',unconfirmed:zh?'结果待确认':'Unconfirmed',succeeded:zh?'已完成':'Completed',failed:zh?'失败，请刷新后核对':'Failed; refresh and review',skipped:zh?'跳过':'Skipped'};
  return <AdminDialog wide locale={locale} title={action==='profile'?(zh?'批量要求重新完善':'Require profile correction in bulk'):(zh?'批量开放第二个班级':'Allow a second class in bulk')} description={zh?`已固定所选 ${targets.length} 名学生。`:`Fixed selection of ${targets.length} students.`} close={finish} footer={<>
    {busy?<button className="secondary-button" type="button" disabled={stopping} onClick={()=>{stop.current=true;setStopping(true);}}>{stopping?(zh?'正在停止…':'Stopping…'):(zh?'停止后续处理':'Stop after current request')}</button>:<button className="secondary-button" type="button" disabled={uncertain} onClick={finish}>{batch?(zh?'完成并刷新':'Finish and refresh'):(zh?'取消':'Cancel')}</button>}
    {eligible>0&&<button className="primary-button" type="button" disabled={busy||blocked||!initialized||(!batch&&!reason.trim())} onClick={()=>void execute()}>{busy?(zh?'处理中…':'Processing…'):batch?(uncertain?(zh?'核对结果并继续':'Check result and continue'):(zh?'继续未处理学生':'Continue pending students')):(zh?`确认处理 ${eligible} 人`:`Confirm ${eligible} students`)}</button>}
  </>}>
    <p>{action==='profile'?(zh?'所选学生将需要重新完善个人资料后才能打卡。以下原因将向学生展示。':'Selected students must correct their profiles before checking in. The reason is shown to students.'):(zh?'仅开放各学生当前学期的第二个班级名额，学生仍需通过老师的邀请码入班。已开放或无当前学期的学生会跳过。':'Allows a second class in each student’s current semester. Students still join using their teacher’s invitation. Already-open students or those without a current semester are skipped.')}</p>
    <AdminField locale={locale} label={zh?'统一原因':'Reason for all selected students'} required><textarea maxLength={200} disabled={busy||!!batch} value={batch?.reason??reason} onChange={e=>setReason(e.target.value)}/></AdminField>
    <ErrorPanel error={error} locale={locale}/>
    {blocked&&<p role="alert">{zh?'无法读取已保存的处理记录，请先核对本窗口之前的操作。':'Saved progress could not be read. Review earlier operations in this tab.'}</p>}
    {batch&&<p role="status" aria-live="polite">{zh?`已完成 ${batch.items.filter(i=>i.status==='succeeded').length} 人，失败 ${batch.items.filter(i=>i.status==='failed').length} 人，跳过 ${batch.items.filter(i=>i.status==='skipped').length} 人，待处理或确认 ${eligible} 人。`:`Completed: ${batch.items.filter(i=>i.status==='succeeded').length}; failed: ${batch.items.filter(i=>i.status==='failed').length}; skipped: ${batch.items.filter(i=>i.status==='skipped').length}; pending: ${eligible}.`}</p>}
    {uncertain&&!busy&&<p role="alert">{zh?'有结果尚未确认，后续处理已暂停。请点击“核对结果并继续”，会使用同一请求编号核对，已完成的学生不会重复处理。':'An unconfirmed result paused processing. Retry with the same request key; completed students are not repeated.'}</p>}
    <div className="table-wrap"><table className="admin-table admin-bulk-update-table"><thead><tr><th>{zh?'学号':'Student number'}</th><th>{zh?'姓名':'Name'}</th><th>{zh?'结果':'Result'}</th></tr></thead><tbody>{targets.map(s=>{const item=itemsById.get(s.id);const skip=action==='second-class'?(!s.enrollmentCapacitySemesterId?'NO_SEMESTER':(s.maximumActiveEnrollments??1)>=2?'ALREADY_OPEN':null):null;return <tr key={s.id}><td>{s.studentNumber}</td><td>{s.fullName}</td><td>{item?labels[item.status]:skip?labels.skipped:labels.pending}{(item?.note??skip)==='NO_SEMESTER'?(zh?' · 无当前学期':' · No current semester'):(item?.note??skip)==='ALREADY_OPEN'?(zh?' · 已开放':' · Already open'):item?.note?<small className="table-sub">{item.note}</small>:null}</td></tr>;})}</tbody></table></div>
  </AdminDialog>;
}
