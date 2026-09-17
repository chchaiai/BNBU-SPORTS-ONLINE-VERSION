"use client";
import { useEffect, useRef, useState } from "react";
import { ApiError, apiSessionUserId, currentApiSessionEpoch, request, requestFormData, toUserFacingError, formatUserFacingError } from "./api-client";

type Purpose = "ROSTER" | "PHYSICAL";
type Field = "studentNumber" | "name" | "runType" | "elapsed" | "testedOn";
type Values = Partial<Record<Field, string>>;
type Row = { id: string; source: { pageId: string; sourceRow: number; attempt: number; tableIndex: number; evidence: Partial<Record<Field,number[]>> }; values: Values; reviewedAgainstSource: boolean; ocrIssues: {field: Field; code: string}[] };
type Draft = { version: number; rows: Row[] };
type Batch = { id: string; purpose: Purpose; createdAt: string; pages: {id: string; latestAttempt: {attempt: number; outcome: string; errorCode: string | null} | null}[] };
type Cell = {text: string; rowStart: number; rowEnd: number; columnStart: number; confidence: number | null};
type Recognition = { latestAttempt: {attempt: number; outcome: string; evidence: {tables: {cells: Cell[]}[]} | null} | null };
type Selection = {pageId: string; attempt: number; tableIndex: number; headerRow: number; columns: Partial<Record<Field, number>>; enabled: boolean};
type Confirmation = {pendingCount: number; rows: {rowId: string; issues: string[]; confirmed: boolean; currentResultVersion: number}[]};
type Intent = {path: string; key: string; body: unknown};
const labels: Record<Field, string> = {studentNumber: "学号", name: "姓名", runType: "项目", elapsed: "用时", testedOn: "测试日期"};
const issues: Record<string, string> = {OCR_PROVIDER_PERMISSION_DENIED:"识别服务鉴权失败，请联系总管理员检查云角色权限与凭据", OCR_PROVIDER_RATE_LIMITED:"识别请求过于频繁，请稍后重试", OCR_PROVIDER_QUOTA_EXCEEDED:"识别服务额度不足，请联系总管理员检查资源包", OCR_NO_TABLE_DETECTED:"未识别到表格，请上传清晰、完整的表格图片", OCR_EMPTY_TABLE:"表格中未识别到文字，请重新拍摄后上传", OCR_EXECUTION_FAILED:"识别任务执行失败，请稍后重试或联系管理员",OCR_PROVIDER_IMAGE_SIZE_LIMIT:"单页图片无损处理后仍超过识别服务限制，请拆分拍摄并上传新批次", OCR_PROVIDER_IMAGE_INVALID:"图片无法安全解码，请使用清晰的单页静态图片重新上传", OCR_PROVIDER_IMAGE_FORMAT_UNSUPPORTED:"图片格式不受支持，请改用PNG或JPEG", OCR_PROVIDER_NOT_CONFIGURED:"识别服务尚未配置，请联系管理员", OCR_PROVIDER_TIMEOUT:"识别服务超时，可稍后重新识别", OCR_PROVIDER_UNAVAILABLE:"识别服务暂不可用，可稍后重试",SOURCE_REVIEW_REQUIRED:"尚未对照原图核对", PHYSICAL_TEST_EXEMPT:"学生已免测", STUDENT_NOT_FOUND:"学号未匹配本班学生", DUPLICATE_STUDENT_NUMBER:"学号重复", NAME_MISMATCH:"姓名与学号不一致", ELAPSED_INVALID:"用时不明确，请填写分:秒", RUN_TYPE_MISMATCH:"项目与学生性别不符", MERGED_OR_INVALID_CELL_SPAN:"合并或错位单元格", LOW_CONFIDENCE:"可信度较低", MISSING_CELL:"缺少单元格"};
const optional = async <T,>(path: string): Promise<T | null> => {try {return await request<T>(path);}catch(e){if(e instanceof ApiError && e.status===404)return null;throw e;}};

