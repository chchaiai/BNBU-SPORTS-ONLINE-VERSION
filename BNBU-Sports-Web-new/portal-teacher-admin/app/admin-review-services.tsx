"use client";

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { getAccountSecurity, request, toUserFacingError, type UserFacingError } from './api-client';
import { useAdminStore } from './admin-store';
import { AdminField } from './admin-components';
import { ErrorPanel } from './error-panel';
import { loadCourseDirectory } from './admin-course-directory-api';
import type { AdminLocale } from './admin-types';

type Intent = { key: string; path: string; body: Record<string, unknown> };
function useSave(scope: string, locale: AdminLocale, reload: () => Promise<void>) {
  const [pending, setPending] = useState<Intent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UserFacingError | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => { try { const raw = sessionStorage.getItem(scope); setPending(raw ? JSON.parse(raw) : null); } catch { setPending(null); } }, [scope]);
  async function save(path: string, body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true); setError(null); setMessage('');
    try {
      const intent = pending ?? { key: crypto.randomUUID(), path, body };
      sessionStorage.setItem(scope, JSON.stringify(intent)); setPending(intent);
      await request(intent.path, { method: 'POST', body: intent.body, headers: { 'Idempotency-Key': intent.key } });
      sessionStorage.removeItem(scope); setPending(null);
      setMessage(locale === 'zh' ? '保存成功' : 'Saved'); await reload();
    } catch (failure) { setError(toUserFacingError(failure, locale)); }
    finally { setBusy(false); }
  }
  const feedback = <>{error && <ErrorPanel error={error} locale={locale} />}<p role="status">{message}</p>{pending && <p>{locale === 'zh' ? '存在待确认提交，重试将使用原始内容。' : 'A pending submission will retry its original content.'}<button type="button" disabled={busy} onClick={() => { sessionStorage.removeItem(scope); setPending(null); setError(null); void reload().catch(f => setError(toUserFacingError(f, locale))); }}>{locale === 'zh' ? '放弃重试并刷新状态' : 'Discard retry and refresh'}</button></p>}</>;
  return { save, busy, pending, feedback };
}

function ExerciseGoalForm({ locale, userId }: { locale: AdminLocale; userId: string }) {
  const zh=locale==='zh';
  const [current,setCurrent]=useState<{totalTargetMinutes:number;version:number}|null>(null);
  const [minutes,setMinutes]=useState('1200'),[error,setError]=useState<UserFacingError|null>(null);
  const reload=useCallback(async()=>{const data=await request<{totalTargetMinutes:number;version:number}>('/admin/exercise-goal');setCurrent(data);setMinutes(String(data.totalTargetMinutes));setError(null);},[]);
  useEffect(()=>{void reload().catch(f=>setError(toUserFacingError(f,locale)));},[reload,locale]);
  const mutation=useSave(`admin-exercise-goal:${userId}`,locale,reload);
  return <section className="admin-surface admin-dialog-body" data-admin-form="exercise-goal">
    <h2>{zh?'所有课程打卡总时长':'Exercise target for all courses'}</h2>
    <p>{zh?'默认 1200 分钟（20 小时）。变更后，课程暂停新打卡，待教师重新分配两类目标后恢复；进行中的运动继续。':'Default: 1200 minutes (20 hours). A change pauses new check-ins until teachers reallocate both category targets. Ongoing sessions continue.'}</p>
    <form className="admin-form-grid" onSubmit={e=>{e.preventDefault();void mutation.save('/admin/exercise-goal',{totalTargetMinutes:Number(minutes),expectedVersion:current?.version??0});}}>
      <AdminField locale={locale} label={zh?'总目标（分钟）':'Total target (minutes)'} required><input type="number" required min="1" max="2147483647" step="1" value={minutes} disabled={mutation.busy||!!mutation.pending} onChange={e=>setMinutes(e.target.value)}/></AdminField>
      <button className="primary-button" disabled={!current||mutation.busy}>{mutation.pending?(zh?'重试原提交':'Retry submission'):(zh?'保存所有课程总目标':'Save target for all courses')}</button>
    </form>{error&&<ErrorPanel error={error} locale={locale}/>} {mutation.feedback}
  </section>;
}

