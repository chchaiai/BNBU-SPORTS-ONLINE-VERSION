"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminClassRecords } from "./admin-class-records";
import { AppSelect } from "./app-select";
import { loadCourseDirectory, type DirectorySummary } from "./admin-course-directory-api";
import { toUserFacingError, type UserFacingError } from "./api-client";
import { ErrorPanel, localUserFacingError } from "./error-panel";
import type { AdminLocale } from "./admin-types";
import type { WorkspaceMode } from "./portal-app";
import {
  AdminBadge,
  AdminEmpty,
  AdminField,
  AdminLoading,
  AdminSectionHeading,
} from "./admin-components";

import type { NotificationTarget } from "./portal-notifications";

type CourseDashboardRow = {
  id: string;
  courseName: string;
  teacherId: string;
  teacherName: string;
  semesterName: string;
  status: string;
  enrollmentOpen: boolean;
  activeStudents: number;
  activeStudentIds: string[];
  removedStudents: number;
  submittedStudents: number;
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  creditedSeconds: number;
  courseTargetSeconds: number | null;
  generalTargetSeconds: number | null;
  checkInWindow: string;
  completedStudents?: number | null;
  completionRate?: number | null;
};

const demoRows: CourseDashboardRow[] = [
  {
    id: "demo-section-pe101-01",
    courseName: "大学体育（一）",
    teacherId: "demo-teacher-zhang",
    teacherName: "张老师",
    semesterName: "2025-2026 第二学期",
    status: "ACTIVE",
    enrollmentOpen: true,
    activeStudents: 42,
    activeStudentIds: Array.from({ length: 42 }, (_, index) => `pe101-${index + 1}`),
    removedStudents: 1,
    submittedStudents: 38,
    totalRecords: 286,
    validRecords: 271,
    invalidRecords: 15,
    creditedSeconds: 1_842_600,
    courseTargetSeconds: 36_000,
    generalTargetSeconds: 36_000,
    checkInWindow: "2026年2月23日 – 2026年7月31日 · 06:00–22:00",
  },
  {
    id: "demo-section-pe204-02",
    courseName: "羽毛球基础",
    teacherId: "demo-teacher-li",
    teacherName: "李老师",
    semesterName: "2025-2026 第二学期",
    status: "ACTIVE",
    enrollmentOpen: true,
    activeStudents: 36,
    activeStudentIds: Array.from({ length: 36 }, (_, index) => `pe204-${index + 1}`),
    removedStudents: 0,
    submittedStudents: 32,
    totalRecords: 219,
    validRecords: 207,
    invalidRecords: 12,
    creditedSeconds: 1_386_000,
    courseTargetSeconds: 28_800,
    generalTargetSeconds: 43_200,
    checkInWindow: "2026年2月23日 – 2026年7月31日 · 06:30–21:30",
  },
  {
    id: "demo-section-pe310-01",
    courseName: "体能训练",
    teacherId: "demo-teacher-chen",
    teacherName: "陈老师",
    semesterName: "2025-2026 第二学期",
    status: "UPCOMING",
    enrollmentOpen: false,
    activeStudents: 33,
    activeStudentIds: Array.from({ length: 33 }, (_, index) => `pe310-${index + 1}`),
    removedStudents: 2,
    submittedStudents: 0,
    totalRecords: 0,
    validRecords: 0,
    invalidRecords: 0,
    creditedSeconds: 0,
    courseTargetSeconds: 36_000,
    generalTargetSeconds: 36_000,
    checkInWindow: "尚未开放",
  },
];

function durationLabel(locale: AdminLocale, seconds: number) {
  const hours = seconds / 3600;
  return locale === "zh"
    ? `${hours.toLocaleString("zh-CN", { maximumFractionDigits: 1 })} 小时`
    : `${hours.toLocaleString("en", { maximumFractionDigits: 1 })} hours`;
}

