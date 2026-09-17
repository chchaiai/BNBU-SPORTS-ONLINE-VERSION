"use client";
import "./course-operations.css";

import { useEffect, useRef, useState } from "react";
import { apiSessionUserId, currentApiSessionEpoch, request, toUserFacingError, formatUserFacingError, ApiError } from "./api-client";

type Check = { code: string; status: string; count: number | null };
type RosterRow = { id: string; studentNumber: string | null; fullName: string | null; status: string; pendingCount: number | null };
type Preview = { previewFingerprint: string; expectedVersion: number; canConfirm: boolean; checkedAt: string; checks: Check[];
  preview: { denominator: number; registrationComplete: boolean; rows: RosterRow[]; extras: RosterRow[] } };
type Report = { id: string; version: number; kind: string; createdAt: string; correctionReason: string | null };
type Intent = { key: string; input: { expectedVersion: number; previewFingerprint: string } };
const labels: Record<string,string> = {
  ACTIVE_SESSION: "尚未结束的运动", UNSUBMITTED_RECORD: "未提交记录", PENDING_REVIEW: "待审核记录",
  SUPPLEMENT_PENDING: "待补充材料", TECHNICAL_REVIEW: "技术复核", MATERIAL_PROCESSING: "材料处理中",
  OPEN_PLATFORM_INTERRUPTION: "尚未结束的平台中断", PENDING_APPLICATION: "待处理申请", ROSTER_PROCESSING: "名单处理中",
  ROSTER_ALIGNMENT_RUNNING: "名单核对处理中", PHYSICAL_IMPORT_PENDING: "体测导入待确认", ROSTER_PENDING_DIFFERENCE: "待处理名单差异",
  OCR_DRAFTS: "识别草稿待确认", CURRENT_ROSTER: "当前正式名单", CONFIRMED_OFFICIAL_ROSTER: "正式名单确认",
  ROSTER_IDENTITY_AMBIGUITY: "名单身份冲突", ROSTER_REGISTRATION_INCOMPLETE: "名单注册入班核对",
  RAW_PHYSICAL_RESULTS: "原始体测资料", PUBLISHED_COURSE_RULE: "课程规则发布", SETTLEMENT_SCHEDULE: "结算时间",
  CONFIRMED_COMPOSITE_ROSTER: "综合名单结算确认",
};
const statuses: Record<string,string> = { MATCHED: "已注册入班", PENDING_REGISTRATION: "待注册或入班", IDENTITY_CONFLICT: "身份冲突", EXTRA_IN_PLATFORM: "名单外已入班" };