function TemplateForm({ locale, userId }: { locale: AdminLocale; userId: string }) {
  const zh = locale === 'zh';
  const [current, setCurrent] = useState<{ version: number; displayName: string } | null>(null);
  const [ready, setReady] = useState(false), [name, setName] = useState('');
  const [error, setError] = useState<UserFacingError | null>(null);
  const reload = useCallback(async () => { setReady(false); const data = await request<{ items: { version: number; displayName: string }[] }>('/rule-templates?limit=1'); setCurrent(data.items[0] ?? null); setReady(true); setError(null); }, []);
  useEffect(() => { void reload().catch(f => setError(toUserFacingError(f, locale))); }, [reload, locale]);
  const mutation = useSave(`admin-template:${userId}`, locale, reload);
  return <section className="admin-surface admin-dialog-body" data-admin-form="templates"><h2>{zh ? '统一运动模板' : 'Unified exercise template'}</h2>
    <p>{zh ? '发布已确认运动规则的统一模板，教师选择发布版本用于课程。' : 'Publish the approved business rules for teachers to select for courses.'}</p>
    <p>{zh ? '当前版本' : 'Current version'}: {ready ? `${current?.version ?? 0} ${current?.displayName ?? ''}` : '…'}</p>
    <form className="admin-form-grid" onSubmit={e => { e.preventDefault(); void mutation.save('/rule-templates', { displayName: name.trim(), expectedVersion: current?.version ?? 0 }); }}>
      <fieldset className="admin-form-grid" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} disabled={mutation.busy || !!mutation.pending}><AdminField locale={locale} label={zh ? '模板名称' : 'Template name'} required><input required maxLength={100} value={name} onChange={e => setName(e.target.value)} /></AdminField></fieldset>
      <button className="primary-button" disabled={mutation.busy || (!mutation.pending && (!ready || !name.trim()))}>{mutation.pending ? (zh ? '重试原提交' : 'Retry submission') : (zh ? '发布模板' : 'Publish template')}</button>
    </form><button type="button" className="secondary-button" disabled={mutation.busy} onClick={() => void reload().catch(f => setError(toUserFacingError(f, locale)))}>{zh ? '刷新模板' : 'Refresh template'}</button>{error && <ErrorPanel error={error} locale={locale} />}{mutation.feedback}</section>;
}

