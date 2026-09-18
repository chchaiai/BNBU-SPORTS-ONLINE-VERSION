"use client";
import {useEffect,useRef,useState} from "react";
import {apiSessionUserId,currentApiSessionEpoch,request,requestWithMeta,toUserFacingError,type UserFacingError} from "./api-client";
import {ErrorPanel} from './error-panel';
export type NotificationTarget={id:string;targetType:string;targetId:string};
type Notice={id:string;recipientUserId:string;notificationType:string;title:string;body:string;targetType:string|null;targetId:string|null;createdAt:string;readAt:string|null};
const routes:Record<string,Record<string,string>>={teacher:{FEEDBACK:"support",EXERCISE_RECORD:"checkins",REVIEW_RECORD:"checkins",EXEMPTION_APPLICATION:"exemptions",CLASS_SECTION:"courses",COURSE:"courses",ENROLLMENT:"roster",OFFICIAL_ROSTER_IMPORT:"roster",SETTLEMENT_REPORT:"courses"},admin:{FEEDBACK:"support",CLASS_SECTION:"courses",COURSE:"courses",SYSTEM_POLICY:"system",USER:"accounts"}};
export function PortalNotifications({role,locale,onNavigate,onChanged}:{role:"teacher"|"admin";locale:"zh"|"en";onNavigate:(route:string,target:NotificationTarget)=>void;onChanged:()=>void}){
 const [items,setItems]=useState<Notice[]>([]),[cursor,setCursor]=useState<string|null>(null),[unread,setUnread]=useState(false);
 const [busy,setBusy]=useState(true),[error,setError]=useState<UserFacingError|null>(null);
 const live=useRef(true),locked=useRef(false),keys=useRef(new Map<string,string>()),epoch=currentApiSessionEpoch(),actor=apiSessionUserId();
 const valid=()=>live.current&&epoch===currentApiSessionEpoch();
 const text=(zh:string,en:string)=>locale==="en"?en:zh;
 const run=async(action:()=>Promise<void>)=>{if(locked.current)return;locked.current=true;setBusy(true);setError(null);try{await action();}catch(failure){if(valid())setError(toUserFacingError(failure,locale));}finally{locked.current=false;if(valid())setBusy(false);}};
 const load=async(more=false,filter=unread)=>{
  const query=new URLSearchParams({limit:"20",unreadOnly:String(filter)});if(more&&cursor)query.set("cursor",cursor);
  const response=await requestWithMeta<Notice[]>(`/notifications?${query}`),page=response.meta?.pagination;
  if(!Array.isArray(response.data)||response.data.some(item=>item.recipientUserId!==actor)||!page||page.hasMore&&!page.nextCursor)throw new Error("通知返回内容不完整，请重试。");
  if(!valid())return;setItems(current=>more?[...current,...response.data.filter(item=>!current.some(old=>old.id===item.id))]:response.data);setCursor(page.nextCursor??null);setUnread(filter);
 };
 useEffect(()=>{live.current=true;void run(()=>load());return()=>{live.current=false;};},[]);
 const read=async(item:Notice)=>{
  if(item.readAt)return;
  if(!keys.current.has(item.id))keys.current.set(item.id,crypto.randomUUID());
  const saved=await request<Notice>(`/notifications/${item.id}/read`,{method:"POST",body:{},headers:{"Idempotency-Key":keys.current.get(item.id)!}});
  if(saved.id!==item.id||saved.recipientUserId!==actor||!saved.readAt)throw new Error("通知已读状态未确认，请重试。");
  if(!valid())return;setItems(current=>unread?current.filter(row=>row.id!==item.id):current.map(row=>row.id===saved.id?saved:row));onChanged();
 };
 return <div className="portal-notifications" aria-busy={busy} aria-label={text("我的通知","My notifications")}>
  <div className="notification-actions">
   <button type="button" className="secondary-button" disabled={busy} aria-pressed={!unread} onClick={()=>void run(()=>load(false,false))}>{text("全部通知","All notifications")}</button>
   <button type="button" className="secondary-button" disabled={busy} aria-pressed={unread} onClick={()=>void run(()=>load(false,true))}>{text("未读通知","Unread notifications")}</button>
   <button type="button" className="text-button" disabled={busy} onClick={()=>void run(()=>load())}>{text("刷新通知","Refresh notifications")}</button>
  </div>
  {error&&<ErrorPanel error={error} locale={locale}/>} {busy&&<p role="status">{text("正在加载通知…","Loading notifications…")}</p>}
  {!busy&&!error&&!items.length&&<div className="notification-empty" role="status"><span aria-hidden="true">✓</span><h3>{unread?text("暂无未读通知","You're all caught up"):text("暂无业务通知","No notifications yet")}</h3><p>{unread?text("所有已收到的通知均已读，可切换到全部通知查看。","Switch to all notifications to view previous updates."):text("有新的审核、课程或业务消息时，会显示在这里。","New review, course and account updates will appear here.")}</p></div>}
  {items.map(item=><article className={`notification-card ${item.readAt?"is-read":"is-unread"}`} key={item.id} data-notification-id={item.id}>
   <h3>{item.title}</h3><p>{item.body}</p><p>{new Date(item.createdAt).toLocaleString(locale==="zh"?"zh-CN":"en-GB")} · {item.readAt?text("已读","Read"):text("未读","Unread")}</p>
   <div className="notification-actions">
    {!item.readAt&&<button type="button" className="text-button" disabled={busy} onClick={()=>void run(()=>read(item))}>{text("标记已读","Mark as read")}</button>}
    {item.targetId&&item.targetType&&routes[role][item.targetType]&&<button type="button" className="text-button" disabled={busy} onClick={()=>void run(async()=>{await read(item);if(valid())onNavigate(routes[role][item.targetType!],{id:item.id,targetType:item.targetType!,targetId:item.targetId!});})}>{text("打开相关业务","Open related work")}</button>}
   </div>
  </article>)}
  {cursor&&<button type="button" className="secondary-button" disabled={busy} onClick={()=>void run(()=>load(true))}>{text("加载更多通知","Load more notifications")}</button>}
 </div>;
}