/** All recognized text remains an editable draft until the teacher confirms it. */
export function OcrImportPanel({courseId, purpose, onSaved}: {courseId: string; purpose: Purpose; onSaved?: ()=>void}) {
 const fields: Field[] = purpose === "ROSTER" ? ["studentNumber", "name"] : ["studentNumber", "name", "runType", "elapsed", "testedOn"];
 const [batch, setBatch] = useState<Batch|null>(null), [batches,setBatches]=useState<{id:string;purpose:Purpose;createdAt:string}[]>([]),[cursor,setCursor]=useState<string|null>(null);
 const [draft,setDraft]=useState<Draft|null>(null),[rows,setRows]=useState<Row[]>([]),[recognitions,setRecognitions]=useState<Record<string,Recognition>>({}),[selections,setSelections]=useState<Selection[]>([]);
 const [confirmation,setConfirmation]=useState<Confirmation|null>(null),[formal,setFormal]=useState(false),[selected,setSelected]=useState<string[]>([]),[dirty,setDirty]=useState(false);
 const [files,setFiles]=useState<File[]>([]),[source,setSource]=useState<{pageId:string;url:string}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState(""),[pending,setPending]=useState(false),[uploadPending,setUploadPending]=useState(false);
 const mounted=useRef(false),locked=useRef(false),epoch=currentApiSessionEpoch();
 const storageKey=`bnbu:ocr:${apiSessionUserId()}:${courseId}:${purpose}`,valid=()=>mounted.current&&epoch===currentApiSessionEpoch();
 const run=async(action:()=>Promise<void>)=>{if(locked.current)return;locked.current=true;setBusy(true);setError("");setMessage("");try{await action();}catch(e){if(valid())setError(formatUserFacingError(e));}finally{locked.current=false;if(valid())setBusy(false);}};
 const list=async(more=false)=>{const data=await request<{items:typeof batches;nextBeforeId:string|null}>(`/class-sections/${courseId}/ocr-batches?limit=100${more&&cursor?`&beforeId=${cursor}`:""}`);if(valid()){setBatches(old=>more?[...old,...data.items]:data.items);setCursor(data.nextBeforeId);}};
 const load=async(id:string)=>{
  const next=await request<Batch>(`/ocr-batches/${id}`);if(next.purpose!==purpose)throw new Error("请选择对应用途的识别批次。");
  const nextDraft=await optional<Draft>(`/ocr-batches/${id}/draft`);
  const nextConfirmation=purpose==="PHYSICAL"&&nextDraft?await request<Confirmation>(`/ocr-batches/${id}/physical-confirmations`):null;
  const nextFormal=purpose==="ROSTER"?await optional<{id:string}>(`/ocr-batches/${id}/roster-confirmation`):null;
  const evidence=await Promise.all(next.pages.map(async page=>[page.id,await request<Recognition>(`/ocr-batches/${id}/pages/${page.id}/recognition`)] as const));
  if(!valid())return;
  setBatch(next);setDraft(nextDraft);setRows(nextDraft?.rows??[]);setConfirmation(nextConfirmation);setFormal(!!nextFormal);setSelected([]);setDirty(false);setSource(null);
  setRecognitions(Object.fromEntries(evidence));setSelections(evidence.flatMap(([pageId,r])=>(r.latestAttempt?.evidence?.tables??[]).map((table,tableIndex)=>({pageId,attempt:r.latestAttempt!.attempt,tableIndex,headerRow:Math.min(...table.cells.map(c=>c.rowStart)),columns:{},enabled:false}))));
  sessionStorage.setItem(storageKey+":batch",id);
 };
 const mutate=async(path:string,body:unknown)=>{
  const saved=sessionStorage.getItem(storageKey+":intent");const intent:Intent=saved?JSON.parse(saved):{path,body,key:crypto.randomUUID()};
  if(saved&&(intent.path!==path||JSON.stringify(intent.body)!==JSON.stringify(body)))throw new Error("上次操作结果待确认，请先重试原操作。");
  sessionStorage.setItem(storageKey+":intent",JSON.stringify(intent));setPending(true);
  try{await request(intent.path,{method:"POST",body:intent.body,headers:{"Idempotency-Key":intent.key}});if(valid()){sessionStorage.removeItem(storageKey+":intent");setPending(false);}}
  catch(e){if(valid()&&e instanceof ApiError&&e.status>=400&&e.status<500&&e.code!=="CONFLICT_REQUEST_IN_PROGRESS"){sessionStorage.removeItem(storageKey+":intent");setPending(false);}throw e;}
 };
 useEffect(()=>{mounted.current=true;void run(async()=>{setPending(!!sessionStorage.getItem(storageKey+":intent"));setUploadPending(!!sessionStorage.getItem(storageKey+":upload"));await list();const id=sessionStorage.getItem(storageKey+":batch");if(id)await load(id);});return()=>{mounted.current=false;};},[storageKey]);
 const upload=async()=>{
  if(!files.length||files.length>1000||files.some(f=>!f.size||!["image/png","image/jpeg","image/webp"].includes(f.type))||files.reduce((n,f)=>n+f.size,0)>104857600)throw new Error("请选择 PNG、JPEG 或 WebP 图片，批次总量不超过100 MB。");
  const fingerprint=JSON.stringify(await Promise.all(files.map(async f=>({size:f.size,type:f.type,sha256:Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",await f.arrayBuffer()))).map(n=>n.toString(16).padStart(2,"0")).join("")}))));
  const saved=sessionStorage.getItem(storageKey+":upload"),intent=saved?JSON.parse(saved):{fingerprint,key:crypto.randomUUID()};
  if(intent.fingerprint!==fingerprint)throw new Error("上次上传结果待确认，请重新选择同批图片，按原顺序重试。");
  sessionStorage.setItem(storageKey+":upload",JSON.stringify(intent));setUploadPending(true);
  const form=new FormData();files.forEach(f=>form.append("pages",f));
  let result:{id:string};
  try{result=await requestFormData<{id:string}>(`/class-sections/${courseId}/ocr-${purpose.toLowerCase()}-batches`,form,{method:"POST",headers:{"Idempotency-Key":intent.key}});}
  catch(e){if(valid()&&e instanceof ApiError&&e.status>=400&&e.status<500&&e.code!=="CONFLICT_REQUEST_IN_PROGRESS"){sessionStorage.removeItem(storageKey+":upload");setUploadPending(false);}throw e;}
  if(!valid())return;sessionStorage.removeItem(storageKey+":upload");setUploadPending(false);await load(result.id);await list();setFiles([]);setMessage("原图已保存，请开始识别。识别结果需要人工核对。");
 };
 const saveDraft=async()=>{if(!batch||!draft)return;const edits=rows.filter(row=>!confirmation?.rows.find(r=>r.rowId===row.id)?.confirmed);if(!edits.length)return;await mutate(`/ocr-batches/${batch.id}/draft/revisions`,{expectedVersion:draft.version,rows:edits.map(({id,values,reviewedAgainstSource})=>({id,values,reviewedAgainstSource}))});await load(batch.id);setMessage("核对草稿已保存，尚未形成正式数据。");};
 const patchRow=(id:string,change:Partial<Row>)=>{setRows(current=>current.map(row=>row.id===id?{...row,...change}:row));setDirty(true);setSelected([]);};
 return <details className="form-grid" data-ocr-purpose={purpose}><summary>{purpose==="ROSTER"?"纸质名单图片识别与核对":"体测成绩单图片识别与核对"}</summary>
  <p>支持 PNG、JPEG、WebP，批次总量最多100 MB、最多500个人员行。请保留表头并逐页核对原图；用时填写分:秒，日期填写 YYYY-MM-DD。</p>
  {uploadPending&&<p role="status">上次上传结果待确认，请按原顺序选择同批图片重试。</p>}
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  <fieldset disabled={busy||pending} className="form-grid"><label>选择待识别图片<input aria-label="选择OCR图片" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={e=>setFiles(Array.from(e.target.files??[]))}/></label>
  <button type="button" className="secondary-button" disabled={!files.length} onClick={()=>void run(upload)}>上传识别图片</button>
  <label>已有识别批次<select aria-label="已有识别批次" value={batch?.id??""} onChange={e=>{if(e.target.value)void run(()=>load(e.target.value));}}><option value="">选择批次</option>{batches.filter(b=>b.purpose===purpose).map(b=><option key={b.id} value={b.id}>{new Date(b.createdAt).toLocaleString()} · {b.id.slice(-8)}</option>)}</select></label>
  {cursor&&<button type="button" className="text-button" onClick={()=>void run(()=>list(true))}>加载更早识别批次</button>}
  {batch&&<button type="button" className="text-button" onClick={()=>void run(()=>load(batch.id))}>刷新识别和草稿</button>}
  </fieldset>
  {pending&&<button type="button" className="secondary-button" disabled={busy} onClick={()=>void run(async()=>{const saved=JSON.parse(sessionStorage.getItem(storageKey+":intent")??"null") as Intent|null;if(!saved)return;await mutate(saved.path,saved.body);if(batch)await load(batch.id);onSaved?.();setMessage("原操作结果已确认。");})}>重试原OCR操作</button>}
  {batch&&<fieldset disabled={busy||pending} className="form-grid"><p>批次 {batch.id} · {batch.pages.length} 页</p>{batch.pages.map((page,index)=><div key={page.id}>
   <p>第 {index+1} 页 · {page.latestAttempt?.outcome==="SUCCEEDED"?"已识别":page.latestAttempt?.outcome==="FAILED"?"识别失败":"尚未完成识别"}{page.latestAttempt?.errorCode?`（${issues[page.latestAttempt.errorCode]??page.latestAttempt.errorCode}）`:""}</p>
   <button type="button" className="text-button" onClick={()=>void run(async()=>{const data=await request<{mimeType:string;fileBase64:string}>(`/ocr-batches/${batch.id}/pages/${page.id}/source`);if(valid())setSource({pageId:page.id,url:`data:${data.mimeType};base64,${data.fileBase64}`});})}>查看第 {index+1} 页原图</button>
   {!draft&&<button type="button" className="secondary-button" onClick={()=>void run(async()=>{await mutate(`/ocr-batches/${batch.id}/pages/${page.id}/recognition`,{expectedAttempt:page.latestAttempt?.attempt??0});await load(batch.id);setMessage("识别任务已受理，请稍后刷新查看结果。");})}>{page.latestAttempt?"重新识别":"开始识别"}第 {index+1} 页</button>}
   {!draft&&selections.filter(s=>s.pageId===page.id).map(s=>{const table=recognitions[page.id]?.latestAttempt?.evidence?.tables[s.tableIndex];const change=(patch:Partial<Selection>)=>setSelections(old=>old.map(item=>item.pageId===s.pageId&&item.tableIndex===s.tableIndex?{...item,...patch}:item));return <section key={s.tableIndex} aria-label={`第${index+1}页第${s.tableIndex+1}张识别表`}>
    <label><input type="checkbox" checked={s.enabled} onChange={e=>change({enabled:e.target.checked})}/>采用第 {s.tableIndex+1} 张表</label>
    <label>表头行（从1开始）<input aria-label={`第${index+1}页表${s.tableIndex+1}表头行`} type="number" min="1" value={s.headerRow+1} onChange={e=>change({headerRow:Number(e.target.value)-1})}/></label>
    {fields.map(field=><label key={field}>{labels[field]}所在列<select aria-label={`第${index+1}页表${s.tableIndex+1}${labels[field]}列`} value={s.columns[field]??""} onChange={e=>change({columns:{...s.columns,[field]:Number(e.target.value)}})}><option value="" disabled>请选择</option>{Array.from(new Set(table?.cells.map(c=>c.columnStart))).sort((a,b)=>a-b).map(col=><option key={col} value={col}>第 {col+1} 列 · {table?.cells.find(c=>c.rowStart===s.headerRow&&c.columnStart===col)?.text??"无表头"}</option>)}</select></label>)}
    <details><summary>查看识别单元格及可信度</summary>{table?.cells.map((c,i)=><p key={i}>行 {c.rowStart+1} 列 {c.columnStart+1}：{c.text} · {c.confidence??"未知"}%</p>)}</details>
   </section>;})}
  </div>)}
  {source&&<img src={source.url} alt={`OCR核对原图第${batch.pages.findIndex(p=>p.id===source.pageId)+1}页`} style={{maxWidth:"100%",height:"auto"}}/>}
  {!draft&&selections.length>0&&<button type="button" className="primary-button" onClick={()=>void run(async()=>{const chosen=selections.filter(s=>s.enabled);if(batch.pages.some(p=>!chosen.some(s=>s.pageId===p.id))||chosen.some(s=>fields.some(f=>!Number.isInteger(s.columns[f]))))throw new Error("请为每页选择识别表，并指定所有必要字段列。");let totalRows=0;for(const selection of chosen){if(!Number.isSafeInteger(selection.headerRow)||selection.headerRow<0||new Set(fields.map(f=>selection.columns[f])).size!==fields.length)throw new Error("请核对表头行，各字段必须使用不同的列。");const table=recognitions[selection.pageId]?.latestAttempt?.evidence?.tables[selection.tableIndex];const occupied=new Set<number>();for(const cell of table?.cells??[]){const start=Math.max(selection.headerRow+1,cell.rowStart),end=Math.max(cell.rowEnd,cell.rowStart+1);if(end-start>500)throw new Error("本批次超过500个人员行，请拆分后重新上传。");for(let row=start;row<end;row++){occupied.add(row);if(occupied.size+totalRows>500)throw new Error("本批次超过500个人员行，请拆分后重新上传。");}}totalRows+=occupied.size;}await mutate(`/ocr-batches/${batch.id}/draft`,{expectedVersion:0,selections:chosen.map(({enabled,...s})=>s)});await load(batch.id);})}>创建待核对草稿</button>}
  {draft&&<><p>草稿 v{draft.version} · {rows.length} 行 · {formal?"官方名单已确认":purpose==="PHYSICAL"?`仍有 ${confirmation?.pendingCount??rows.length} 行待处理`:"尚未确认官方名单"}</p>
   {rows.map((row,index)=>{const state=confirmation?.rows.find(r=>r.rowId===row.id),readOnly=formal||!!state?.confirmed;return <section key={row.id} data-ocr-row={row.id} className="form-grid"><h4>第 {index+1} 行 · 原图第 {batch.pages.findIndex(p=>p.id===row.source.pageId)+1} 页，第 {row.source.sourceRow+1} 行{state?.confirmed?" · 已保存正式体测":""}</h4>
    {row.ocrIssues.length>0&&<p role="note">识别疑点：{row.ocrIssues.map(i=>`${labels[i.field]} ${issues[i.code]??i.code}`).join("；")}，请对照原图核对。</p>}
    {fields.map(field=><label key={field}>{labels[field]}{recognitions[row.source.pageId]?.latestAttempt?.attempt===row.source.attempt&&(row.source.evidence[field]??[]).some(i=>{const c=recognitions[row.source.pageId]?.latestAttempt?.evidence?.tables[row.source.tableIndex]?.cells[i];return c?.confidence===null||(c?.confidence??100)<80;})&&<strong> · 识别可信度不足，请重点核对</strong>}<input aria-label={`草稿第${index+1}行${labels[field]}`} value={row.values[field]??""} disabled={readOnly} onChange={e=>patchRow(row.id,{values:{...row.values,[field]:e.target.value},reviewedAgainstSource:false})}/></label>)}
    <label><input type="checkbox" aria-label={`第${index+1}行已对照原图核对`} checked={row.reviewedAgainstSource} disabled={readOnly||source?.pageId!==row.source.pageId} onChange={e=>patchRow(row.id,{reviewedAgainstSource:e.target.checked})}/>已对照本页原图核对</label>
    {!dirty&&state?.issues.length? <p role="alert">{state.issues.map(i=>issues[i]??i).join("；")}</p>:null}
    {purpose==="PHYSICAL"&&!readOnly&&<label><input type="checkbox" aria-label={`选择第${index+1}行保存体测`} checked={selected.includes(row.id)} disabled={dirty||!state||state.issues.length>0} onChange={e=>setSelected(old=>e.target.checked?[...old,row.id]:old.filter(id=>id!==row.id))}/>选择保存正式体测</label>}
   </section>;})}
   {!formal&&<button type="button" className="secondary-button" disabled={!dirty} onClick={()=>void run(saveDraft)}>保存核对草稿</button>}
   {purpose==="ROSTER"&&!formal&&<button type="button" className="primary-button" disabled={dirty||rows.some(row=>!row.reviewedAgainstSource)} onClick={()=>void run(async()=>{await mutate(`/ocr-batches/${batch.id}/roster-confirmation`,{expectedDraftVersion:draft.version});await load(batch.id);onSaved?.();setMessage("官方名单快照已确认。未创建账号或课程成员。");})}>确认官方名单快照</button>}
   {purpose==="PHYSICAL"&&<button type="button" className="primary-button" disabled={dirty||!selected.length} onClick={()=>void run(async()=>{await mutate(`/ocr-batches/${batch.id}/physical-confirmations`,{expectedDraftVersion:draft.version,selections:selected.map(rowId=>({rowId,expectedResultVersion:confirmation!.rows.find(r=>r.rowId===rowId)!.currentResultVersion}))});await load(batch.id);onSaved?.();setMessage("所选行已保存正式体测，未选中的行继续待处理。");})}>确认所选体测（{selected.length} 行）</button>}
  </>}
  </fieldset>}
 </details>;
}
