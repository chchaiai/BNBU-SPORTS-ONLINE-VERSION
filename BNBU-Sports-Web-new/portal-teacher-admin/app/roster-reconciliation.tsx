"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  FileSpreadsheet,
  RefreshCw,
  Search,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { OcrImportPanel } from "./ocr-import-panel";
import { AppSelect } from "./app-select";
import { currentApiRequestMode } from "./api-client";
import { FormField } from "./form-field";
import {
  rosterReconciliationService,
  parseOfficialRosterFile,
  validateOfficialRosterFile,
} from "./roster-reconciliation-api-service";
import {
  ROSTER_IMPORT_FIELDS,
  RosterReconciliationStatus,
  RosterResolutionStatus,
  type ParsedRosterFile,
  type PlatformCourseMember,
  type RosterCourseReference,
  type RosterFieldMapping,
  type RosterImportField,
  type RosterReconciliationBundle,
  type RosterReconciliationResult,
  type ValidatedRosterImport,
} from "./roster-reconciliation-types";
import {
  DataTable,
  FilterToolbar,
  ManagementTableLayout,
} from "./teacher-ui";

const STATUS_LABELS: Record<RosterReconciliationStatus, string> = {
  MATCHED: "已进本班",
  MISSING_IN_PLATFORM: "未进本班",
  EXTRA_IN_PLATFORM: "不在导入名单中",
  WRONG_COURSE: "加入了其他班",
  IDENTITY_CONFLICT: "已进班 · 信息待核实",
  DUPLICATED: "学号重复",
};

const FIELD_LABELS: Record<RosterImportField, string> = {
  studentNumber: "学号",
  fullName: "姓名",
  gender: "性别",
  gradeYear: "入学年份",
  collegeName: "学院",
  majorName: "专业",
  administrativeClassName: "行政班",
};

const DIFFERENCE_LABELS: Record<RosterReconciliationResult["differences"][number]["field"], string> = {
  FULL_NAME: "姓名",
  GENDER: "性别",
  GRADE_YEAR: "入学年份",
  CLASS_SECTION: "教学班",
};

const PAGE_SIZE = 8;
const EMPTY_RESULTS: RosterReconciliationResult[] = [];
function canSubmitRoster(validation: ValidatedRosterImport, isDemo: boolean) {
  return isDemo ? validation.validRows > 0 : validation.totalRows > 0
    && validation.errors.every(error => error.code === 'DUPLICATE_STUDENT_NUMBER');
}
type StatusFilter = "ALL" | "NOT_JOINED" | "OTHER" | RosterReconciliationStatus;

function statusTone(status: RosterReconciliationStatus) {
  if (status === RosterReconciliationStatus.MATCHED) return "success";
  if (status === RosterReconciliationStatus.MISSING_IN_PLATFORM) return "warning";
  if (status === RosterReconciliationStatus.WRONG_COURSE || status === RosterReconciliationStatus.DUPLICATED) return "danger";
  return "neutral";
}

function formatCourse(course: RosterCourseReference | undefined) {
  return course ? course.name : "—";
}

function primaryStudent(result: RosterReconciliationResult) {
  return {
    studentNumber: result.officialStudent?.studentNumber ?? result.platformMember?.studentNumber ?? "—",
    name: result.officialStudent?.name ?? result.platformMember?.name ?? "—",
  };
}

function importErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "code" in error && error.code === "ROSTER_FILE_INVALID") {
    const requestId = "requestId" in error && typeof error.requestId === "string" ? ` 诊断编号：${error.requestId}` : "";
    return `名单文件未通过校验，请检查文件是否损坏、受密码保护，或扩展名与实际格式不符，修正后重新选择文件。${requestId}`;
  }
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code : error instanceof Error ? error.message : "FILE_PARSE_FAILED";
  const messages: Record<string, string> = {
    UNSUPPORTED_FILE_TYPE: "文件格式错误，请上传 .xlsx、.xls 或 .csv 文件。",
    EMPTY_FILE: "文件为空，或文件中没有可导入的数据。",
    FILE_TOO_LARGE: "文件过大，请将名单控制在 100 MB 以内。",
    FILE_PARSE_FAILED: "文件解析失败，请检查文件是否损坏或受密码保护。",
    MISSING_STUDENT_NUMBER_FIELD: "请选择学号所在的列。",
    MISSING_FULL_NAME_FIELD: "请选择姓名所在的列。",
    ROW_LIMIT_EXCEEDED: "名单超过 500 行，请拆分或整理后重新导入。",
    AUTH_REQUIRED: "登录已过期，请重新登录。",
    PERMISSION_DENIED: "你暂时没有检查这个班级名单的权限。",
    ROSTER_SCHEMA_INVALID: "请检查学号、姓名对应的列，以及名单中的数据是否完整。",
    ROSTER_IMPORT_FAILED: "名单中有无法识别的信息，请检查学号、姓名和选择的列后重试。",
    ROSTER_CHECK_INCOMPLETE: "名单已保存，但进班检查尚未完成。请重试检查，无需重新选择文件。",
    ROSTER_DUPLICATE_MAPPING: "这份文件已导入，但本次选择的列与上次不同。请恢复原来的选列，或修改名单文件后重新导入。",
    ROSTER_DUPLICATE_HISTORICAL: "这份文件是之前使用过的名单，当前已有更新的名单。请关闭窗口查看当前名单；如需替换，请更新文件后导入。",
    STALE_ROSTER_RESULT: "名单已有更新，请刷新后再检查。",
  };
  return messages[code] ?? "暂时未能完成操作，请稍后重试。";
}

type RosterReconciliationPageProps = {
  course: RosterCourseReference;
  courses: RosterCourseReference[];
  platformMembers: PlatformCourseMember[];
  onBack: () => void;
  showToast: (message: string) => void;
  canManage?: boolean;
};

