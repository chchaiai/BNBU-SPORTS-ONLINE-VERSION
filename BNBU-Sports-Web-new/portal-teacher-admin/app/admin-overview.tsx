"use client";
import { useState } from 'react';
import { AdminOutbox } from './admin-outbox';

import { adminCopy, adminLabel } from "./admin-i18n";
import { useAdminStore } from "./admin-store";
import type { AdminLocale, AdminRoute } from "./admin-types";
import type { WorkspaceMode } from "./portal-app";
import {
  AdminBadge,
  AdminSectionHeading,
  formatAdminDate,
} from "./admin-components";

export function AdminOverview({
  locale,
  mode,
  onNavigate,
}: {
  locale: AdminLocale;
  mode: WorkspaceMode;
  onNavigate: (route: AdminRoute) => void;
}) {
  const { state, loading, refresh } = useAdminStore();
  const [showOutbox,setShowOutbox]=useState(false);
  if (!state) return null;
  const current = state.semesters.find(
    (semester) => semester.status === "current",
  );
  const students = state.users.filter((user) => user.role === "student");
  const teachers = state.users.filter((user) => user.role === "teacher");
  const activeStudents = students.filter((user) => user.status === "ACTIVE").length;
  const studentsWithClass = students.filter((student) => Boolean(student.className)).length;
  const classCount = new Set(students.map((student) => student.className).filter(Boolean)).size;

  const healthRows = [
    {
      label: adminCopy(locale, "api_service"),
      status: state.health.apiStatus,
      value:
        state.health.apiLatencyMs === null
          ? adminCopy(locale, "not_available")
          : `${state.health.apiLatencyMs} ms`,
    },
    {
      label: adminCopy(locale, "database"),
      status: state.health.databaseStatus,
      value:
        state.health.databaseLatencyMs === null
          ? adminCopy(locale, "not_available")
          : `${state.health.databaseLatencyMs} ms`,
    },
    {
      label: adminCopy(locale, "notification_queue"),
      queryOnly: true,
      status: state.health.notificationQueueStatus,
      value:
        state.health.notificationQueueStatus === "UP"
          ? adminCopy(locale, "backlog", {
              count: state.health.notificationBacklog,
            })
          : adminCopy(locale, "not_available"),
    },
    {
      label: adminCopy(locale, "object_storage"),
      status: state.health.objectStorageStatus,
      value:
        state.health.objectStorageLatencyMs === null
          ? adminCopy(locale, "not_available")
          : `${state.health.objectStorageLatencyMs} ms`,
    },
    {
      label: adminCopy(locale, "media_storage"),
      status: state.health.mediaStorageStatus,
      value:
        state.health.mediaStorageLatencyMs === null
          ? adminCopy(locale, "not_available")
          : `${state.health.mediaStorageLatencyMs} ms`,
    },
  ];
  const healthTone = (status: "UP" | "DOWN" | "NOT_CONFIGURED") =>
    status === "UP"
      ? ("green" as const)
      : status === "DOWN"
        ? ("red" as const)
        : ("gray" as const);
  const healthLabel = (status: "UP" | "DOWN" | "NOT_CONFIGURED") =>
    status === "UP"
      ? adminCopy(locale, "normal")
      : status === "DOWN"
        ? adminCopy(locale, "health_down")
        : adminCopy(locale, "health_not_configured");

  if (mode === "real") {
    return (
      <div className="admin-page-stack">
        <aside className="admin-readonly-banner">
          <span aria-hidden="true">API</span>
          <b>{adminCopy(locale, "api_data_notice")}</b>
        </aside>
        <section className="admin-surface">
          <AdminSectionHeading
            title={adminCopy(locale, "health")}
            description={`${adminCopy(locale, "health_hint", { time: formatAdminDate(locale, state.health.checkedAt, true) })} · requestId: ${state.health.requestId ?? adminCopy(locale, "not_available")}`}
            action={
              <button
                className="text-button"
                type="button"
                disabled={loading}
                onClick={() => void refresh()}
              >
                {loading
                  ? adminCopy(locale, "processing")
                  : adminCopy(locale, "refresh_health")}
              </button>
            }
          />
          <div className="admin-health-list">
            {healthRows.map((row) => (
              <div key={row.label}>
                <span className="status-dot" />
                <b>{row.queryOnly?<button type="button" className="text-button" onClick={()=>setShowOutbox(value=>!value)}>{row.label} · {locale==='zh'?'查看详情':'View details'}</button>:row.label}</b>
                <small>{row.value}</small>
                <AdminBadge tone={row.queryOnly && row.status === "UP" ? "gray" : healthTone(row.status)}>
                  {row.queryOnly && row.status === "UP" ? adminCopy(locale, "event_query_available") : healthLabel(row.status)}
                </AdminBadge>
              </div>
            ))}
          </div>
        </section>
        {showOutbox&&<AdminOutbox locale={locale}/>}
        <section className="admin-surface">
          <p className="admin-quiet-empty">
            {locale === "zh"
              ? "请从侧栏进入课程目录、用户管理、学生反馈、帮助中心和其他管理功能。可用操作以当前账号权限和服务器返回结果为准。"
              : "Use the sidebar to open the course directory, user management, student feedback, help center, and other administration features. Available actions depend on your account permissions and server responses."}
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="admin-page-stack admin-overview-page">
      <section
        className="admin-summary-grid"
        aria-label={adminCopy(locale, "overview_metrics")}
      >
        <button type="button" onClick={() => onNavigate("system")}>
          <span>{adminCopy(locale, "system_mode")}</span>
          <b>{adminLabel(locale, "systemMode", state.systemMode.mode)}</b>
          <small>
            {formatAdminDate(locale, state.systemMode.changedAt, true)}
          </small>
        </button>
        <button type="button" onClick={() => onNavigate("semesters")}>
          <span>{adminCopy(locale, "current_semester")}</span>
          <b>{current?.name ?? adminCopy(locale, "no_current_semester")}</b>
          <small>
            {current
              ? `${formatAdminDate(locale, current.startDate)} – ${formatAdminDate(locale, current.endDate)}`
              : adminCopy(locale, "not_available")}
          </small>
        </button>
      </section>

      <div className="admin-overview-layout">
        <section className="admin-surface admin-overview-insights">
          <AdminSectionHeading
            title={locale === "zh" ? "学生与班级数据" : "Student and class data"}
            description={locale === "zh" ? "根据当前管理空间内的学生、教师和行政班级资料实时汇总。" : "Calculated from the student, teacher, and administrative-class records in this workspace."}
          />
          <div className="admin-overview-insight-grid">
            <article><span>{locale === "zh" ? "学生总数" : "Students"}</span><b>{students.length}</b><small>{locale === "zh" ? `已进班 ${activeStudents} 人` : `${activeStudents} enrolled`}</small></article>
            <article><span>{locale === "zh" ? "行政班级" : "Classes"}</span><b>{classCount}</b><small>{locale === "zh" ? `${studentsWithClass} 人已有班级资料` : `${studentsWithClass} students assigned`}</small></article>
            <article><span>{locale === "zh" ? "教师总数" : "Teachers"}</span><b>{teachers.length}</b><small>{locale === "zh" ? "当前教师账号" : "Current teacher accounts"}</small></article>
          </div>
        </section>
        <section className="admin-surface admin-overview-health">
          <AdminSectionHeading
            title={adminCopy(locale, "health")}
            description={adminCopy(locale, "health_hint", {
              time: formatAdminDate(locale, state.health.checkedAt, true),
            })}
            action={
              <button
                className="text-button"
                type="button"
                disabled={loading}
                onClick={() => void refresh()}
              >
                {loading
                  ? adminCopy(locale, "processing")
                  : adminCopy(locale, "refresh_health")}
              </button>
            }
          />
          <div className="admin-health-list">
            {healthRows.map((row) => (
              <div key={row.label}>
                <span className="status-dot" />
                <b>{row.label}</b>
                <small>{row.value}</small>
                <AdminBadge tone={row.queryOnly && row.status === "UP" ? "gray" : healthTone(row.status)}>
                  {row.queryOnly && row.status === "UP" ? adminCopy(locale, "event_query_available") : healthLabel(row.status)}
                </AdminBadge>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-surface admin-overview-rules">
          <AdminSectionHeading
            title={adminCopy(locale, "endurance_table")}
            action={
              <button
                className="text-button"
                type="button"
                onClick={() => onNavigate("rules")}
              >
                {locale === "zh" ? "管理换算表" : "Manage conversion tables"} →
              </button>
            }
          />
          <div className="admin-rule-snapshot">
            <span>
              <small>{locale === "zh" ? "已配置规则" : "Configured rules"}</small>
              <b>
                {locale === "zh"
                  ? `${state.enduranceRules.length} 条`
                  : `${state.enduranceRules.length} rules`}
              </b>
            </span>
            <span>
              <small>{locale === "zh" ? "适用分组" : "Applicable groups"}</small>
              <b>{locale === "zh" ? "4 套" : "4 groups"}</b>
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
