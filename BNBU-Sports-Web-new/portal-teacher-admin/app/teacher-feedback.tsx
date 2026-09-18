"use client";
import {useEffect,useRef,useState} from 'react';
import {ApiError,currentApiSessionEpoch,request,requestWithMeta,toUserFacingError} from './api-client';
import {FeedbackAttachmentError,FeedbackUploader,FeedbackAttachments,uploadFeedbackAttachment,type FeedbackAttachment} from './feedback-attachments';
import type {NotificationTarget} from './portal-notifications';
const categories={BUG:'功能异常',SUGGESTION:'功能建议',ACCESSIBILITY:'无障碍问题',PRIVACY:'隐私问题',OTHER:'其他'};
const statuses:Record<string,string>={OPEN:'待受理',IN_PROGRESS:'受理中',WAITING_TECH:'待技术团队处理',RESOLVED:'处理完成',CLOSED:'已关闭'};
type Ticket={id:string;category:keyof typeof categories;content:string;status:string;createdAt:string;publicReply:string|null};
type History={items:{id:string;publicReply:string;occurredAt:string}[]};
export function TeacherFeedback({mode,notificationTarget}:{mode:'real'|'demo';notificationTarget?:NotificationTarget|null}){
 const [tab,setTab]=useState<'new'|'history'>('new'),[category,setCategory]=useState<keyof typeof categories>('BUG'),[content,setContent]=useState('');
 const [attachments,setAttachments]=useState<FeedbackAttachment[]>([]),[items,setItems]=useState<Ticket[]>([]),[selected,setSelected]=useState<Ticket|null>(null),[history,setHistory]=useState<History|null>(null);
 const [uploading,setUploading]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState(''),[pending,setPending]=useState(false);
 const lock=useRef(false),live=useRef(true),intent=useRef<{body:object;key:string}|null>(null),epoch=currentApiSessionEpoch();
 const valid=()=>live.current&&epoch===currentApiSessionEpoch();
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 const run=async(action:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await action();}catch(failure){if(valid())setError(failure instanceof FeedbackAttachmentError ? failure.message : toUserFacingError(failure).message);}finally{lock.current=false;if(valid())setBusy(false);}};
 const load=async()=>{const all:Ticket[]=[];let cursor:string|null=null;do{
   const response: {data:Ticket[];meta?:{pagination?:{nextCursor?:string|null}}}=await requestWithMeta<Ticket[]>(`/feedback?limit=50${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`);all.push(...response.data);cursor=response.meta?.pagination?.nextCursor??null;
 }while(cursor);if(valid())setItems(all);};
 const open=async(item:Ticket)=>{const result=await request<History>(`/student/feedback/${item.id}/history`);if(valid()){setSelected(item);setHistory(result);}};
 useEffect(()=>{if(notificationTarget?.targetType==='FEEDBACK')void run(async()=>{setTab('history');await load();await open(await request<Ticket>(`/feedback/${notificationTarget.targetId}`));});},[notificationTarget]);
 const submit=()=>run(async()=>{
   if(!content.trim())throw new FeedbackAttachmentError('请填写问题描述。');
   intent.current??={body:{category,content:content.trim(),attachmentIds:attachments.map(item=>item.id),clientContext:{platform:'WEB'}},key:crypto.randomUUID()};setPending(true);
   try{await request('/feedback',{method:'POST',body:intent.current.body,headers:{'Idempotency-Key':intent.current.key}});intent.current=null;
     if(valid()){setPending(false);setContent('');setAttachments([]);setSuccess('反馈已提交至管理员，可在“我的反馈”查看回复。');}
   }catch(failure){if(failure instanceof ApiError&&[400,401,403,404,409,422].includes(failure.status)){intent.current=null;if(valid())setPending(false);}throw failure;}
 });
 return <div className="teacher-feedback"><div className="feedback-heading"><span className="eyebrow">服务与支持</span><h2>问题反馈</h2><p>描述遇到的问题，附上截图或录屏，管理员将在这里回复处理结果。</p></div>
 <div className="feedback-tabs"><button className={tab==='new'?'primary-button':'secondary-button'} onClick={()=>setTab('new')}>提交问题</button><button className={tab==='history'?'primary-button':'secondary-button'} disabled={busy||mode!=='real'} onClick={()=>{setTab('history');void run(load);}}>我的反馈</button></div>
 {mode!=='real'&&<p>请登录真实账号后提交反馈。</p>}{error&&<p className="feedback-alert" role="alert">{error}</p>}{success&&<p className="feedback-success" role="status">{success}</p>}
 {tab==='new'?<form className="feedback-compose" onSubmit={event=>{event.preventDefault();void submit();}}><fieldset disabled={busy||pending||mode!=='real'}><label>问题类型<select value={category} onChange={event=>setCategory(event.target.value as keyof typeof categories)}>{Object.entries(categories).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>问题描述<textarea value={content} maxLength={2000} rows={6} placeholder="请描述操作步骤、预期结果和实际情况…" onChange={event=>setContent(event.target.value)}/><small>{content.length} / 2000</small></label>
 <FeedbackUploader items={attachments} disabled={busy||pending||mode!=='real'} uploading={uploading} onRemove={id=>setAttachments(current=>current.filter(item=>item.id!==id))} onFiles={files=>{void run(async()=>{
   if(files.length+attachments.length>5)throw new FeedbackAttachmentError('每条反馈最多上传 5 个附件。');
   try{for(const [index,file] of files.entries()){setUploading(`正在上传 ${index+1}/${files.length} · ${file.name}`);const result=await uploadFeedbackAttachment(file);if(!valid())return;setAttachments(current=>[...current,result]);}}
   finally{if(valid())setUploading('');}
 });}}/></fieldset>
 <button className="primary-button" type="submit" disabled={busy||mode!=='real'}>{busy?'正在处理附件或提交…':pending?'重试提交':'提交问题'}</button></form>:<div className="feedback-history"><button className="text-button" disabled={busy} onClick={()=>void run(load)}>刷新处理状态</button>{items.length===0&&!busy&&<p>暂无反馈，提交的问题及回复将在这里显示。</p>}{items.map(item=><article key={item.id}><header><b>{categories[item.category]}</b><span>{statuses[item.status]}</span></header><p>{item.content}</p><small>{new Date(item.createdAt).toLocaleString('zh-CN')}</small><button className="text-button" disabled={busy} onClick={()=>void run(()=>open(item))}>查看附件与回复 →</button>{selected?.id===item.id&&<><FeedbackAttachments feedbackId={item.id}/>{history?.items.length?history.items.map(reply=><blockquote key={reply.id}><p>{reply.publicReply}</p><small>{new Date(reply.occurredAt).toLocaleString('zh-CN')}</small></blockquote>):<p>管理员尚未回复。</p>}</>}</article>)}</div>}
 </div>;
}
