"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { changeOwnPassword, currentApiSessionEpoch, getAccountSecurity, toUserFacingError, userFacingFieldError, type UserFacingError } from "./api-client";
import { ErrorPanel, localUserFacingError } from "./error-panel";
import { FormField } from "./form-field";
import type { Locale } from "./language";

export function OwnPasswordPanel({ locale, preview, onBack }: { locale: Locale; preview: boolean; onBack: () => void }) {
  const [values, setValues] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<UserFacingError | null>(null);
  const intent = useRef<{ input: Parameters<typeof changeOwnPassword>[0]; key: string } | null>(null);
  const alive = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; intent.current = null; }; }, []);
  const en = locale === "en";
  async function submit() {
    if (inFlight.current || preview) return;
    if (values.newPassword !== values.confirmPassword) {
      setError(localUserFacingError(en ? "The passwords do not match." : "两次输入的密码不一致。")); return;
    }
    inFlight.current = true; setBusy(true); setError(null);
    const epoch = currentApiSessionEpoch();
    const current = () => alive.current && epoch === currentApiSessionEpoch();
    try {
      if (!intent.current) {
        const security = await getAccountSecurity();
        if (!current()) return;
        intent.current = { input: { ...values, expectedVersion: security.version }, key: crypto.randomUUID() };
      }
      await changeOwnPassword(intent.current.input, intent.current.key);
      if (!current()) return;
      intent.current = null; setValues({ currentPassword: "", newPassword: "", confirmPassword: "" }); setComplete(true);
    } catch (failure) {
      if (current()) {
        // Preserve the exact request for uncertain outcomes; a confirmed conflict needs a fresh version.
        if (typeof failure === "object" && failure !== null && "status" in failure && failure.status === 409) intent.current = null;
        setError(toUserFacingError(failure, locale));
      }
    } finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }
  if (complete) return <><div className="password-change-complete" role="status"><h3>{en ? "Password updated" : "密码已更新"}</h3><p>{en ? "This session remains signed in. Other sessions have been signed out." : "当前登录已保留，其他登录已退出。"}</p></div><div className="modal-footer"><button className="primary-button" type="button" onClick={onBack}>{en ? "Back to account" : "返回账号信息"}</button></div></>;
  return <><form id="own-password-form" className="password-settings-form" onSubmit={event => { event.preventDefault(); void submit(); }}>
    <p>{en ? "Enter your current password and a new password." : "请输入当前密码，并设置新密码。"}</p>
    {preview && <p>{en ? "Password changes require a signed-in account." : "请登录真实账号后修改密码。"}</p>}
    {([['currentPassword', en ? 'Current password' : '当前密码'], ['newPassword', en ? 'New password' : '新密码'], ['confirmPassword', en ? 'Confirm new password' : '确认新密码']] as const).map(([name, label]) => <FormField key={name} controlId={`own-${name}`} enhanceControl={false} label={label} required error={userFacingFieldError(error, name)}>
      <span className="password-field"><input id={`own-${name}`} aria-invalid={!!userFacingFieldError(error, name) || undefined} aria-describedby={userFacingFieldError(error, name) ? `own-${name}-error` : undefined} type={visible[name] ? 'text' : 'password'} autoComplete={name === 'currentPassword' ? 'current-password' : 'new-password'} required disabled={busy || preview} value={values[name]} onChange={event => { intent.current = null; setValues(previous => ({ ...previous, [name]: event.target.value })); setError(null); }} /><button type="button" className="password-visibility" aria-label={en ? `Show or hide ${label.toLowerCase()}` : `显示或隐藏${label}`} aria-pressed={!!visible[name]} onClick={() => setVisible(previous => ({ ...previous, [name]: !previous[name] }))}>{visible[name] ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button></span>
    </FormField>)}
    <ErrorPanel error={error} locale={locale} />
  </form><div className="modal-footer"><button className="secondary-button" type="button" disabled={busy} onClick={onBack}>{en ? "Back to account" : "返回账号信息"}</button><button className="primary-button" type="submit" form="own-password-form" disabled={busy || preview}>{busy ? en ? "Saving…" : "正在保存…" : en ? "Save password" : "保存新密码"}</button></div></>;
}
