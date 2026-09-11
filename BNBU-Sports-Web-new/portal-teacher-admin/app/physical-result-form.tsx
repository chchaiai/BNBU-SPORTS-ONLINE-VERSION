"use client";
import {OcrImportPanel} from "./ocr-import-panel";
import {useEffect,useRef,useState} from "react";
import {ApiError,apiSessionUserId,currentApiSessionEpoch,request,toUserFacingError} from "./api-client";
class PhysicalValidationError extends Error {}
type Result={version:number;runType:"800m"|"1000m";elapsedSeconds:number;testedOn:string};
type Intent={key:string;path:string;body:{expectedVersion:number;runType:string;elapsedSeconds:number;testedOn:string;correctionReason?:string}};
export function PhysicalResultForm({enrollmentId,courseId,gender,exempt,onSaved}:{enrollmentId:string;courseId:string;gender:string;exempt:boolean;onSaved:()=>void}){
 const [rows,setRows]=useState<Result[]>([]),[before,setBefore]=useState<number|null>(null),[settled,setSettled]=useState(false);
 const [minutes,setMinutes]=useState(""),[seconds,setSeconds]=useState(""),[date,setDate]=useState(""),[reason,setReason]=useState("");
 const [busy,setBusy]=useState(true),[error,setError]=useState(""),[message,setMessage]=useState(""),[pending,setPending]=useState(false),[loaded,setLoaded]=useState(false);
 const mounted=useRef(true),locked=useRef(false),epoch=currentApiSessionEpoch();
 const valid=()=>mounted.current&&epoch===currentApiSessionEpoch();
 const path=`/enrollments/${enrollmentId}/physical-results`,storageKey=`bnbu:physical:${apiSessionUserId()}:${enrollmentId}`;
 const runType=gender==="男"?"1000m":gender==="女"?"800m":null;
 const run=async(action:()=>Promise<void>)=>{if(locked.current)return;locked.current=true;setBusy(true);setError("");setMessage("");
  try{await action();}catch(failure){if(valid())setError(failure instanceof PhysicalValidationError?failure.message:toUserFacingError(failure,"zh").message);}finally{locked.current=false;if(valid())setBusy(false);}};
 const load=async()=>{
  const [history,reports]=await Promise.all([
   request<{items:Result[];nextBeforeVersion:number|null}>(`${path}?limit=20`),
   request<{items:unknown[]}>(`/class-sections/${courseId}/settlement-reports?limit=1`),
  ]);
  if(!valid())return;
  setRows(history.items);setBefore(history.nextBeforeVersion);setSettled(reports.items.length>0);setLoaded(true);
  setPending(sessionStorage.getItem(storageKey)!==null);
  const latest=history.items[0];
  setMinutes(latest?String(Math.floor(latest.elapsedSeconds/60)):"");setSeconds(latest?String(latest.elapsedSeconds%60):"");setDate(latest?.testedOn??"");
 };
 useEffect(()=>{mounted.current=true;void run(load);return()=>{mounted.current=false;};},[enrollmentId]);
 const save=async()=>{
  const stored=sessionStorage.getItem(storageKey);let intent:Intent;
  if(stored){intent=JSON.parse(stored);if(!intent.key||![path,path+'/corrections'].includes(intent.path)||!Number.isSafeInteger(intent.body?.expectedVersion))throw new PhysicalValidationError("体测恢复记录异常，请联系管理员核查。");}
  else{
   if(!loaded||!runType||exempt)throw new PhysicalValidationError("请先核对学生体测项目及免测状态。");
   if(!/^\d+$/.test(minutes)||!/^\d+$/.test(seconds)||Number(seconds)>59||!date)throw new PhysicalValidationError("请填写非负整数分钟、0–59 秒以及实际测试日期。");
   const elapsedSeconds=Number(minutes)*60+Number(seconds);if(!Number.isSafeInteger(elapsedSeconds))throw new PhysicalValidationError("体测用时超出范围。");
   if(settled&&!reason.trim())throw new PhysicalValidationError("结算后的体测更正必须填写原因。");
   intent={key:crypto.randomUUID(),path:path+(settled?'/corrections':''),body:{expectedVersion:rows[0]?.version??0,runType,elapsedSeconds,testedOn:date,...(settled?{correctionReason:reason.trim()}:{})}};
   sessionStorage.setItem(storageKey,JSON.stringify(intent));setPending(true);
  }
  try{
   await request(intent.path,{method:"POST",body:intent.body,headers:{"Idempotency-Key":intent.key}});
   if(!valid())return;sessionStorage.removeItem(storageKey);setPending(false);await load();setMessage("原始体测资料已保存，历史版本已保留。");onSaved();
  }catch(failure){
   if(failure instanceof ApiError&&(failure.status===422||["CONFLICT_VERSION_MISMATCH","CONFLICT_STATE_TRANSITION"].includes(failure.code))){sessionStorage.removeItem(storageKey);setPending(false);setLoaded(false);}
   throw failure;
  }
 };
 return <section aria-label="原始体测资料" className="form-grid">
  <OcrImportPanel courseId={courseId} purpose="PHYSICAL" onSaved={()=>{void run(load);onSaved();}}/>
  <h3>原始体测资料</h3><p>{exempt?"该学生已免测。":runType?`${runType} · 填写实际测试用时和日期。`:"学生项目待核对，请先完善身份资料。"}</p>
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  <div className="form-grid two-columns">
   <label htmlFor="physical-minutes">分钟<input id="physical-minutes" type="number" min="0" step="1" value={minutes} disabled={busy||pending||exempt} onChange={event=>setMinutes(event.target.value)}/></label>
   <label htmlFor="physical-seconds">秒<input id="physical-seconds" type="number" min="0" max="59" step="1" value={seconds} disabled={busy||pending||exempt} onChange={event=>setSeconds(event.target.value)}/></label>
  </div>
  <label htmlFor="physical-tested-on">实际测试日期<input id="physical-tested-on" type="date" value={date} disabled={busy||pending||exempt} onChange={event=>setDate(event.target.value)}/></label>
  {settled&&<label htmlFor="physical-correction-reason">结算后更正原因<textarea id="physical-correction-reason" maxLength={1000} value={reason} disabled={busy||pending} onChange={event=>setReason(event.target.value)}/></label>}
  {pending&&<p>上次保存结果待确认，重试将提交原请求。</p>}
  <button type="button" className="secondary-button" disabled={busy||(!pending&&(!loaded||!runType||exempt))} onClick={()=>void run(save)}>{pending?"重试原体测保存":"保存原始体测"}</button>
  <button type="button" className="text-button" disabled={busy} onClick={()=>void run(load)}>刷新体测资料</button>
  {rows.map(row=><p key={row.version} data-physical-version={row.version}>v{row.version} · {row.runType} · {Math.floor(row.elapsedSeconds/60)} 分 {row.elapsedSeconds%60} 秒 · {row.testedOn}</p>)}
  {before!==null&&<button type="button" className="text-button" disabled={busy} onClick={()=>void run(async()=>{const page=await request<{items:Result[];nextBeforeVersion:number|null}>(`${path}?limit=20&beforeVersion=${before}`);if(valid()){setRows(current=>[...current,...page.items]);setBefore(page.nextBeforeVersion);}})}>加载更早体测记录</button>}
 </section>;
}
