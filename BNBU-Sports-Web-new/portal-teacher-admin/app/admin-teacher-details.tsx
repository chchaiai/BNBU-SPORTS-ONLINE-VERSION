"use client";
import {useEffect,useState} from 'react';
import {request,formatUserFacingError} from './api-client';
type Details={id:string;fullName:string;remark:string;version:number};
export function AdminTeacherDetails({id,onSaved}:{id:string;onSaved:()=>void}) {
 const [data,setData]=useState<Details|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false);
 useEffect(()=>{let live=true;void request<Details>(`/admin/teachers/${id}/details`).then(d=>{if(live)setData(d);}).catch(e=>{if(live)setError(formatUserFacingError(e));});return()=>{live=false;};},[id]);
 return <form className="admin-surface" onSubmit={async e=>{e.preventDefault();if(!data)return;setBusy(true);setError('');setSaved(false);try{const d=await request<Details>(`/admin/teachers/${id}/details`,{method:'PATCH',body:{fullName:data.fullName.trim(),remark:data.remark,expectedVersion:data.version},headers:{'Idempotency-Key':crypto.randomUUID()}});setData(d);setSaved(true);onSaved();}catch(e){setError(formatUserFacingError(e));}finally{setBusy(false);}}}><h3>编辑教师资料</h3>{error&&<p role="alert">{error}</p>}{data?<><label>姓名<input required maxLength={100} value={data.fullName} disabled={busy} onChange={e=>{setSaved(false);setData({...data,fullName:e.target.value});}}/></label><label>管理员备注<textarea maxLength={1000} value={data.remark} disabled={busy} onChange={e=>{setSaved(false);setData({...data,remark:e.target.value});}}/></label><p>备注供有账号管理权限的管理员查看。</p><button className="primary-button" disabled={busy||!data.fullName.trim()}>{busy?'保存中…':'保存姓名和备注'}</button>{saved&&<p role="status">已保存。</p>}</>:!error&&<p>正在读取教师资料…</p>}</form>;
}