type Manual = { classSectionId: string; enabled: boolean; reason: string | null; version: number };
function ManualForm({ locale, userId }: { locale: AdminLocale; userId: string }) {
  const zh = locale === 'zh';
  const [courses, setCourses] = useState<{ id: string; courseName: string; teacherName: string }[]>([]);
  const [id, setId] = useState(''), [current, setCurrent] = useState<Manual | null>(null);
  const [enabled, setEnabled] = useState(true), [reason, setReason] = useState('');
  const [error, setError] = useState<UserFacingError | null>(null);
  useEffect(() => { void loadCourseDirectory().then(d => setCourses(d.rows)).catch(f => setError(toUserFacingError(f, locale))); }, [locale]);
  const reload = useCallback(async () => { setCurrent(null); if (!id) return; const data = await request<Manual>(`/admin/review-services/manual-mode/${id}`); setCurrent(data); setEnabled(data.enabled); setReason(''); setError(null); }, [id]);
  useEffect(() => { let active = true; setCurrent(null); if (id) void request<Manual>(`/admin/review-services/manual-mode/${id}`).then(d => { if (active) { setCurrent(d); setEnabled(d.enabled); setReason(''); setError(null); } }).catch(f => { if (active) setError(toUserFacingError(f, locale)); }); return () => { active = false; }; }, [id, locale]);
  const mutation = useSave(`admin-manual:${userId}`, locale, reload);
  return <section className="admin-surface admin-dialog-body" data-admin-form="manual"><h2>{zh ? '课程人工审核' : 'Course manual review'}</h2><p>{zh ? '当前优先由责任教师人工审核，未配置课程默认开启。AI 审核功能敬请期待；关闭人工模式不会启用 AI 审核。' : 'Responsible teachers review records by default. AI review is coming soon; disabling manual mode does not enable AI review.'}</p>
    <form className="admin-form-grid" onSubmit={e => { e.preventDefault(); void mutation.save('/admin/review-services/manual-mode', { classSectionId: id, enabled, reason: reason.trim(), expectedVersion: current?.version ?? 0 }); }}>
      <fieldset className="admin-form-grid" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} disabled={mutation.busy || !!mutation.pending}><AdminField locale={locale} label={zh ? '审核课程' : 'Review course'} required><select required value={id} onChange={e => setId(e.target.value)}><option value="">{zh ? '选择课程' : 'Select course'}</option>{courses.map(c => <option key={c.id} value={c.id}>{c.courseName} · {c.teacherName}</option>)}</select></AdminField>
      <p>{zh ? '当前状态' : 'Current status'}: {current?.classSectionId === id ? `${current.enabled ? (zh ? '开启' : 'Enabled') : (zh ? '关闭' : 'Disabled')} · v${current.version}` : '…'}</p>
      <label><input type="checkbox" disabled={!current || current.classSectionId !== id} checked={enabled} onChange={e => setEnabled(e.target.checked)} />{zh ? '启用人工审核' : 'Enable manual review'}</label><AdminField locale={locale} label={zh ? '审核模式变更原因' : 'Review mode change reason'} required><textarea required disabled={!current || current.classSectionId !== id} value={reason} onChange={e => setReason(e.target.value)} /></AdminField></fieldset>
      <button className="primary-button" disabled={mutation.busy || (!mutation.pending && (!current || current.classSectionId !== id || !reason.trim()))}>{mutation.pending ? (zh ? '重试原提交' : 'Retry submission') : (zh ? '保存审核模式' : 'Save review mode')}</button>
    </form>{error && <ErrorPanel error={error} locale={locale} />}{mutation.feedback}</section>;
}

