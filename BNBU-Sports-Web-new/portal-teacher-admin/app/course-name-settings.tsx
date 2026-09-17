"use client";
import { useEffect, useRef, useState } from 'react';
import { ApiError, currentApiSessionEpoch, request, toUserFacingError, formatUserFacingError } from './api-client';

type Section = { id: string; displayName: string; version: number; status: string };
type Intent = { key: string; body: { displayName: string; expectedVersion: number } };

export function CourseNameSettings({ classSectionId, onSaved }: { classSectionId: string; onSaved: () => void }) {
  const [section, setSection] = useState<Section | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const intent = useRef<Intent | null>(null);
  const lock = useRef(false);
  const mounted = useRef(true);
  const epoch = currentApiSessionEpoch();
  const valid = () => mounted.current && epoch === currentApiSessionEpoch();
  const path = `/class-sections/${encodeURIComponent(classSectionId)}`;
  useEffect(() => {
    mounted.current = true;
    void request<Section>(path).then(value => { if (valid()) { setSection(value); setName(value.displayName); } })
      .catch(error => { if (valid()) setMessage(formatUserFacingError(error)); });
    return () => { mounted.current = false; };
  }, [classSectionId]);
  async function save() {
    if (lock.current || !section || !name.trim()) return;
    lock.current = true; setBusy(true); setMessage('');
    intent.current ??= { key: crypto.randomUUID(), body: { displayName: name.trim(), expectedVersion: section.version } };
    try {
      const value = await request<Section>(path, { method: 'PATCH', body: intent.current.body, headers: { 'Idempotency-Key': intent.current.key } });
      if (!valid()) return;
      intent.current = null; setSection(value); setName(value.displayName); setMessage('课程名称已保存。'); onSaved();
    } catch (error) {
      if (!valid()) return;
      if (error instanceof ApiError && [403, 404, 409, 422].includes(error.status)) {
        intent.current = null;
        const latest = await request<Section>(path).catch(() => null);
        if (latest && valid()) setSection(latest);
      }
      if (valid()) setMessage(formatUserFacingError(error));
    } finally { lock.current = false; if (valid()) setBusy(false); }
  }
  return <section className="course-target-section" aria-label="修改课程名称">
    <h3>修改课程名称</h3>
    <label htmlFor="course-name-edit">课程名称</label>
    <input id="course-name-edit" value={name} maxLength={200} disabled={busy || !!intent.current || !section || ['CLOSED','ARCHIVED'].includes(section.status)} onChange={event => setName(event.target.value)} />
    <button type="button" className="secondary-button" disabled={busy || !section || !name.trim() || (!intent.current && name.trim()===section.displayName) || ['CLOSED','ARCHIVED'].includes(section.status)} onClick={() => void save()}>{busy ? '正在保存…' : intent.current ? '重试保存名称' : '保存课程名称'}</button>
    {message && <p role="status">{message}</p>}
  </section>;
}
