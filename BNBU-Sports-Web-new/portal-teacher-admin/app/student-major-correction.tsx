"use client";
import { useRef, useState } from 'react';
import { request, toUserFacingError, formatUserFacingError } from './api-client';
import type { StudentProfileProjection, AdminLocale } from './admin-types';

export function StudentMajorCorrection({student,locale,onSaved}:{student:StudentProfileProjection;locale:AdminLocale;onSaved:()=>void}) {
  const [college,setCollege]=useState(student.collegeName??'');
  const [major,setMajor]=useState(student.majorName??'');
  const [reason,setReason]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const lock=useRef(false);
  const zh=locale==='zh';
  async function save(){
    if(lock.current || !reason.trim() || !major.trim())return;
    lock.current=true;setBusy(true);setMessage('');
    try{await request(`/students/${student.id}`,{method:'PATCH',body:{collegeName:college,majorName:major.trim(),majorCorrectionReason:reason.trim(),expectedVersion:student.version}});onSaved();}
    catch(error){setMessage(formatUserFacingError(error,locale));}
    finally{lock.current=false;setBusy(false);}
  }
  return <section className="admin-surface"><h3>{zh?'纠正学生专业':'Correct student major'}</h3>
    <p>{zh?'纠正会保留审计记录，不恢复学生已使用的自主确认机会。':'Corrections are audited and do not restore a used student confirmation opportunity.'}</p>
    <label>{zh?'学院':'College'}<select value={college} disabled={busy} onChange={event=>setCollege(event.target.value)}>{['FBM','FHSS','FST','SCC','SAI','SGE','GS'].map(value=><option key={value}>{value}</option>)}</select></label>
    <label>{zh?'专业代码或未分流':'Major code or 未分流'}<input maxLength={200} value={major} disabled={busy} onChange={event=>setMajor(event.target.value)}/></label>
    <label>{zh?'纠正原因':'Reason for correction'}<input maxLength={200} value={reason} disabled={busy} onChange={event=>setReason(event.target.value)}/></label>
    <button type="button" className="primary-button" disabled={busy||!reason.trim()||!major.trim()} onClick={()=>void save()}>{zh?'保存专业纠正':'Save major correction'}</button>
    {message&&<p role="alert">{message}</p>}
  </section>;
}
