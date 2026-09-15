"use client";

import { useEffect, useRef, useState } from 'react';
import { getMe, ApiError, toUserFacingError, type UserFacingError } from './api-client';
import { AdminDialog, AdminField } from './admin-components';
import { ErrorPanel } from './error-panel';
import type { AdminLocale } from './admin-types';
import { createStudentDeletionBatch, deletionJournalKey, readStudentDeletionBatch, runStudentDeletionBatch,
  type DeletionStudent, type StudentDeletionBatch } from './student-deletion-batch';

export function AdminStudentBulkDeletion({ students, ownerId, locale, close, removed }: {
  students: readonly DeletionStudent[] | null; ownerId: string; locale: AdminLocale;
  close: () => void; removed: (ids: string[]) => void;
}) {
  const [batch, setBatch] = useState<StudentDeletionBatch | null>(null);
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<UserFacingError | null>(null);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const mountedRef = useRef(false);
  const busyRef = useRef(false), stopRef = useRef(false);
  const removedRef = useRef(removed);
  removedRef.current = removed;
  const zh = locale === 'zh';
  useEffect(() => {
    mountedRef.current = true;
    stopRef.current = false;
    try { setBatch(readStudentDeletionBatch(sessionStorage.getItem(deletionJournalKey(ownerId)), ownerId)); }
    catch { setStorageBlocked(true); }
    setInitialized(true);
    return () => { stopRef.current = true; mountedRef.current = false; };
  }, [ownerId]);
  const unconfirmed = batch?.items.some(item => item.status === 'unconfirmed') ?? false;
  useEffect(() => {
    if (!busy && !unconfirmed) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [busy, unconfirmed]);
  const targets = batch?.items.map(item => item.student) ?? students ?? [];
  if (!batch && !students) return null;
  const phrase = zh ? `删除 ${targets.length} 名学生` : `DELETE ${targets.length} STUDENTS`;
  const ready = acknowledged && confirmation.trim() === phrase && !!reason.trim();
  const deleted = batch?.items.filter(item => item.status === 'deleted').length ?? 0;
  const failed = batch?.items.filter(item => item.status === 'failed').length ?? 0;
  const remaining = batch?.items.filter(item => item.status === 'pending' || item.status === 'unconfirmed').length ?? 0;
  const save = (value: StudentDeletionBatch) => sessionStorage.setItem(deletionJournalKey(ownerId), JSON.stringify(value));
  function changed(value: StudentDeletionBatch) {
    if (!mountedRef.current) return;
    setBatch({...value, items: [...value.items]});
    removedRef.current(value.items.filter(item => item.status === 'deleted').map(item => item.student.id));
  }
  async function execute() {
    if (busyRef.current || !initialized || storageBlocked || (!batch && !ready)) return;
    busyRef.current = true; stopRef.current = false;
    setBusy(true); setStopping(false); setError(null);
    try {
      const me = await getMe();
      if (me.user.id !== ownerId || me.user.role !== 'ADMIN') throw new ApiError(403, {code: 'PERMISSION_DENIED'});
      if (stopRef.current) return;
      const intent = batch ?? createStudentDeletionBatch(ownerId, targets, reason);
      save(intent); setBatch(intent);
      await runStudentDeletionBatch(intent, {save, changed: () => changed(intent), stopped: () => stopRef.current});
    } catch (failure) { if (mountedRef.current) setError(toUserFacingError(failure, locale)); }
    finally { busyRef.current = false; if (mountedRef.current) setBusy(false); }
  }
  function finish() {
    if (busyRef.current || unconfirmed) return;
    try { sessionStorage.removeItem(deletionJournalKey(ownerId)); }
    catch (failure) { if (batch) { setError(toUserFacingError(failure, locale)); return; } }
    setBatch(null); setReason(''); setConfirmation(''); setAcknowledged(false); setError(null); close();
  }
  const statusText = {
    pending: zh ? '未处理' : 'Pending', unconfirmed: zh ? '结果待确认' : 'Unconfirmed',
    deleted: zh ? '已删除' : 'Deleted', failed: zh ? '未删除，请刷新后核对' : 'Not deleted; refresh and review',
  };
  return <AdminDialog wide locale={locale} title={zh ? '批量删除学生账号及历史记录' : 'Delete student accounts and history'}
    description={zh ? `本次名单已固定，共 ${targets.length} 名学生。` : `This selection is fixed: ${targets.length} students.`}
    close={finish} footer={<>
      {busy ? <button type="button" className="secondary-button" disabled={stopping} onClick={() => {
        stopRef.current = true; setStopping(true);
      }}>{stopping ? (zh ? '正在停止…' : 'Stopping…') : (zh ? '停止后续删除' : 'Stop after current request')}</button>
        : <button type="button" className="secondary-button" disabled={unconfirmed} onClick={finish}>
          {batch ? (remaining ? (zh ? '结束本批次' : 'End this batch') : (zh ? '完成' : 'Done')) : (zh ? '取消' : 'Cancel')}</button>}
      {(!batch || remaining > 0) && <button type="button" className="danger-button"
        disabled={busy || !initialized || storageBlocked || (!batch && !ready)} onClick={() => void execute()}>
        {busy ? (zh ? '正在处理…' : 'Processing…') : batch
          ? (unconfirmed ? (zh ? '核对结果并继续' : 'Check result and continue') : (zh ? '继续删除未处理学生' : 'Continue pending deletions'))
          : (zh ? `确认永久删除 ${targets.length} 名学生` : `Permanently delete ${targets.length} students`)}
      </button>}
    </>}>
    <p>{zh ? '此操作不可恢复，将删除所选学生的账号、全部课程关系、打卡、凭证、审核、学时、关联申请和成绩。已完成的删除不会因停止后续处理而恢复。' : 'This cannot be undone. Accounts, all course memberships, check-ins, evidence, reviews, credits, related applications and grades will be deleted. Stopping does not restore completed deletions.'}</p>
    {storageBlocked && <p role="alert">{zh ? '无法读取本窗口的批量处理进度，请先核对之前的删除结果。' : 'The saved batch could not be read. Check the previous deletion results first.'}</p>}
    <ErrorPanel locale={locale} error={error} />
    {batch && <p role="status" aria-live="polite">{zh ? `已删除 ${deleted} 人，未删除 ${failed} 人，待处理或确认 ${remaining} 人。` : `${deleted} deleted, ${failed} not deleted, ${remaining} pending or unconfirmed.`}</p>}
    {unconfirmed && !busy && <p role="alert">{zh ? '有删除结果尚未确认，已暂停后续处理。请保留此窗口，点击“核对结果并继续”；刷新后仍可继续核对。' : 'A result is unconfirmed and processing is paused. Keep this tab and check the result before continuing. The batch survives a reload.'}</p>}
    <div className="table-wrap" style={{maxHeight: 'min(40vh, 360px)', overflow: 'auto'}}>
      <table className="admin-table"><thead><tr><th>{zh ? '学号' : 'Student number'}</th><th>{zh ? '姓名' : 'Name'}</th><th>{zh ? '处理结果' : 'Result'}</th></tr></thead>
        <tbody>{targets.map((student, index) => {
          const item = batch?.items[index];
          const failure = item?.failure;
          const projected = failure ? toUserFacingError(failure.status
            ? new ApiError(failure.status, {code: failure.code, requestId: failure.requestId ?? undefined})
            : new Error('Unconfirmed delivery'), locale, {log: false}) : null;
          return <tr key={student.id}><td><code>{student.studentNumber}</code></td><td>{student.fullName}</td><td>
            {item ? statusText[item.status] : (zh ? '待确认删除' : 'Awaiting confirmation')}
            {projected && <small className="table-sub">{projected.message}{projected.requestId ? ` (${projected.requestId})` : ''}</small>}
          </td></tr>;
        })}</tbody>
      </table>
    </div>
    {!batch && <>
      <AdminField locale={locale} label={zh ? '删除原因（应用于本次每名学生）' : 'Reason for each deletion'} required>
        <textarea maxLength={1000} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} />
      </AdminField>
      <label className="admin-password-toggle"><input type="checkbox" checked={acknowledged} disabled={busy}
        onChange={event => setAcknowledged(event.target.checked)} />{zh ? '我已核对以上名单，知晓账号及历史记录将被永久删除。' : 'I checked this list and understand that accounts and history will be permanently deleted.'}</label>
      <AdminField locale={locale} label={zh ? `输入“${phrase}”确认` : `Type “${phrase}” to confirm`} required>
        <input value={confirmation} autoComplete="off" disabled={busy} onChange={event => setConfirmation(event.target.value)} />
      </AdminField>
    </>}
  </AdminDialog>;
}
