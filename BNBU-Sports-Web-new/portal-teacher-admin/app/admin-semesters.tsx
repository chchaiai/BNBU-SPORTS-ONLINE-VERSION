"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AppSelect } from "./app-select";
import { adminCopy } from "./admin-i18n";
import { ApiError, apiSessionUserId, toUserFacingError, formatUserFacingError, type UserFacingError } from "./api-client";
import {
  createSemester,
  setCurrentSemester,
  updateSemester,
} from "./admin-service";
import type {
  AdminLocale,
  Semester,
  SemesterTerm,
} from "./admin-types";
import {
  AdminBadge,
  AdminDialog,
  AdminEmpty,
  AdminField,
  AdminLoadError,
  AdminLoading,
  AdminSectionHeading,
  formatAdminDate,
} from "./admin-components";
import { ErrorPanel } from "./error-panel";
import { useAdminStore } from "./admin-store";
import { listSemesters, saveSemester as saveRealSemester, getSemesterSwitchCheck, createSemesterSwitchIntent,
  type SemesterRow, type SemesterSwitchCheck } from './semester-api';

type SemesterEditor = {
  id?: string;
  name: string;
  academicYear: string;
  term: SemesterTerm;
  startDate: string;
  endDate: string;
  expectedUpdatedAt?: string;
  expectedVersion?: number;
};

const emptyEditor = (): SemesterEditor => {
  const year = new Date().getFullYear();
  return {
    name: "",
    academicYear: `${year}-${year + 1}`,
    term: "first",
    startDate: "",
    endDate: "",
  };
};
type PendingSemester = { kind: 'SAVE'; editor: SemesterEditor; key: string } |
  { kind: 'SWITCH'; check: SemesterSwitchCheck; target: Semester; key: string };
function pendingKey() {
  const user = apiSessionUserId();
  if (!user) throw new Error('SEMESTER_SESSION_REQUIRED');
  return 'bnbu-semester-pending-v1:' + user;
}
function persistPending(pending: PendingSemester) {
  sessionStorage.setItem(pendingKey(), JSON.stringify(pending));
}
function clearPending() { sessionStorage.removeItem(pendingKey()); }

