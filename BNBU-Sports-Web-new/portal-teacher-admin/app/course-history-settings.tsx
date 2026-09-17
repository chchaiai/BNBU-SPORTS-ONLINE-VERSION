"use client";
import "./course-operations.css";
import {useEffect,useState} from 'react';
import {request,toUserFacingError, formatUserFacingError} from './api-client';
type Settings={enabled:boolean;earliestDate:string;latestDate:string;version:number;semesterStartDate:string;semesterEndDate:string};
export function CourseHistorySettings({classSectionId}:{classSectionId:string}) {
 const [value,setValue]=useState<Settings|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{let live=true;void request<Settings>(`/class-sections/${classSectionId}/history-settings`).then(data=>{if(live)setValue(data);}).catch(error=>{if(live)setMessage(formatUserFacingError(error));});return()=>{live=false;};},[classSectionId]);
 async function save(){if(!value||busy)return;setBusy(true);setMessage('');try{
  const result=await request<{version:number}>(`/class-sections/${classSectionId}/history-settings`,{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},body:{enabled:value.enabled,earliestDate:value.earliestDate,latestDate:value.latestDate,expectedVersion:value.version}});
  setValue({...value,version:result.version});setMessage('历史补卡范围已保存。');
 }catch(error){setMessage(formatUserFacingError(error));}finally{setBusy(false);}}
 return <section className="course-ops" aria-label="历史补卡设置">
 <header className="course-ops-head"><div><h3>历史补卡</h3><p>允许学生补交过去完成的运动，提交凭证后仍须你审核。</p></div><span className={`course-ops-badge ${value?.enabled?'is-on':''}`}>{value?.enabled?'已开启':'未开启'}</span></header>
 {value&&<fieldset className="course-ops-fields" disabled={busy}>
 <label className="course-ops-toggle"><input type="checkbox" role="switch" checked={value.enabled} onChange={event=>setValue({...value,enabled:event.target.checked})}/><span><strong>允许学生补卡</strong><small>{value.enabled?'学生可在下方日期范围内选择历史运动。':'当前不接受新的历史补卡，开启后设置允许日期。'}</small></span></label>
 <div className="course-ops-dates">
 <label>最早可补日期<input type="date" disabled={!value.enabled} min={value.semesterStartDate} max={value.latestDate} value={value.earliestDate} onChange={event=>setValue({...value,earliestDate:event.target.value})}/></label>
 <label>最晚可补日期<input type="date" disabled={!value.enabled} min={value.earliestDate} max={value.semesterEndDate} value={value.latestDate} onChange={event=>setValue({...value,latestDate:event.target.value})}/></label>
 </div><p className="course-ops-note">可包含入班前的运动，但不能补今天或未来日期。新增补卡须在打卡结束日期前完成，已创建记录可继续提交材料；每日、每周次数按实际运动日期计算。</p>
 <footer className="course-ops-footer"><span>修改后请保存，学生端才会生效。</span><button type="button" className="secondary-button" onClick={()=>void save()}>{busy?'正在保存…':'保存补卡设置'}</button></footer></fieldset>}
 {message&&<p className="course-ops-note" role="status">{message}</p>}</section>;
}
