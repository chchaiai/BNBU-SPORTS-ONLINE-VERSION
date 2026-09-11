"use client";
import { useRef, useState } from 'react';
import { ApiError, request, toUserFacingError, type UserFacingError } from './api-client';
import { AdminDialog, AdminField } from './admin-components';
import { ErrorPanel } from './error-panel';
import type { AdminLocale, StudentProfileProjection } from './admin-types';

export function AdminStudentDeletion({ student, locale, close, completed }: {
  student: StudentProfileProjection; locale: AdminLocale; close: () => void; completed: () => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UserFacingError | null>(null);
  const [pendingReceipt, setPendingReceipt] = useState(false);
  const intent = useRef<{ key: string; body: { expectedVersion: number; confirmationStudentNumber: string; reason: string } } | null>(null);
  const locked = busy || pendingReceipt;
  async function remove() {
    if (busy || !reason.trim() || confirmation.trim() !== student.studentNumber) return;
    intent.current ??= { key: crypto.randomUUID(), body: { expectedVersion: student.version,
      confirmationStudentNumber: confirmation.trim(), reason: reason.trim() } };
    setBusy(true); setPendingReceipt(true); setError(null);
    try {
      const receipt = await request<{ id: string; deleted: boolean }>(`/admin/students/${encodeURIComponent(student.id)}/delete`,
        { method: 'POST', headers: { 'Idempotency-Key': intent.current.key }, body: intent.current.body });
      if (receipt.id !== student.id || !receipt.deleted) throw new Error('Deletion receipt unavailable');
      intent.current = null;
      setPendingReceipt(false);
      await completed();
    } catch (failure) {
      if (failure instanceof ApiError && failure.status >= 400 && failure.status < 500) {
        intent.current = null; setPendingReceipt(false);
      }
      setError(toUserFacingError(failure, locale));
    } finally { setBusy(false); }
  }
  return <AdminDialog locale={locale} title={locale === 'zh' ? '删除学生账号及历史记录' : 'Delete student account and history'}
    description={`${student.fullName} · ${student.studentNumber}`} close={() => { if (!locked) close(); }}
    footer={<><button type="button" className="secondary-button" disabled={locked} onClick={close}>{locale === 'zh' ? '取消' : 'Cancel'}</button>
      <button type="button" className="danger-button" disabled={busy || !reason.trim() || confirmation.trim() !== student.studentNumber}
        onClick={() => void remove()}>{busy ? (locale === 'zh' ? '删除中…' : 'Deleting…') : (locale === 'zh' ? '永久删除学生及历史记录' : 'Permanently delete student and history')}</button></>}>
    <p>{locale === 'zh' ? '此操作不可恢复。学生将移出全部课程，无法继续登录；历史打卡、凭证、审核、学时及关联申请和成绩记录将被删除。请核对姓名和学号。' : 'This cannot be undone. The student will leave every course and lose login access. Check-ins, evidence, reviews, credits, related applications and grades will be deleted. Verify the name and student number.'}</p>
    {error && <ErrorPanel error={error} locale={locale} />}
    {pendingReceipt && !busy && <p role="status">{locale === 'zh' ? '删除结果尚未确认，请按原内容重试核对结果。' : 'The result is unconfirmed. Retry the same request to check it.'}</p>}
    <AdminField locale={locale} label={locale === 'zh' ? '删除原因' : 'Deletion reason'} required>
      <textarea value={reason} maxLength={1000} disabled={locked} onChange={event => setReason(event.target.value)} />
    </AdminField>
    <AdminField locale={locale} label={locale === 'zh' ? `输入学号 ${student.studentNumber} 确认` : `Enter ${student.studentNumber} to confirm`} required>
      <input value={confirmation} autoComplete="off" disabled={locked} onChange={event => setConfirmation(event.target.value)} />
    </AdminField>
  </AdminDialog>;
}