export function RosterReconciliationPage({
  course,
  courses,
  platformMembers,
  onBack,
  showToast,
  canManage = true,
}: RosterReconciliationPageProps) {
  const isDemo = currentApiRequestMode() === "demo";
  const [bundle, setBundle] = useState<RosterReconciliationBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reconciling, setReconciling] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("NOT_JOINED");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<RosterReconciliationResult | null>(null);

  const context = useMemo(() => ({ course, courses, platformMembers }), [course, courses, platformMembers]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setBundle(await rosterReconciliationService.getBundle(course.id, context));
    } catch (loadError) {
      setError(importErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [context, course.id]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  const results = bundle?.results ?? EMPTY_RESULTS;
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return results
      .filter((result) => {
        const student = primaryStudent(result);
        const matchesSearch = !query || student.name.toLocaleLowerCase().includes(query) || student.studentNumber.toLocaleLowerCase().includes(query);
        const primaryStatus = result.status === RosterReconciliationStatus.MATCHED
          || result.status === RosterReconciliationStatus.MISSING_IN_PLATFORM
          || result.status === RosterReconciliationStatus.WRONG_COURSE
          || result.status === RosterReconciliationStatus.EXTRA_IN_PLATFORM;
        const matchesStatus = statusFilter === "ALL"
          || (statusFilter === "NOT_JOINED" ? result.status === "MISSING_IN_PLATFORM" || result.status === "WRONG_COURSE"
            : statusFilter === "OTHER" ? !primaryStatus : result.status === statusFilter);
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => primaryStudent(a).studentNumber.localeCompare(primaryStudent(b).studentNumber, "zh-CN", { numeric: true }));
  }, [results, search, statusFilter]);

  const resetResultNavigation = () => {
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const runReconciliation = async () => {
    if (!bundle?.currentRoster || reconciling) return;
    setReconciling(true);
    setError("");
    try {
      const next = await rosterReconciliationService.reconcile(context);
      setBundle(next);
      setPage(1);
      setDetail(null);
      showToast(
        isDemo
          ? "进班情况已更新（演示数据）。"
          : "进班情况已更新。",
      );
    } catch (reconcileError) {
      setError(importErrorMessage(reconcileError));
    } finally {
      setReconciling(false);
    }
  };

  const updateResolution = async (
    ids: string[],
    status: RosterResolutionStatus,
    reason: string,
  ) => {
    if (!canManage || reconciling || ids.length === 0) throw new Error("名单正在更新，请在核对完成后重试。");
    try {
      const next = await rosterReconciliationService.updateResolution(
        course.id,
        ids,
        status,
        reason,
      );
      setBundle(next);
      setDetail((current) => current ? next.results.find((item) => item.id === current.id) ?? null : null);
      showToast(
        status === RosterResolutionStatus.CONFIRMED
          ? isDemo
            ? "已保存核实情况（演示数据）。"
            : "已记录核实情况。"
          : isDemo
            ? "已保存核实情况（演示数据）。"
            : "已标记为需要重新核实。",
      );
    } catch (resolutionError) {
      setError(resolutionError instanceof Error && resolutionError.message === "STALE_ROSTER_RESULT"
        ? "进班情况已有更新，请关闭详情并重新检查。"
        : importErrorMessage(resolutionError));
      throw resolutionError;
    }
  };

  const selectStatus = (status: StatusFilter) => {
    setStatusFilter(status);
    resetResultNavigation();
  };

  if (loading && !bundle) {
    return <RosterLoading course={course} onBack={onBack} />;
  }

  if (error && !bundle) {
    return <RosterError course={course} message={error} onBack={onBack} onRetry={() => void load()} />;
  }

  if (!bundle) {
    return <RosterError course={course} message="暂时无法查看进班情况，请重试。" onBack={onBack} onRetry={() => void load()} />;
  }

  if (!bundle.currentRoster) {
    return (
      <section className="roster-reconciliation-page">
        <RosterHeader course={course} onBack={onBack} />
        <div className="roster-empty-import">
          <span><FileSpreadsheet aria-hidden="true" /></span>
          <h2>尚未导入官方名单</h2>
          <p>{isDemo ? "导入学校提供的 Excel 或 CSV 名单后，系统会按学号自动比对当前课程成员。" : "导入名单，选好学号和姓名所在的列，即可查看哪些学生还没进本班。"}</p>
          <button className="primary-button" type="button" disabled={!canManage || reconciling} onClick={() => setImportOpen(true)}><Upload size={17} aria-hidden="true" />导入官方名单</button>
          <small>{isDemo ? "当前为演示数据，仅用于体验操作。" : "检查后可提醒未进班的学生扫码或输入邀请码加入。"}</small>
        </div>
        {importOpen && <RosterImportDialog course={course} currentBundle={bundle} onClose={() => { setImportOpen(false); if (!isDemo) void load(); }} onImported={(next) => { setBundle(next); setImportOpen(false); setStatusFilter("NOT_JOINED"); setSearch(""); setPage(1); showToast(`检查完成：${next.stats.notJoined + next.stats.wrongCourse} 名学生未进本班。`); }} />}
      </section>
    );
  }

  const stats = bundle.stats;
  const conflicts = results.filter(result => result.status === "IDENTITY_CONFLICT").length;
  const duplicates = results.filter(result => result.status === "DUPLICATED").length;
  const extras = results.filter(result => result.status === "EXTRA_IN_PLATFORM").length;
  return (
    <section className="roster-reconciliation-page">
      <RosterHeader course={course} onBack={onBack}>
        <button className="secondary-button" type="button" disabled={reconciling || !canManage} onClick={() => void runReconciliation()}>
          <RefreshCw size={16} className={reconciling ? "is-spinning" : ""} aria-hidden="true" />{reconciling ? "正在检查" : "刷新进班情况"}
        </button>
        <button className="secondary-button" type="button" disabled={!canManage || reconciling} onClick={() => setImportOpen(true)}><Upload size={16} aria-hidden="true" />导入官方名单</button>
      </RosterHeader>

      {isDemo && <aside className="roster-mock-notice"><AlertTriangle size={18} aria-hidden="true" /><p>当前为演示数据，仅用于体验操作。</p></aside>}

      <section className="roster-version-strip roster-check-meta" aria-label="名单与检查时间">
        <div><span>导入名单</span><b>{bundle.currentRoster.version.totalRows} 行</b></div>
        <div><span>最近检查</span><time>{stats.lastReconciledAt ? new Date(stats.lastReconciledAt).toLocaleString("zh-CN") : "尚未检查，请点击刷新进班情况"}</time></div>
      </section>

      {error && <div className="roster-inline-error" role="alert"><AlertTriangle size={17} aria-hidden="true" /><span>{error}</span><button type="button" onClick={() => setError("")}>关闭</button></div>}

      {results.length > 0 && <>
        <section className="roster-check-conclusion" role="status" aria-label="名单检查结论">
          <Check size={32} aria-hidden="true" />
          <div><h2>名单中 <strong>{stats.matched + conflicts}</strong> 位学生已在本班</h2>
            <p>其中 {stats.matched} 位信息一致，{conflicts} 位学号相同但信息需要核实。</p>
            <p>{stats.notJoined + stats.wrongCourse} 位未进本班{duplicates > 0 ? `，另有 ${duplicates} 个重复学号需要核实` : ""}。本班另有 {extras} 位学生不在这份名单中。</p>
          </div>
        </section>
        <nav className="roster-result-buttons" aria-label="切换检查结果">
          <RosterStatCard label="未进本班" value={stats.notJoined + stats.wrongCourse} tone="warning" selected={statusFilter === "NOT_JOINED"} onClick={() => selectStatus("NOT_JOINED")} />
          <RosterStatCard label="已进班且信息一致" value={stats.matched} tone="success" selected={statusFilter === "MATCHED"} onClick={() => selectStatus("MATCHED")} />
          <RosterStatCard label="信息待核实" value={conflicts + duplicates} tone="neutral" selected={statusFilter === "OTHER"} onClick={() => selectStatus("OTHER")} />
          <RosterStatCard label="班内多出学生" value={extras} selected={statusFilter === "EXTRA_IN_PLATFORM"} onClick={() => selectStatus("EXTRA_IN_PLATFORM")} />
        </nav>
      </>}

      <ManagementTableLayout
        toolbar={
          <FilterToolbar ariaLabel="名单对齐筛选工具栏">
            <label className="search-field roster-search"><Search size={16} aria-hidden="true" /><input type="search" aria-label="搜索姓名或学号" value={search} onChange={(event) => { setSearch(event.target.value); resetResultNavigation(); }} placeholder="搜索姓名或学号" /></label>
          </FilterToolbar>
        }
      >
        <section className="roster-results-card">
          <div className="roster-results-heading"><div><h2>{statusFilter === "NOT_JOINED" ? "还未进本班的学生" : statusFilter === "OTHER" ? "信息需要核实的学生" : statusFilter === "EXTRA_IN_PLATFORM" ? "已进本班，但不在导入名单中" : "已进班且信息一致的学生"}</h2><p>{results.length ? `共 ${filtered.length} 条，按学号排列。学生加入后，点击“刷新进班情况”查看更新。` : "名单已保存，点击“刷新进班情况”开始检查。"}</p></div></div>
          {filtered.length === 0 ? <div className="roster-table-empty"><Check aria-hidden="true" /><h3>{!results.length ? "尚未检查进班情况" : search ? "没有找到这位学生" : statusFilter === "NOT_JOINED" ? "未发现尚未进本班的学生" : "没有需要显示的学生"}</h3><p>{!results.length ? "请点击上方“刷新进班情况”。" : statusFilter === "NOT_JOINED" && !search && conflicts + duplicates > 0 ? "还有信息需要核实的学生，请点击“信息待核实”查看。" : "可切换上方分类查看其他学生。"}</p></div> : <>
            <DataTable className="roster-reconciliation-table" minWidth={680}>
              <colgroup><col style={{width:"16%"}} /><col style={{width:"16%"}} /><col style={{width:"16%"}} /><col style={{width:"44%"}} /><col style={{width:"8%"}} /></colgroup>
              <thead><tr>
                <th>学号</th><th>姓名</th><th>进班情况</th><th>说明与建议</th><th className="action-column">详情</th>
              </tr></thead>
              <tbody>{pageRows.map((result) => {
                const student = primaryStudent(result);
                return <tr key={result.id} className={result.status === RosterReconciliationStatus.MATCHED ? "is-matched-row" : ""}>
                  <td><b className="roster-student-number" translate="no">{student.studentNumber}</b></td>
                  <td><button className="roster-student-link" type="button" disabled={reconciling} onClick={() => setDetail(result)}>{student.name}</button></td>
                  <td><span className={`roster-status is-${statusTone(result.status)}`}>{STATUS_LABELS[result.status]}</span></td>
                  <td><button className="roster-reason-link" type="button" disabled={reconciling} onClick={() => setDetail(result)}>{result.reason}</button></td>
                  <td className="action-column"><button className="text-button" type="button" disabled={reconciling} onClick={() => setDetail(result)}>查看</button></td>
                </tr>;
              })}</tbody>
            </DataTable>
            <div className="roster-pagination"><span>第 {page} / {totalPages} 页</span><div><button type="button" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</button><button type="button" disabled={page === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>下一页</button></div></div>
          </>}
        </section>
      </ManagementTableLayout>

      {detail && <RosterDetailDrawer result={detail} courses={courses} canManage={canManage} onClose={() => setDetail(null)} onResolution={(status, reason) => updateResolution([detail.id], status, reason)} />}
      {importOpen && <RosterImportDialog course={course} currentBundle={bundle} onClose={() => { setImportOpen(false); if (!isDemo) void load(); }} onImported={(next) => { setBundle(next); setImportOpen(false); setStatusFilter("NOT_JOINED"); setSearch(""); setPage(1); showToast(`检查完成：${next.stats.notJoined + next.stats.wrongCourse} 名学生未进本班。`); }} />}
    </section>
  );
}

function RosterHeader({ course, onBack, children }: { course: RosterCourseReference; onBack: () => void; children?: React.ReactNode }) {
  return <header className="roster-page-header"><div><button className="text-button roster-back-button" type="button" onClick={onBack}><ArrowLeft size={17} aria-hidden="true" />返回课程管理</button><span className="eyebrow">课程管理 · 检查学生进班</span><h1>检查学生进班</h1><p>{course.name}</p></div>{children && <div className="roster-header-actions">{children}</div>}</header>;
}

function RosterLoading({ course, onBack }: { course: RosterCourseReference; onBack: () => void }) {
  return <section className="roster-reconciliation-page" aria-busy="true"><RosterHeader course={course} onBack={onBack} /><div className="roster-loading"><RefreshCw className="is-spinning" aria-hidden="true" /><h2>正在查看进班情况</h2><p>正在读取名单和最近的检查结果。</p></div></section>;
}

function RosterError({ course, message, onBack, onRetry }: { course: RosterCourseReference; message: string; onBack: () => void; onRetry: () => void }) {
  return <section className="roster-reconciliation-page"><RosterHeader course={course} onBack={onBack} /><div className="roster-loading is-error"><AlertTriangle aria-hidden="true" /><h2>暂时无法查看进班情况</h2><p>{message}</p><button className="primary-button" type="button" onClick={onRetry}>重新加载</button></div></section>;
}

function RosterStatCard({ label, value, tone = "default", selected, onClick }: { label: string; value: number | string; tone?: "default" | "success" | "warning" | "danger" | "neutral"; selected: boolean; onClick: () => void }) {
  return <button className={`roster-result-button is-${tone} ${selected ? "is-selected" : ""}`} type="button" onClick={onClick} aria-pressed={selected}><span>{label}</span><b>{value}</b>{selected && <Check size={18} aria-hidden="true" />}</button>;
}

function RosterDetailDrawer({ result, courses, canManage, onClose, onResolution }: { result: RosterReconciliationResult; courses: RosterCourseReference[]; canManage: boolean; onClose: () => void; onResolution: (status: RosterResolutionStatus, reason: string) => Promise<void> }) {
  const isDemo = currentApiRequestMode() === "demo";
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const student = primaryStudent(result);
  const officialCourse = courses.find((course) => course.id === result.officialStudent?.courseId);
  const platformCourse = courses.find((course) => course.id === result.platformMember?.courseId);
  const submitResolution = async (status: RosterResolutionStatus) => {
    if (!reason.trim()) {
      setActionError("请填写本次确认或重新打开的原因。");
      return;
    }
    setSaving(true);
    setActionError("");
    try {
      await onResolution(status, reason);
      setReason("");
    } catch {
      setActionError(isDemo ? "处理状态更新失败，请重试。" : "暂时未能保存，请稍后重试。");
    } finally {
      setSaving(false);
    }
  };
  return <div className="modal-backdrop roster-drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal teacher-dialog review-drawer roster-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="roster-detail-title">
      <div className="modal-head"><div><span className="eyebrow">差异详情</span><h2 id="roster-detail-title">{student.name} · {student.studentNumber}</h2><p>学生信息与核实记录</p></div><button className="icon-button" type="button" aria-label="关闭差异详情" onClick={onClose}><X aria-hidden="true" /></button></div>
      <div className="teacher-dialog-body">
        <section className="roster-decision-card"><span className={`roster-status is-${statusTone(result.status)}`}>{STATUS_LABELS[result.status]}</span><h3>进班情况说明</h3><p>{result.reason}</p></section>
        <div className="roster-comparison-grid">
          <section><h3>官方名单信息</h3><dl><div><dt>学号</dt><dd translate="no">{result.officialStudent?.studentNumber ?? "—"}</dd></div><div><dt>姓名</dt><dd>{result.officialStudent?.name ?? "—"}</dd></div><div><dt>性别</dt><dd>{result.officialStudent?.gender ?? "—"}</dd></div><div><dt>年级</dt><dd>{result.officialStudent?.grade ?? "—"}</dd></div><div><dt>官方归属课程</dt><dd>{formatCourse(officialCourse)}</dd></div></dl></section>
          <section><h3>平台学生信息</h3><dl><div><dt>学号</dt><dd translate="no">{result.platformMember?.studentNumber ?? "—"}</dd></div><div><dt>姓名</dt><dd>{result.platformMember?.name ?? "—"}</dd></div><div><dt>性别</dt><dd>{result.platformMember?.gender ?? "—"}</dd></div><div><dt>年级</dt><dd>{result.platformMember?.grade ?? "—"}</dd></div><div><dt>当前加入课程</dt><dd>{formatCourse(platformCourse)}</dd></div></dl></section>
        </div>
        <section className="roster-difference-list"><h3>需要核实的信息</h3>{result.differences.length === 0 ? <p>学号、姓名等信息没有发现差异。</p> : result.differences.map((difference, index) => <div key={`${difference.field}-${index}`}><b>{DIFFERENCE_LABELS[difference.field]}</b><span>官方：{difference.officialValue ?? "—"}</span><span>平台：{difference.platformValue ?? "—"}</span></div>)}</section>
        {result.teacherNote && <section className="roster-operation-log"><h3>{isDemo ? "最近操作记录" : "最近核实说明"}</h3><p>{result.teacherNote}</p></section>}
        <FormField
          className="roster-note-field"
          label="本次处理原因"
          required
          hint={`${reason.length} / 1000`}
          error={actionError || undefined}
          controlId="roster-resolution-reason"
        >
          <textarea
            id="roster-resolution-reason"
            rows={4}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setActionError("");
            }}
            maxLength={1000}
            placeholder={isDemo ? "记录核实情况或后续处理计划" : "请填写核实情况，例如已联系学生重新加入本班。"}
          />
        </FormField>

      </div>
      <div className="modal-footer"><button className="secondary-button" type="button" onClick={onClose}>关闭</button>{(result.resolutionStatus === RosterResolutionStatus.RESOLVED || result.resolutionStatus === RosterResolutionStatus.IGNORED) && <button className="secondary-button" type="button" disabled={!canManage || saving} onClick={() => void submitResolution(RosterResolutionStatus.PENDING)}>{saving ? "正在提交" : "重新打开"}</button>}{result.status !== RosterReconciliationStatus.MATCHED && result.resolutionStatus === RosterResolutionStatus.PENDING && <button className="primary-button" type="button" disabled={!canManage || saving} onClick={() => void submitResolution(RosterResolutionStatus.CONFIRMED)}>{saving ? "正在提交" : "确认该异常"}</button>}</div>
    </section>
  </div>;
}

