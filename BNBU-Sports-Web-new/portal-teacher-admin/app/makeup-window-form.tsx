"use client";
import {useEffect,useRef,useState} from "react";
import {ApiError,apiSessionUserId,currentApiSessionEpoch,request,toUserFacingError, formatUserFacingError} from "./api-client";
type Grant={id:string;enrollmentId:string;version:number;startsAt:string;endsAt:string;windowState:string;revocation:{reason:string}|null};
type Rules={version:number;published_at:string|null;regular_deadline:string;closing_deadline:string};
type Intent={key:string;path:string;body:Record<string,unknown>};
const states:Record<string,string>={SCHEDULED:"尚未开始",OPEN:"可开始补练",ENDED:"已结束",REVOKED:"已撤销"};
export function MakeupWindowForm({courseId,enrollmentId,onBusyChange}:{courseId:string;enrollmentId:string;onBusyChange:(busy:boolean)=>void}){
 const [rules,setRules]=useState<Rules|null>(null),[items,setItems]=useState<Grant[]>([]);
 const [starts,setStarts]=useState(""),[ends,setEnds]=useState(""),[reason,setReason]=useState("");
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState(""),[pending,setPending]=useState(false);
 const mounted=useRef(true),locked=useRef(false),epoch=currentApiSessionEpoch();
 const valid=()=>mounted.current&&epoch===currentApiSessionEpoch();
 const key=`bnbu:makeup:${apiSessionUserId()}:${enrollmentId}`;
 useEffect(()=>{onBusyChange(busy);},[busy,onBusyChange]);
 const run=async(action:()=>Promise<void>)=>{
  if(locked.current)return;locked.current=true;setBusy(true);setError("");setMessage("");
  try{await action();}catch(failure){if(valid())setError(formatUserFacingError(failure));}
  finally{locked.current=false;if(valid())setBusy(false);}
 };
 const load=async()=>{
  const rule=await request<Rules>(`/class-sections/${courseId}/v81-rules`);
  const grants:Grant[]=[],seen=new Set<string>();let before:string|null=null;
  do{
   const page:{items:Grant[];nextBeforeId:string|null}=await request(`/class-sections/${courseId}/makeup-windows?limit=100${before?`&beforeId=${before}`:""}`);
   grants.push(...page.items.filter(item=>item.enrollmentId===enrollmentId));before=page.nextBeforeId;
   if(before&&seen.has(before))throw new Error("补练记录分页异常，请重试。");if(before)seen.add(before);
  }while(before);
  if(valid()){setRules(rule);setItems(grants);setPending(sessionStorage.getItem(key)!==null);}
 };
 useEffect(()=>{mounted.current=true;void run(load);return()=>{mounted.current=false;};},[courseId,enrollmentId]);
 const send=async(candidate?:Omit<Intent,"key">)=>{
  const stored=sessionStorage.getItem(key);
  if(!stored&&!candidate)throw new Error("没有待重试的操作。");
  const intent:Intent=stored?JSON.parse(stored):{...candidate!,key:crypto.randomUUID()};
  if(!intent.key||!intent.body||!(intent.path===`/class-sections/${courseId}/makeup-windows`||/^\/makeup-windows\/[a-f0-9-]{36}\/revocation$/.test(intent.path)))throw new Error("补练操作恢复记录异常，请联系管理员核查。");
  if(!stored){sessionStorage.setItem(key,JSON.stringify(intent));setPending(true);}
  try{
   await request(intent.path,{method:"POST",body:intent.body,headers:{"Idempotency-Key":intent.key}});
   if(!valid())return;
   sessionStorage.removeItem(key);setPending(false);await load();setMessage("补练操作已保存，记录已刷新。");
  }catch(failure){
   if(failure instanceof ApiError&&(failure.status===422||["CONFLICT_VERSION_MISMATCH","CONFLICT_STATE_TRANSITION","ENROLLMENT_NOT_ACTIVE"].includes(failure.code))){sessionStorage.removeItem(key);setPending(false);}
   throw failure;
  }
 };
 return <div>
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  <form id="makeup-window-form" onSubmit={event=>{event.preventDefault();void run(async()=>{
   if(pending)return send();
   if(!rules?.published_at)throw new Error("请先发布课程规则。");
   if(!starts||!ends)throw new Error("请填写补练开始和结束时间。");
   await send({path:`/class-sections/${courseId}/makeup-windows`,body:{enrollmentId,expectedRuleVersion:rules.version,startsAt:new Date(`${starts}:00+08:00`).toISOString(),endsAt:new Date(`${ends}:00+08:00`).toISOString()}});
  });}}>
   <p>补练授权须位于课程打卡起止日期内，不能延长打卡结束日期；已开始的运动可以继续提交材料。</p>
   <div className="form-grid two-columns">
    <label htmlFor="makeup-starts">开始时间（北京时间）<input id="makeup-starts" type="datetime-local" disabled={busy||pending} value={starts} onChange={event=>setStarts(event.target.value)}/></label>
    <label htmlFor="makeup-ends">结束时间（北京时间）<input id="makeup-ends" type="datetime-local" disabled={busy||pending} value={ends} onChange={event=>setEnds(event.target.value)}/></label>
   </div>
  </form>
  {busy&&<p role="status">正在处理补练操作…</p>}
  {pending&&<p>上次操作结果待确认，点击“确认授权 / 重试”将重试原操作。</p>}
  <button type="button" className="text-button" disabled={busy} onClick={()=>void run(load)}>刷新补练记录</button>
  <h4>该学生的补练授权</h4>
  {!items.length&&<p>暂无补练授权。</p>}
  {items.map(item=><div className="detail-card" key={item.id} data-makeup-window-id={item.id}>
   <p>{new Date(item.startsAt).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai"})} 至 {new Date(item.endsAt).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai"})} · {states[item.windowState]??item.windowState}</p>
   {item.revocation?<p>撤销原因：{item.revocation.reason}</p>:<button type="button" className="text-button" disabled={busy||pending||!reason.trim()} onClick={()=>void run(()=>send({path:`/makeup-windows/${item.id}/revocation`,body:{expectedVersion:item.version,reason}}))}>撤销本次补练授权</button>}
  </div>)}
  {items.some(item=>!item.revocation)&&<label htmlFor="makeup-revocation-reason">撤销原因<textarea id="makeup-revocation-reason" maxLength={1000} disabled={busy||pending} value={reason} onChange={event=>setReason(event.target.value)}/></label>}
 </div>;
}