type Ocr = { configuration: { version: number; provider: 'DISABLED' | 'TENCENT_TABLE_V3'; region: string | null; timeoutMs: number; enabled: boolean }; runtimeWorkerEnabled: boolean; executionEnabled: boolean };
function OcrForm({ locale, userId }: { locale: AdminLocale; userId: string }) {
  const zh = locale === 'zh';
  const [current, setCurrent] = useState<Ocr | null>(null), [config, setConfig] = useState<Ocr['configuration'] | null>(null), [reason, setReason] = useState('');
  const [error, setError] = useState<UserFacingError | null>(null);
  const reload = useCallback(async () => { const data = await request<Ocr>('/admin/review-services/ocr'); setCurrent(data); setConfig(data.configuration); setReason(''); setError(null); }, []);
  useEffect(() => { void reload().catch(f => setError(toUserFacingError(f, locale))); }, [reload, locale]);
  const mutation = useSave(`admin-ocr:${userId}`, locale, reload);
  return <section className="admin-surface admin-dialog-body" data-admin-form="ocr"><h2>{zh ? 'OCR 识别服务' : 'OCR recognition service'}</h2><p>{zh ? '识别结果由教师确认。凭证使用 CVM 角色；云服务连通性须另行验证。' : 'Teachers confirm recognition results. Credentials use a CVM role; cloud connectivity requires verification.'}</p>
    {current && <p>{zh ? '配置版本' : 'Configuration version'}: {current.configuration.version} · {zh ? '识别任务进程' : 'Worker'}: {current.runtimeWorkerEnabled ? (zh ? '已启用' : 'Enabled') : (zh ? '未启用' : 'Disabled')} · {zh ? '执行条件' : 'Execution prerequisites'}: {current.executionEnabled ? (zh ? '已满足，连通性未验证' : 'Met; connectivity unverified') : (zh ? '未满足' : 'Not met')}</p>}
    <form className="admin-form-grid" onSubmit={e => { e.preventDefault(); if (config || mutation.pending) void mutation.save('/admin/review-services/ocr/revisions', { provider: config?.provider, region: config?.provider === 'DISABLED' ? null : config?.region, timeoutMs: config?.timeoutMs, enabled: config?.enabled, reason: reason.trim(), expectedVersion: current?.configuration.version }); }}>
    {config && <fieldset className="admin-form-grid" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} disabled={mutation.busy || !!mutation.pending}><div className="admin-form-grid two-columns"><AdminField locale={locale} label={zh ? 'OCR 服务商' : 'OCR provider'}><select value={config.provider} onChange={e => setConfig({ ...config, provider: e.target.value as Ocr['configuration']['provider'], enabled: false, region: null })}><option value="DISABLED">{zh ? '未配置' : 'Unconfigured'}</option><option value="TENCENT_TABLE_V3">{zh ? '腾讯云表格识别 V3' : 'Tencent Table V3'}</option></select></AdminField>
    <AdminField locale={locale} label={zh ? 'OCR 地域' : 'OCR region'}><input disabled={config.provider === 'DISABLED'} required={config.provider !== 'DISABLED'} maxLength={64} pattern="[a-z]+-[a-z]+(-[0-9]+)?" value={config.region ?? ''} onChange={e => setConfig({ ...config, region: e.target.value })} /></AdminField>
    <AdminField locale={locale} label={zh ? 'OCR 超时毫秒' : 'OCR timeout milliseconds'}><input type="number" min={1000} max={60000} required value={config.timeoutMs} onChange={e => setConfig({ ...config, timeoutMs: Number(e.target.value) })} /></AdminField><label><input type="checkbox" disabled={config.provider === 'DISABLED'} checked={config.enabled} onChange={e => setConfig({ ...config, enabled: e.target.checked })} />{zh ? '启用 OCR' : 'Enable OCR'}</label></div>
    <AdminField locale={locale} label={zh ? 'OCR 变更原因' : 'OCR change reason'} required><textarea required maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></AdminField></fieldset>}
    <button className="primary-button" disabled={mutation.busy || (!mutation.pending && (!current || !reason.trim()))}>{mutation.pending ? (zh ? '重试原提交' : 'Retry submission') : (zh ? '保存 OCR 配置' : 'Save OCR configuration')}</button></form>
    <button type="button" className="secondary-button" disabled={mutation.busy} onClick={() => void reload().catch(f => setError(toUserFacingError(f, locale)))}>{zh ? '刷新 OCR 状态' : 'Refresh OCR status'}</button>{error && <ErrorPanel error={error} locale={locale} />}{mutation.feedback}</section>;
}

export function AdminReviewServices({ locale, templates = false }: { locale: AdminLocale; templates?: boolean }) {
  const { mode } = useAdminStore();
  const [userId, setUserId] = useState<string | null>(null), [error, setError] = useState<UserFacingError | null>(null);
  useEffect(() => { if (mode === 'real') void getAccountSecurity().then(a => setUserId(a.adminKind === 'SUPER' ? a.userId : null)).catch(f => setError(toUserFacingError(f, locale))); }, [mode, locale]);
  let content: ReactNode = null;
  if (mode === 'real' && userId) content = templates ? <><ExerciseGoalForm locale={locale} userId={userId} /><TemplateForm locale={locale} userId={userId} /></> : <><ManualForm locale={locale} userId={userId} /><OcrForm locale={locale} userId={userId} /></>;
  return <>{error && <ErrorPanel error={error} locale={locale} />}{content}</>;
}