function RosterImportDialog({ course, currentBundle, onClose, onImported }: { course: RosterCourseReference; currentBundle: RosterReconciliationBundle; onClose: () => void; onImported: (bundle: RosterReconciliationBundle) => void }) {
  const isDemo = currentApiRequestMode() === "demo";
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedRosterFile | null>(null);
  const [mapping, setMapping] = useState<RosterFieldMapping | null>(null);
  const [validation, setValidation] = useState<ValidatedRosterImport | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    setParsing(true);
    setError("");
    setValidation(null);
    try {
      if (!isDemo && !/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error("UNSUPPORTED_FILE_TYPE");
      const next = await parseOfficialRosterFile(file);
      setParsed(next);
      setMapping(next.suggestedMapping);
    } catch (nextError) {
      setParsed(null);
      setMapping(null);
      setError(importErrorMessage(nextError));
    } finally {
      setParsing(false);
    }
  };

  const confirmImport = async () => {
    if (!parsed || !mapping || importing) return;
    setError("");
    let checked: ValidatedRosterImport;
    try {
      checked = validateOfficialRosterFile(parsed, mapping);
      setValidation(checked);
      if (!canSubmitRoster(checked, isDemo)) {
        setError("请先修正下方提示的问题，再检查进班情况。");
        return;
      }
    } catch (nextError) {
      setError(importErrorMessage(nextError));
      return;
    }
    setImporting(true);
    try {
      const next = await rosterReconciliationService.importOfficialRoster({ course, parsed, mapping });
      onImported(next);
    } catch (nextError) {
      setError(importErrorMessage(nextError));
    } finally {
      setImporting(false);
    }
  };

  const step = parsed ? 2 : 1;
  return createPortal(<div className="modal-backdrop roster-import-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !importing && onClose()}>
    <section className="modal teacher-dialog teacher-dialog-wide roster-import-dialog" role="dialog" aria-modal="true" aria-labelledby="roster-import-title">
      <div className="modal-head"><div><span className="eyebrow">导入名单 · 第 {step} 步，共 2 步</span><h2 id="roster-import-title">导入官方名单</h2><p>{course.name}</p></div><button className="icon-button" type="button" disabled={importing} aria-label="关闭导入" onClick={onClose}><X aria-hidden="true" /></button></div>
      <div className="teacher-dialog-body">
        {!isDemo && !parsed && <OcrImportPanel courseId={course.id} purpose="ROSTER" />}
        <ol className="roster-import-steps roster-check-steps" aria-label="导入进度"><li className="active">1 选择名单</li><li className={step >= 2 ? "active" : ""}>2 确认各列后检查</li></ol>
        {!parsed && <section className="roster-file-picker"><input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" aria-label="选择学校官方课程名单文件" aria-describedby="roster-file-help" onChange={(event) => void chooseFile(event.target.files?.[0])} /><FileSpreadsheet aria-hidden="true" /><h3>{parsing ? "正在解析文件" : "选择学校官方课程名单"}</h3><p id="roster-file-help">支持 .xlsx、.xls 和 .csv，最大 100 MB、最多 500 行。学号始终按字符串处理。</p><button className="primary-button" type="button" disabled={parsing} onClick={() => inputRef.current?.click()}><Upload size={17} aria-hidden="true" />{parsing ? "正在解析" : "选择文件"}</button></section>}
        {parsed && mapping && <>
          <section className="roster-file-summary"><FileSpreadsheet aria-hidden="true" /><div><h3>{parsed.fileName}</h3><p>{parsed.sheetName} · {parsed.totalRows} 行数据</p></div><button className="text-button" type="button" disabled={importing} onClick={() => { setParsed(null); setMapping(null); setValidation(null); setError(""); }}>更换文件</button></section>

          <section className="roster-mapping-section"><div><h3>这些信息分别在哪一列？</h3><p>已帮你选择常见表头。请确认学号和姓名对应的列，其他信息可不选。</p></div><div className="roster-mapping-grid">{ROSTER_IMPORT_FIELDS.map((field) => <AppSelect key={field} disabled={importing} label={`${FIELD_LABELS[field]}${field === "studentNumber" || field === "fullName" ? " *" : ""}`} value={mapping[field] ?? ""} options={[{ value: "", label: field === "studentNumber" || field === "fullName" ? "请选择对应的列" : "不使用这一列" }, ...parsed.headers.map((header) => ({ value: header, label: header }))]} onChange={(value) => { setMapping((current) => current ? { ...current, [field]: value ? String(value) : null } : current); setValidation(null); setError(""); }} />)}</div></section>
          <section className="roster-preview-section"><div><h3>数据预览</h3><p>显示前 {Math.min(3, parsed.previewRows.length)} 行，请确认姓名和学号是否正确。</p></div><DataTable minWidth={Math.max(720, parsed.headers.length * 150)}><thead><tr>{parsed.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{parsed.previewRows.slice(0, 3).map((row, index) => <tr key={index}>{parsed.headers.map((header) => <td key={header} translate={mapping.studentNumber === header ? "no" : undefined}>{row[header] || "—"}</td>)}</tr>)}</tbody></DataTable></section>
          {currentBundle.currentRoster && <p className="roster-replace-note">将使用这份名单重新检查进班情况，之前导入的名单仍会保留。</p>}
          <p>点击下方按钮后，会按学号检查谁还没进本班。学生仍需自行扫码或输入邀请码加入。</p>
        </>}
        {validation && validation.errors.length > 0 && <section className="roster-validation-errors"><h3>请检查名单中的这些信息</h3><p>缺少或格式不正确的信息需要修正；重复学号会在“需要核实”中提示。</p><div>{validation.errors.slice(0, 12).map((item) => <span key={`${item.rowNumber}-${item.code}`}><b>第 {item.rowNumber} 行</b>{item.message}</span>)}</div>{validation.errors.length > 12 && <small>另有 {validation.errors.length - 12} 条提示。</small>}</section>}
        {error && <p className="form-error roster-import-error" role="alert">{error}</p>}
      </div>
      <div className="modal-footer"><button className="secondary-button" type="button" disabled={importing} onClick={onClose}>取消</button>{parsed && <button className="primary-button" type="button" disabled={importing} onClick={() => void confirmImport()}>{importing ? "正在检查进班情况…" : "检查谁还没进班"}</button>}</div>
    </section>
  </div>, document.body);
}