const checkGuidance: Record<string,string> = {
  ACTIVE_SESSION:'请学生结束尚在进行的运动。', UNSUBMITTED_RECORD:'请提醒学生完成凭证上传并提交打卡。',
  PENDING_REVIEW:'到“打卡审核”处理待审核记录。', SUPPLEMENT_PENDING:'等待学生补交材料，并完成审核。',
  TECHNICAL_REVIEW:'请处理技术复核记录。', MATERIAL_PROCESSING:'凭证正在处理，完成后重新检查。',
  OPEN_PLATFORM_INTERRUPTION:'请管理员确认平台中断已结束。', PENDING_APPLICATION:'请审核免测、免打卡及运动抵扣申请。',
  CURRENT_ROSTER:'到“名单对齐”导入本课程正式名单。', CONFIRMED_OFFICIAL_ROSTER:'在“名单对齐”核对并确认正式名单。',
  ROSTER_IDENTITY_AMBIGUITY:'在名单中处理重复身份或匹配冲突。', ROSTER_REGISTRATION_INCOMPLETE:'核对正式名单中的学生是否完成注册入班。',
  RAW_PHYSICAL_RESULTS:'请核对并确认本课程原始体测资料。', SETTLEMENT_SCHEDULE:'到课程设定的结算时间后才能结算。',
  CONFIRMED_COMPOSITE_ROSTER:'待名单和资料齐备后，在下方核对综合名单并勾选确认。',
  ROSTER_PROCESSING:'等待名单处理完成。', ROSTER_ALIGNMENT_RUNNING:'等待名单对齐完成。',
  PHYSICAL_IMPORT_PENDING:'请确认已导入的体测结果。', ROSTER_PENDING_DIFFERENCE:'到“名单对齐”处理未确认的差异。',
  OCR_DRAFTS:'请核对并确认表格识别草稿。', PUBLISHED_COURSE_RULE:'请先保存并发布课程规则。',
};
export function CourseSettlement({ classSectionId }: { classSectionId: string }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [beforeVersion, setBeforeVersion] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const live = useRef(true);
  const scope = `/class-sections/${encodeURIComponent(classSectionId)}`;
  const storageKey = `bnbu:settlement:${apiSessionUserId()}:${classSectionId}`;
  const epoch = currentApiSessionEpoch();
  const valid = () => live.current && currentApiSessionEpoch() === epoch;
  const showError = (failure: unknown) => { if (valid()) setError(formatUserFacingError(failure)); };
  const load = async () => {
    const results = await Promise.allSettled([
      request<Preview>(`${scope}/settlement-preview`),
      request<{checks: Check[]}>(`${scope}/settlement-check`),
      request<{items:Report[];nextBeforeVersion:number|null}>(`${scope}/settlement-reports?limit=20`),
    ]);
    if (!valid()) return;
    setConfirmed(false);
    if (results[0].status === "fulfilled") { setPreview(results[0].value); setChecks(results[0].value.checks); }
    else { setPreview(null); showError(results[0].reason); }
    if (results[1].status === "fulfilled") setChecks(results[1].value.checks);
    else showError(results[1].reason);
    if (results[2].status === "fulfilled") { setReports(results[2].value.items); setBeforeVersion(results[2].value.nextBeforeVersion); }
    else showError(results[2].reason);
    setPending(sessionStorage.getItem(storageKey) !== null);
  };
  const run = async (action:()=>Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try { await action(); } catch(failure) { showError(failure); }
    finally { if (valid()) setBusy(false); }
  };
  useEffect(() => { live.current = true; void run(load); return () => { live.current = false; }; }, [classSectionId]); // Each course mounts its own state.
  const save = async () => {
    const saved = sessionStorage.getItem(storageKey);
    let intent: Intent;
    if (saved) {
      intent = JSON.parse(saved) as Intent;
      if (!intent.key || intent.input?.expectedVersion !== 0 || !/^[a-f0-9]{64}$/.test(intent.input?.previewFingerprint)) throw new Error("结算重试记录损坏，请联系管理员核查请求结果。");
    } else {
      if (!preview?.canConfirm || !confirmed) return;
      intent = { key:crypto.randomUUID(), input:{expectedVersion:preview.expectedVersion,previewFingerprint:preview.previewFingerprint} };
      sessionStorage.setItem(storageKey,JSON.stringify(intent));
      setPending(true);
    }
    try {
      const report = await request<Report>(`${scope}/settlement-reports`,{method:"POST",body:intent.input,headers:{"Idempotency-Key":intent.key}});
      if (!valid()) return;
      sessionStorage.removeItem(storageKey); setPending(false);
      await load(); setMessage(`结算报告 v${report.version} 已保存。`);
    } catch(failure) {
      if (failure instanceof ApiError && (failure.status===422 || ["CONFLICT_VERSION_MISMATCH","CONFLICT_STATE_TRANSITION"].includes(failure.code))) {
        sessionStorage.removeItem(storageKey); setPending(false); setConfirmed(false); setPreview(null);
      }
      throw failure;
    }
  };
  const download = async (version?:number) => {
    const file = await request<{fileName:string;contentType:string;fileBase64:string}>(version
      ? `${scope}/settlement-reports/${version}/export` : `${scope}/composite-roster/export`);
    if (!valid()) return;
    const bytes = Uint8Array.from(atob(file.fileBase64), value=>value.charCodeAt(0));
    if (!file.fileName.endsWith(".xlsx") || file.contentType !== "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || bytes[0]!==80 || bytes[1]!==75) throw new Error("导出文件格式异常，请重试。");
    const url = URL.createObjectURL(new Blob([bytes],{type:file.contentType}));
    const link = document.createElement("a"); link.href=url; link.download=file.fileName; link.click();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    setMessage(version ? `已生成结算报告 v${version} 下载。` : "已生成实时综合名单下载（未结算）。");
  };
  return <section className="course-ops" aria-label="课程结算">
    <div className="course-target-section-head"><div><h3>课程名单与结算</h3><p>先核对学生名单、处理待办，再保存本课程最终结算结果。需要当前名单时，可单独导出。</p></div></div>
    {error && <p className="course-ops-note" role="alert">{checks.length&&error==="当前状态不支持该操作。"?"结算条件尚未全部满足，请先处理下方待办。":error}</p>}{message && <p role="status">{message}</p>}
    <div className="dialog-actions">
      <button type="button" className="secondary-button" disabled={busy} onClick={()=>void run(load)}>检查结算条件</button>
      <button type="button" className="secondary-button" disabled={busy||!preview} onClick={()=>void run(()=>download())}>导出实时综合名单</button>
    </div>
    {checks.length>0 && <><div className="course-ops-summary"><strong>{preview?.canConfirm?'已满足结算条件':'还不能结算'}</strong><p className="course-ops-note">{checks.filter(check=>check.status!=='CLEAR').length} 项需要处理或确认；已完成 {checks.filter(check=>check.status==='CLEAR').length} 项。</p></div><h4>需要你关注</h4><ul className="course-ops-checks">{checks.filter(check=>check.status!=='CLEAR').map(check=><li key={check.code}><span>{labels[check.code]??check.code}<small>{checkGuidance[check.code]??"请完成此项后重新检查。"}</small></span><b>{check.status==='BLOCKED'?'待处理':'待确认'}{check.count!==null&&check.count>0?` · ${check.count}`:''}</b></li>)}</ul><details><summary>查看已通过的检查（{checks.filter(check=>check.status==='CLEAR').length}）</summary><ul className="course-ops-checks">{checks.filter(check=>check.status==='CLEAR').map(check=><li key={check.code}>{labels[check.code]??check.code}<span>已通过</span></li>)}</ul></details></>}
    {preview && <>
      <p>正式名单 {preview.preview.denominator} 人；注册入班核对{preview.preview.registrationComplete?"已完成":"未完成"}。预检时间：{new Date(preview.checkedAt).toLocaleString()}</p>
      <div className="table-scroll"><table><thead><tr><th>学号</th><th>姓名</th><th>名单状态</th><th>待办</th></tr></thead><tbody>
        {[...preview.preview.rows,...preview.preview.extras].map((row,index)=><tr key={`${row.id}-${index}`}><td>{row.studentNumber??"待确认"}</td><td>{row.fullName??"待确认"}</td><td>{statuses[row.status]??row.status}</td><td>{row.pendingCount??"待确认"}</td></tr>)}
      </tbody></table></div>
      {preview.canConfirm && <label><input type="checkbox" checked={confirmed} disabled={busy||pending} onChange={event=>setConfirmed(event.target.checked)}/>我已核对综合名单，确认保存结算快照</label>}
    </>}
    <button type="button" className="primary-button" disabled={busy||(!pending&&(!preview?.canConfirm||!confirmed))} onClick={()=>void run(save)}>{pending?"重试并查询结算结果":"确认课程结算"}</button>
    <h4>已保存的结算报告</h4>
    {!reports.length && <p>暂无已保存报告。</p>}
    {reports.map(report=><p key={report.id}>v{report.version} · {new Date(report.createdAt).toLocaleString()} · {report.correctionReason??"初版"} <button type="button" className="text-button" disabled={busy} onClick={()=>void run(()=>download(report.version))}>下载结算报告 v{report.version}</button></p>)}
    {beforeVersion!==null && <button type="button" className="text-button" disabled={busy} onClick={()=>void run(async()=>{
      const page=await request<{items:Report[];nextBeforeVersion:number|null}>(`${scope}/settlement-reports?limit=20&beforeVersion=${beforeVersion}`);
      if(valid()){setReports(current=>[...current,...page.items]);setBeforeVersion(page.nextBeforeVersion);}
    })}>加载更早报告</button>}
  </section>;
}
