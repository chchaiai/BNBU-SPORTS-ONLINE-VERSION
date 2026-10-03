"use client";
import { useRef, useState } from 'react';
import { ApiError, request, toUserFacingError } from './api-client';
import type { UserFacingError } from './api-client';
import type { StudentProfileProjection, AdminLocale } from './admin-types';
import { AdminDialog, AdminField } from './admin-components';
import { ErrorPanel } from './error-panel';

export function StudentSecondClass({student,locale,close,completed}:{student:StudentProfileProjection;locale:AdminLocale;close:()=>void;completed:()=>Promise<void>}) {
  const [reason,setReason]=useState('');
  const [busy,setBusy]=useState(false);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState<UserFacingError|null>(null);
  const intent=useRef<{key:string;body:{expectedVersion:number;secondClassSemesterId:string;secondClassReason:string}}|null>(null);
  const submitting=useRef(false),zh=locale==='zh';
  async function save(){
    if(submitting.current || !reason.trim() || !student.enrollmentCapacitySemesterId)return;
    intent.current??={key:crypto.randomUUID(),body:{expectedVersion:student.version,secondClassSemesterId:student.enrollmentCapacitySemesterId,secondClassReason:reason.trim()}};
    submitting.current=true;setBusy(true);setPending(true);setError(null);
    try {
      const updated=await request<StudentProfileProjection>(`/students/${encodeURIComponent(student.id)}`,{method:'PATCH',headers:{'Idempotency-Key':intent.current.key},body:intent.current.body});
      if(updated.id!==student.id || updated.maximumActiveEnrollments!==2)throw new Error('Second class permission was not confirmed');
      intent.current=null;setPending(false);await completed();
    }catch(failure){
      if(failure instanceof ApiError && failure.status>=400 && failure.status<500){intent.current=null;setPending(false)}
      setError(toUserFacingError(failure,locale));
    }finally{submitting.current=false;setBusy(false)}
  }
  return <AdminDialog locale={locale} title={zh?'开放第二个班级':'Allow a second class'} description={`${student.fullName} · ${student.studentNumber}`} close={()=>{if(!busy&&!pending)close()}}
    footer={<><button type="button" className="secondary-button" disabled={busy||pending} onClick={close}>{zh?'取消':'Cancel'}</button><button type="button" className="primary-button" disabled={busy||!reason.trim()||!student.enrollmentCapacitySemesterId} onClick={()=>void save()}>{busy?(zh?'保存中…':'Saving…'):pending?(zh?'重试确认结果':'Retry confirmation'):(zh?'确认开放':'Allow second class')}</button></>}>
    <p>{zh?'仅本学期有效，最多同时加入两个班级。学生通过老师的邀请码加入第二个班，并在学生端切换；两个班的打卡、学时和申请各自独立。':'For this semester only, the student may join up to two classes using instructor invitations and switch between them. Check-ins, progress and applications remain separate.'}</p>
    <p>{zh?`当前已加入 ${student.activeEnrollmentCount??0} 个班级。`:`Currently enrolled in ${student.activeEnrollmentCount??0} classes.`}</p>
    <AdminField locale={locale} label={zh?'开放原因':'Reason'} required><input aria-label={zh?'开放原因':'Reason'} value={reason} maxLength={200} disabled={busy||pending} onChange={event=>setReason(event.target.value)} /></AdminField>
    {error&&<ErrorPanel error={error} locale={locale}/>}
  </AdminDialog>;
}