function dateLabel(locale: AdminLocale, value: string | null | undefined) {
  if (!value) return locale === "zh" ? "未设置" : "Not set";
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function timeLabel(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  return value.slice(0, 5);
}

async function loadRealRows(locale: AdminLocale) {
  const directory = await loadCourseDirectory();
  const rows: CourseDashboardRow[] = directory.rows.map(section => ({
    ...section, activeStudentIds: [],
    checkInWindow: section.checkInWindowMode === "UNAVAILABLE"
      ? locale === "zh" ? "未开放" : "Unavailable"
      : `${dateLabel(locale, section.checkInStartDate)} – ${dateLabel(locale, section.checkInEndDate)} · ${timeLabel(section.dailyStartTime, "—")}–${timeLabel(section.dailyEndTime, "—")}`,
  }));
  return { rows, summary: directory.summary };
}
export function AdminCourses({
  notificationTarget,
  locale,
  mode,
}: {
  notificationTarget?: NotificationTarget|null;
  locale: AdminLocale;
  mode: WorkspaceMode;
}) {
  const [rows, setRows] = useState<CourseDashboardRow[]>([]);
  const [realSummary, setRealSummary] = useState<DirectorySummary>({ courses: 0, students: 0, teachers: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<UserFacingError | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const directory = mode === "demo" ? null : await loadRealRows(locale);
      const loaded = directory?.rows ?? demoRows;
      if (directory) setRealSummary(directory.summary);
      setRows([...loaded].sort((left, right) => left.courseName.localeCompare(right.courseName)));
    } catch (failure) {
      setError(toUserFacingError(failure, locale));
    } finally {
      setLoading(false);
    }
  }, [locale, mode]);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => { void load(); }, 0);
    return () => globalThis.clearTimeout(timer);
  }, [load]);

  const [targetError,setTargetError]=useState<UserFacingError|null>(null);
  const openedNotification=useRef<NotificationTarget|null>(null);
  useEffect(()=>{
    if(mode!=='real'||notificationTarget?.targetType!=='CLASS_SECTION'||loading||error||openedNotification.current===notificationTarget)return;
    openedNotification.current=notificationTarget;setTargetError(null);setExpandedId(null);setQuery('');setStatus('all');
    if(rows.some(row=>row.id===notificationTarget.targetId))setExpandedId(notificationTarget.targetId);
    else setTargetError({...localUserFacingError(locale==='zh'?'相关课程不在当前可查看目录中，可能已关闭、归档或无权查看。':'This course is outside the current directory; it may be closed, archived or inaccessible.',locale),title:locale==='zh'?'无法定位课程':'Course unavailable',action:locale==='zh'?'刷新目录后重试。':'Refresh the directory and retry.'});
  },[notificationTarget,loading,error,rows,mode,locale]);
  useEffect(()=>{
    if(!expandedId)return;const frame=requestAnimationFrame(()=>document.querySelector('.course-focus')?.scrollIntoView({block:'start'}));return()=>cancelAnimationFrame(frame);
  },[expandedId]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return rows.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      return !normalized || `${row.courseName} ${row.teacherName}`.toLocaleLowerCase().includes(normalized);
    });
  }, [query, rows, status]);

  const summary = useMemo(() => mode === "real" ? realSummary : ({
    courses: rows.length,
    students: new Set(rows.flatMap((row) => row.activeStudentIds)).size,
    teachers: new Set(rows.map((row) => row.teacherId)).size,
  }), [rows, mode, realSummary]);
  if (loading) return <AdminLoading locale={locale} />;
  const selectedCourse = rows.find(row => row.id === expandedId);
  if (selectedCourse) return <div className="admin-page-stack admin-course-dashboard course-focus">
    <nav className="course-breadcrumb" aria-label="当前位置"><button onClick={() => setExpandedId(null)}>课程目录</button><span>/</span><span aria-current="page">{selectedCourse.courseName}</span></nav>
    <header className="course-focus-header"><div><span className="course-eyebrow">班级详情</span><h2>{selectedCourse.courseName}</h2><p>{selectedCourse.teacherName} · {selectedCourse.semesterName}</p></div><button className="secondary-button" onClick={() => setExpandedId(null)}>← 返回课程列表</button></header>
    <div className="course-focus-summary"><span>在班学生 <b>{selectedCourse.activeStudents}</b></span><span>已提交学生 <b>{selectedCourse.submittedStudents}</b></span><span>打卡记录 <b>{selectedCourse.totalRecords}</b></span><span>计入时长 <b>{durationLabel(locale, selectedCourse.creditedSeconds)}</b></span></div>
    <details className="course-settings"><summary>课程目标与打卡时间</summary><p>允许打卡：{selectedCourse.checkInWindow}</p><p>课程相关目标：{selectedCourse.courseTargetSeconds === null ? '—' : durationLabel(locale, selectedCourse.courseTargetSeconds)} · 其他运动目标：{selectedCourse.generalTargetSeconds === null ? '—' : durationLabel(locale, selectedCourse.generalTargetSeconds)}</p></details>
    {mode === 'real' ? <AdminClassRecords classSectionId={selectedCourse.id} locale={locale}/> : <p>演示课程暂无真实学生记录。</p>}
  </div>;


  return (
    <div className="admin-page-stack admin-course-dashboard">
      <section className="admin-course-hero">
        <div>
          <span>{locale === "zh" ? "当前学期 · 只读看板" : "Current semester · Read-only"}</span>
          <h2>{locale === "zh" ? "课程目录看板" : "Course directory dashboard"}</h2>
          <p>{locale === "zh" ? "查看当前课程、学生参与和打卡运行情况。管理员只能查看，不能创建、编辑、关闭或删除课程。" : "Review current courses, student participation, and check-in activity. Administrators cannot create, edit, close, or delete courses."}</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void load()}>
          {locale === "zh" ? "刷新数据" : "Refresh"}
        </button>
      </section>

      <ErrorPanel error={targetError??error} locale={locale} />

      <section className="admin-course-metrics" aria-label={locale === "zh" ? "课程汇总" : "Course summary"}>
        <article><span>{locale === "zh" ? "当前课程数" : "Current courses"}</span><b>{summary.courses}</b><small>{locale === "zh" ? "当前学期未关闭课程" : "Open courses this semester"}</small></article>
        <article><span>{locale === "zh" ? "总学生数" : "Total students"}</span><b>{summary.students}</b><small>{locale === "zh" ? "当前课程有效成员去重" : "Unique active course members"}</small></article>
        <article><span>{locale === "zh" ? "总教师数" : "Total teachers"}</span><b>{summary.teachers}</b><small>{locale === "zh" ? "当前课程责任教师去重" : "Unique responsible teachers"}</small></article>
      </section>

      <section className="admin-surface admin-course-list-surface">
        <AdminSectionHeading
          title={locale === "zh" ? "课程列表" : "Courses"}
          description={locale === "zh" ? "选择课程查看班级学生，再进入学生的打卡记录与凭证。" : "Scan each class summary first, then expand semester, target, and membership details when needed."}
        />
        <div className="admin-audit-filters admin-course-filters">
          <AdminField locale={locale} label={locale === "zh" ? "搜索课程" : "Search courses"}>
            <input type="search" value={query} placeholder={locale === "zh" ? "课程名称或教师" : "Course name or teacher"} onChange={(event) => setQuery(event.target.value)} />
          </AdminField>
          <AppSelect
            label={locale === "zh" ? "课程状态" : "Course status"}
            value={status}
            options={[
              { value: "all", label: locale === "zh" ? "全部状态" : "All statuses" },
              { value: "ACTIVE", label: locale === "zh" ? "进行中" : "Active" },
              { value: "UPCOMING", label: locale === "zh" ? "即将开始" : "Upcoming" },
            ]}
            onChange={(value) => value && setStatus(String(value))}
          />
        </div>

        {filtered.length === 0 ? <AdminEmpty locale={locale} filtered={Boolean(query || status !== "all")} /> : (
          <div className="admin-course-cards">
            {filtered.map((row) => {
              const expanded = expandedId === row.id;
              const tone = row.status === "ACTIVE" ? "green" : row.status === "UPCOMING" ? "orange" : "gray";
              const averageSeconds = row.activeStudents > 0 ? row.creditedSeconds / row.activeStudents : 0;
              return (
                <article id={`admin-course-${row.id}`} className={`admin-course-card${expanded ? " is-expanded" : ""}`} key={row.id}>
                  <div className="admin-course-card-head">
                    <div className="admin-course-identity">
                      <div><h3>{row.courseName}</h3><p>{row.teacherName}</p></div>
                    </div>
                    <AdminBadge tone={tone}>{locale === "zh" ? ({ACTIVE:"进行中",UPCOMING:"即将开始"}[row.status] ?? row.status) : row.status}</AdminBadge>
                  </div>
                  <div className="admin-course-card-stats">
                    <span><small>{locale === "zh" ? "有效学生" : "Students"}</small><b>{row.activeStudents}</b></span>
                    <span><small>{locale === "zh" ? "已提交学生" : "Submitted"}</small><b>{row.submittedStudents}</b></span>
                    <span><small>{locale === "zh" ? "打卡记录" : "Records"}</small><b>{row.totalRecords}</b></span>
                    <span><small>{locale === "zh" ? "有效 / 无效" : "Valid / invalid"}</small><b>{row.validRecords} / {row.invalidRecords}</b></span>
                    <span><small>{locale === "zh" ? "计入时长" : "Credited"}</small><b>{durationLabel(locale, row.creditedSeconds)}</b></span>
                  </div>
                  <div className="admin-course-hours admin-course-completion" aria-label={locale === "zh" ? `${row.courseName}完成全部打卡学生占比` : `${row.courseName} full check-in completion rate`}>
                    <div>
                      <span>{locale === "zh" ? "完成全部打卡学生占比" : "Students completing all check-ins"}</span>
                      <b>{row.completionRate == null ? '—' : `${row.completionRate.toLocaleString(locale === 'zh' ? 'zh-CN' : 'en', { maximumFractionDigits: 1 })}%`}</b>
                      <small>{row.completedStudents == null ? (locale === 'zh' ? '课程目标尚未发布' : 'Course targets are not published') : row.activeStudents === 0 ? (locale === 'zh' ? '暂无有效学生' : 'No active students') : (locale === 'zh' ? `${row.completedStudents} / ${row.activeStudents} 名学生已完成两类目标` : `${row.completedStudents} / ${row.activeStudents} students completed both targets`)}</small>
                    </div>
                    <div className={`admin-course-hours-track${row.completionRate == null ? ' is-unavailable' : ''}`} role="progressbar" aria-label={locale === "zh" ? "课程完成率" : "Course completion rate"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={row.completionRate ?? undefined}>
                      <i style={{ width: `${row.completionRate ?? 0}%` }} />
                    </div>
                  </div>
                  <button className="admin-course-expand" type="button" aria-expanded={expanded} onClick={() => setExpandedId(expanded ? null : row.id)}>
                    {expanded ? (locale === "zh" ? "收起详情" : "Hide details") : (locale === "zh" ? "查看班级学生 →" : "View class students")}
                    <span aria-hidden="true">{expanded ? "−" : "+"}</span>
                  </button>
                  {expanded && mode === "real" && <AdminClassRecords classSectionId={row.id} locale={locale}/>}
                  {expanded && (
                    <div className="admin-course-detail-grid">
                      <span><small>{locale === "zh" ? "当前学期" : "Semester"}</small><b>{row.semesterName}</b></span>
                      <span><small>{locale === "zh" ? "责任教师" : "Teacher"}</small><b>{row.teacherName}</b></span>
                      <span><small>{locale === "zh" ? "允许打卡时间" : "Check-in window"}</small><b>{row.checkInWindow}</b></span>
                      <span><small>{locale === "zh" ? "成员状态" : "Membership"}</small><b>{row.activeStudents} {locale === "zh" ? "名有效" : "active"} · {row.removedStudents} {locale === "zh" ? "名已移出" : "removed"}</b></span>
                      <span><small>{locale === "zh" ? "课程相关目标" : "Course target"}</small><b>{row.courseTargetSeconds === null ? "—" : durationLabel(locale, row.courseTargetSeconds)}</b></span>
                      <span><small>{locale === "zh" ? "其他运动目标" : "General target"}</small><b>{row.generalTargetSeconds === null ? "—" : durationLabel(locale, row.generalTargetSeconds)}</b></span>
                      <span><small>{locale === "zh" ? "人均计入时长" : "Average credited duration"}</small><b>{durationLabel(locale, averageSeconds)}</b></span>
                      <span><small>{locale === "zh" ? "入班状态" : "Enrollment"}</small><b>{row.enrollmentOpen ? (locale === "zh" ? "开放" : "Open") : (locale === "zh" ? "关闭" : "Closed")}</b></span>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