export function AdminSemesters({ locale, onSemestersLoaded }: {
  locale: AdminLocale;
  onSemestersLoaded?: (rows: SemesterRow[]) => void;
}) {
  const { mode, state, busyKey: demoBusyKey, error: storeError, clearError, run } = useAdminStore();
  const [rows, setRows] = useState<SemesterRow[]>([]);
  const [realBusy, setRealBusy] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [unresolved, setUnresolved] = useState(false);
  const busyKey = demoBusyKey || realBusy;
  const inFlight = useRef(false);
  const saveIntent = useRef<{ fingerprint: string; key: string } | null>(null);
  const switchIntent = useRef<ReturnType<typeof createSemesterSwitchIntent> | null>(null);
  const [switchCheck, setSwitchCheck] = useState<SemesterSwitchCheck | null>(null);
  const [loading, setLoading] = useState(mode === "real");
  const [error, setError] = useState<UserFacingError | null>(null);
  const [editor, setEditor] = useState<SemesterEditor | null>(null);
  const [switchTarget, setSwitchTarget] = useState<Semester | null>(null);
  const restored = useRef(false);

  const load = useCallback(async () => {
    if (mode === "demo") return;
    setLoading(true);
    setError(null);
    try {
      const nextRows = await listSemesters();
      setRows(nextRows);
      onSemestersLoaded?.(nextRows);
      if (!restored.current) {
        const raw = sessionStorage.getItem(pendingKey());
        if (raw) {
          const pending = JSON.parse(raw) as PendingSemester;
          if (typeof pending.key !== 'string' || !/^[0-9a-f-]{36}$/i.test(pending.key)) throw new Error('INVALID_PENDING_SEMESTER');
          if (pending.kind === 'SAVE') {
            if (!pending.editor || !['name','academicYear','term','startDate','endDate'].every(key =>
              typeof (pending.editor as unknown as Record<string, unknown>)[key] === 'string')) throw new Error('INVALID_PENDING_SEMESTER');
            const e = pending.editor;
            const body = { displayName: e.name, academicYear: e.academicYear, termCode: e.term.toUpperCase(),
              startDate: e.startDate, endDate: e.endDate, ...(e.id ? { expectedVersion: e.expectedVersion } : {}) };
            saveIntent.current = { fingerprint: JSON.stringify([e.id, body]), key: pending.key }; setEditor(e);
          } else if (pending.kind === 'SWITCH' && pending.check?.target?.id && pending.target?.id) {
            switchIntent.current = createSemesterSwitchIntent(pending.check, pending.key);
            setSwitchCheck(pending.check); setSwitchTarget(pending.target);
          } else throw new Error('INVALID_PENDING_SEMESTER');
          setUnresolved(true); setWriteError(locale === 'zh' ? '已恢复未确认的提交，请重试确认结果。' : 'An unconfirmed submission was restored. Retry to confirm its result.');
        }
        restored.current = true;
      }
    } catch (failure) {
      setError(toUserFacingError(failure, locale));
    } finally {
      setLoading(false);
    }
  }, [locale, mode, onSemestersLoaded]);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => { void load(); }, 0);
    return () => globalThis.clearTimeout(timer);
  }, [load]);

  const semesters: Semester[] = useMemo(() => mode === 'real' ? rows.map(row => ({ ...row,
    name: row.displayName, term: row.termCode.toLowerCase() as SemesterTerm,
    status: row.status.toLowerCase() as Semester['status'] })) : state?.semesters ?? [], [mode, rows, state]);
  const current = semesters.find(semester => semester.status === 'current') ?? null;

  async function realMutation(action: () => Promise<unknown>) {
    if (inFlight.current) return false;
    inFlight.current = true; setRealBusy(true); setWriteError(null);
    let committed = false;
    try {
      await action();
      committed = true;
      const nextRows = await listSemesters();
      setRows(nextRows);
      onSemestersLoaded?.(nextRows);
      clearPending(); setUnresolved(false); return true;
    }
    catch (failure) {
      const uncertain = committed || !(failure instanceof ApiError) || failure.status >= 500 || failure.status === 0 ||
        ['CONFLICT_REQUEST_IN_PROGRESS', 'SYSTEM_INVALID_RESPONSE'].includes(failure.code);
      setUnresolved(uncertain);
      if (!uncertain) clearPending();
      setWriteError(uncertain ? (locale === 'zh' ? '提交结果尚未确认，请保持原内容并重试。' : 'The submission result is unconfirmed. Retry with the original details.')
        : formatUserFacingError(failure, locale));
      return false;
    }
    finally { inFlight.current = false; setRealBusy(false); }
  }
  function closeEditor() { if (!inFlight.current && !unresolved) setEditor(null); }
  function closeSwitch() { if (!inFlight.current && !unresolved) setSwitchTarget(null); }
  async function beginSwitch(semester: Semester) {
    if (busyKey) return;
    clearError(); setWriteError(null); switchIntent.current = null; setSwitchCheck(null);
    if (mode === 'demo') { setSwitchTarget(semester); return; }
    setRealBusy(true);
    try {
      const check = await getSemesterSwitchCheck(semester.id);
      setSwitchCheck(check);
      switchIntent.current = createSemesterSwitchIntent(check);
      setSwitchTarget({ ...semester, name: check.target.displayName });
    } catch (failure) { setWriteError(formatUserFacingError(failure, locale)); }
    finally { setRealBusy(false); }
  }

  function beginCreate() {
    if (inFlight.current || unresolved) return;
    clearError();
    setWriteError(null); saveIntent.current = null;
    setEditor(emptyEditor());
  }

  function beginEdit(semester: Semester) {
    if (inFlight.current || unresolved) return;
    clearError();
    setWriteError(null); saveIntent.current = null;
    setEditor({
      id: semester.id,
      name: semester.name,
      academicYear: semester.academicYear,
      term: semester.term,
      startDate: semester.startDate,
      endDate: semester.endDate,
      expectedUpdatedAt: semester.updatedAt,
      expectedVersion: rows.find(row => row.id === semester.id)?.version,
    });
  }

  async function saveSemester(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    if (mode === 'real') {
      const body = { displayName: editor.name, academicYear: editor.academicYear,
        termCode: editor.term.toUpperCase() as SemesterRow['termCode'], startDate: editor.startDate, endDate: editor.endDate,
        ...(editor.id ? { expectedVersion: editor.expectedVersion } : {}) };
      const fingerprint = JSON.stringify([editor.id, body]);
      if (saveIntent.current?.fingerprint !== fingerprint) saveIntent.current = { fingerprint, key: crypto.randomUUID() };
      const key = saveIntent.current.key;
      if (await realMutation(() => {
        persistPending({ kind: 'SAVE', editor, key });
        return saveRealSemester(editor.id ?? null, body, key);
      })) setEditor(null);
      return;
    }
    const input = {
      name: editor.name,
      academicYear: editor.academicYear,
      term: editor.term,
      startDate: editor.startDate,
      endDate: editor.endDate,
    };
    const saved = editor.id
      ? await run(
          `semester:update:${editor.id}`,
          () => updateSemester({ ...input, id: editor.id!, expectedUpdatedAt: editor.expectedUpdatedAt! }),
          locale === "zh" ? "学期配置已更新" : "Semester configuration updated",
        )
      : await run(
          "semester:create",
          () => createSemester(input),
          locale === "zh" ? "新学期已创建" : "Semester created",
        );
    if (saved) setEditor(null);
  }

  async function confirmSwitch() {
    if (!switchTarget) return;
    if (mode === 'real') {
      if (!switchCheck?.ready || !switchIntent.current) return;
      if (await realMutation(() => {
        persistPending({ kind: 'SWITCH', check: switchCheck, target: switchTarget, key: switchIntent.current!.key });
        return switchIntent.current!.run();
      })) setSwitchTarget(null);
      return;
    }
    const switched = await run(
      `semester:switch:${switchTarget.id}`,
      () => setCurrentSemester(switchTarget.id),
      locale === "zh" ? "当前学期已切换" : "Current semester changed",
    );
    if (switched) setSwitchTarget(null);
  }

  if (loading) return <AdminLoading locale={locale} />;
  if (error) return (
    <div className="admin-page-stack">
      <ErrorPanel error={error} locale={locale} />
      <div className="admin-form-actions">
        <button className="primary-button" type="button" onClick={() => void load()}>{adminCopy(locale, "retry")}</button>
      </div>
    </div>
  );

  if (mode === "demo" && !state) return <AdminLoadError locale={locale} message={adminCopy(locale, "load_error")} retry={() => undefined} />;

  return (
    <div className="admin-page-stack admin-semester-management">
      <section className="admin-management-hero admin-semester-hero">
        <div>
          <span>{locale === "zh" ? "学期生命周期" : "Semester lifecycle"}</span>
          <div className="admin-semester-title-row"><h2>{current?.name ?? (locale === "zh" ? "尚未设置当前学期" : "No current semester")}</h2>{current && <AdminBadge tone="green">{locale === "zh" ? "当前" : "Current"}</AdminBadge>}</div>
          <p>{locale === "zh" ? "管理员创建和配置即将开始的学期，并在确认后切换当前学期；旧学期会自动归档。" : "Create and configure upcoming semesters, then switch the current semester after confirmation. The previous semester is archived automatically."}</p>
        </div>
        <button className="primary-button" type="button" onClick={beginCreate}>{locale === "zh" ? "新增学期" : "New semester"}</button>
      </section>

      <section className="admin-semester-summary" aria-label={locale === "zh" ? "学期概况" : "Semester summary"}>
        <article><span>{locale === "zh" ? "当前学期" : "Current"}</span><b>{current?.name ?? "—"}</b><small>{current ? `${formatAdminDate(locale, current.startDate)} – ${formatAdminDate(locale, current.endDate)}` : "—"}</small></article>
        <article><span>{locale === "zh" ? "即将开始" : "Upcoming"}</span><b>{semesters.filter((item) => item.status === "upcoming").length}</b><small>{locale === "zh" ? "可继续编辑配置" : "Editable configurations"}</small></article>
        <article><span>{locale === "zh" ? "已归档" : "Archived"}</span><b>{semesters.filter((item) => item.status === "archived").length}</b><small>{locale === "zh" ? "永久保留历史" : "History retained"}</small></article>
      </section>

      {(writeError || storeError) && <div className="admin-inline-error" role="alert">{writeError || storeError?.message}</div>}

      <section className="admin-surface admin-table-surface admin-semester-list-surface">
        <AdminSectionHeading title={locale === "zh" ? "全部学期" : "All semesters"} description={locale === "zh" ? "当前学期只允许切换产生，已归档学期不可恢复或删除。" : "Current status changes only through switching. Archived semesters cannot be restored or deleted."} />
        {semesters.length === 0 ? <AdminEmpty locale={locale} /> : (
          <>
            <div className="table-wrap admin-semester-table-wrap"><table className="admin-table admin-semester-table"><thead><tr><th>{locale === "zh" ? "学期" : "Semester"}</th><th>{adminCopy(locale, "academic_year")}</th><th>{adminCopy(locale, "date_range")}</th><th>{locale === "zh" ? "课程 / 学生" : "Courses / students"}</th><th>{adminCopy(locale, "status")}</th><th>{locale === "zh" ? "操作" : "Actions"}</th></tr></thead><tbody>{semesters.map((item) => (
              <tr key={item.id}>
                <td><b>{item.name}</b><small className="table-sub">{item.term.toUpperCase()}</small></td>
                <td>{item.academicYear}</td>
                <td>{formatAdminDate(locale, item.startDate)} – {formatAdminDate(locale, item.endDate)}</td>
                <td>{item.courseCount} / {item.studentCount}</td>
                <td><AdminBadge tone={item.status === "current" ? "green" : item.status === "upcoming" ? "orange" : "gray"}>{item.status.toUpperCase()}</AdminBadge></td>
                <td>{item.status === "upcoming" ? <div className="admin-row-actions"><button className="text-button" type="button" onClick={() => beginEdit(item)}>{locale === "zh" ? "编辑配置" : "Edit"}</button><button className="text-button" type="button" onClick={() => void beginSwitch(item)}>{locale === "zh" ? "设为当前学期" : "Make current"}</button></div> : <span className="admin-muted-text">{locale === "zh" ? "只读" : "Read-only"}</span>}</td>
              </tr>
            ))}</tbody></table></div>
            <div className="admin-semester-mobile-list">{semesters.map((item) => (
              <article key={item.id}>
                <header><div><h3>{item.name}</h3><p>{item.academicYear} · {item.term.toUpperCase()}</p></div><AdminBadge tone={item.status === "current" ? "green" : item.status === "upcoming" ? "orange" : "gray"}>{item.status.toUpperCase()}</AdminBadge></header>
                <dl><div><dt>{adminCopy(locale, "date_range")}</dt><dd>{formatAdminDate(locale, item.startDate)} – {formatAdminDate(locale, item.endDate)}</dd></div><div><dt>{locale === "zh" ? "课程 / 学生" : "Courses / students"}</dt><dd>{item.courseCount} / {item.studentCount}</dd></div></dl>
                <footer>{item.status === "upcoming" ? <div className="admin-row-actions"><button className="text-button" type="button" onClick={() => beginEdit(item)}>{locale === "zh" ? "编辑配置" : "Edit"}</button><button className="text-button" type="button" onClick={() => void beginSwitch(item)}>{locale === "zh" ? "设为当前学期" : "Make current"}</button></div> : <span className="admin-muted-text">{locale === "zh" ? "只读" : "Read-only"}</span>}</footer>
              </article>
            ))}</div>
          </>
        )}
      </section>

      {editor && (
        <AdminDialog locale={locale} title={editor.id ? (locale === "zh" ? "编辑学期配置" : "Edit semester") : (locale === "zh" ? "新增学期" : "New semester")} close={closeEditor} dirty footer={<><button className="secondary-button" type="button" disabled={Boolean(busyKey) || unresolved} onClick={closeEditor}>{locale === "zh" ? "取消" : "Cancel"}</button><button className="primary-button" type="submit" form="semester-editor-form" disabled={Boolean(busyKey)}>{busyKey ? (locale === "zh" ? "保存中…" : "Saving…") : (locale === "zh" ? "保存学期" : "Save semester")}</button></>}>
          {writeError && <div className="admin-inline-error" role="alert">{writeError}</div>}
          <form id="semester-editor-form" className="admin-form-grid two-columns admin-semester-editor-form" onSubmit={saveSemester}>
            <AdminField className="admin-semester-name-field" locale={locale} label={locale === "zh" ? "显示名称" : "Display name"} required error={storeError?.fieldErrors.name}><input disabled={Boolean(busyKey) || unresolved} value={editor.name} onChange={(event) => { setEditor({ ...editor, name: event.target.value }); clearError(); }} /></AdminField>
            <AdminField className="admin-semester-year-field" locale={locale} label={locale === "zh" ? "学年" : "Academic year"} required error={storeError?.fieldErrors.academicYear}><input disabled={Boolean(busyKey) || unresolved} value={editor.academicYear} placeholder="2026-2027" onChange={(event) => { setEditor({ ...editor, academicYear: event.target.value }); clearError(); }} /></AdminField>
            <AdminField className="admin-semester-term-field" locale={locale} label={locale === "zh" ? "学期" : "Term"} required><AppSelect disabled={Boolean(busyKey) || unresolved} label={locale === "zh" ? "学期" : "Term"} value={editor.term} options={[{ value: "first", label: locale === "zh" ? "第一学期" : "First semester" }, { value: "second", label: locale === "zh" ? "第二学期" : "Second semester" }, { value: "summer", label: locale === "zh" ? "暑期学期" : "Summer" }]} onChange={(value) => value && setEditor({ ...editor, term: String(value) as SemesterTerm })} /></AdminField>
            <AdminField className="admin-semester-start-field" locale={locale} label={locale === "zh" ? "开始日期" : "Start date"} required error={storeError?.fieldErrors.startDate}><input disabled={Boolean(busyKey) || unresolved} type="date" value={editor.startDate} onChange={(event) => { setEditor({ ...editor, startDate: event.target.value }); clearError(); }} /></AdminField>
            <AdminField className="admin-semester-end-field" locale={locale} label={locale === "zh" ? "结束日期" : "End date"} required error={storeError?.fieldErrors.endDate}><input disabled={Boolean(busyKey) || unresolved} type="date" value={editor.endDate} onChange={(event) => { setEditor({ ...editor, endDate: event.target.value }); clearError(); }} /></AdminField>
          </form>
        </AdminDialog>
      )}

      {switchTarget && (
        <AdminDialog locale={locale} title={locale === "zh" ? "确认切换当前学期" : "Confirm semester switch"} close={closeSwitch} footer={<><button className="secondary-button" type="button" disabled={Boolean(busyKey) || unresolved} onClick={closeSwitch}>{locale === "zh" ? "取消" : "Cancel"}</button><button className="primary-button" type="button" disabled={Boolean(busyKey) || (mode === "real" && !switchCheck?.ready)} onClick={() => void confirmSwitch()}>{locale === "zh" ? "确认切换" : "Confirm switch"}</button></>}>
          <div className="admin-confirm-card">
            {writeError && <div className="admin-inline-error" role="alert">{writeError}</div>}
            {mode === "real" && switchCheck && !switchCheck.ready && <p role="alert">{switchCheck.checks.filter(item => item.status !== "CLEAR").map(item => {
              const labels: Record<string, string> = locale === "zh" ? { TARGET_UPCOMING: "目标学期状态已变化", TARGET_START_DATE: "尚未到开始日期", FORMAL_COURSE_SETTLEMENT: "仍有课程未结算", COURSE_UNFINISHED_WORK: "仍有课程待办或数据待核实" } : { TARGET_UPCOMING: "Target status changed", TARGET_START_DATE: "Start date has not arrived", FORMAL_COURSE_SETTLEMENT: "Courses await settlement", COURSE_UNFINISHED_WORK: "Courses have pending work or unverified data" };
              return labels[item.code] ?? (locale === "zh" ? "存在未完成条件" : "A prerequisite is incomplete");
            }).join(locale === "zh" ? "；" : "; ")}</p>}
            <p>{locale === "zh" ? "切换成功后，原当前学期会自动归档，新学期成为全系统唯一当前学期。" : "After switching, the previous current semester is archived and the new semester becomes the only current semester."}</p>
            <div className="admin-switch-preview"><span><small>{locale === "zh" ? "原当前学期" : "Previous"}</small><b>{(mode === "real" ? switchCheck?.current?.displayName : current?.name) ?? "—"}</b></span><i aria-hidden="true">→</i><span><small>{locale === "zh" ? "新当前学期" : "New current"}</small><b>{switchTarget.name}</b></span></div>
          </div>
        </AdminDialog>
      )}
    </div>
  );
}
