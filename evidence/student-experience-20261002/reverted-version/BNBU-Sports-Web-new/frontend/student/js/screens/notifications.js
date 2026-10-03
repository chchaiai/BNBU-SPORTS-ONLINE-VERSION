import {captureStudentExperience, restoreStudentExperience} from '../student-experience.js';
import {listMyNotificationPage,mapServerNotification,toUserFacingError} from '../api.js';
// Notification bottom sheet (#16) — feature/notifications/NotificationSheet.kt.
// Full-expand sheet at 82% height; filter chips All/Unread/Deadline/Application;
// tapping an unread notice marks it read first; Review notices close the sheet
// and open the exemption screen; others open the in-sheet detail.

import { t, tx } from "../i18n.js";
import { notificationText } from "../notification-text.js";
import { icon } from "../icons.js";
import { esc, statusBadge, emptyPlaceholder, userFacingErrorPanel } from "../ui.js";

const FILTERS = [
  { id: "all", labelKey: "notification_all" },
  { id: "unread", labelKey: "notification_unread" },
  { id: "deadline", labelKey: "notification_deadline" },
  { id: "application", labelKey: "notification_application" },
];

function notificationsState(app) {
  if (!app.ui.notifications) app.ui.notifications = { filter: "all", selectedNoticeId: null };
  return app.ui.notifications;
}

function proofCountdown(app) {
  const todos = Array.isArray(app.state.workspace?.proofTodos) ? app.state.workspace.proofTodos : [];
  if (!todos.length) {
    return "";
  }
  const nearest = todos.reduce((best, item) => {
    const remain = Number(item.remainingSeconds);
    if (!Number.isFinite(remain)) return best;
    if (!best || remain < Number(best.remainingSeconds)) return item;
    return best;
  }, null);
  if (!nearest) return "";
  const minutes = Math.max(0, Math.ceil(Number(nearest.remainingSeconds) / 60));
  return `<div class="body-medium" style="min-height:44px;margin-bottom:8px">${tx(`最近补证截止还剩约 ${minutes} 分钟`, `Nearest proof deadline: about ${minutes} min`)}</div>`;
}

/** Refresh only the sheet body so its open animation and the page below stay intact. */
function refreshNotificationSheet(app) {
  const currentSheet = app._viewport?.querySelector(".sheet-scrim > .sheet");
  if (!currentSheet) {
    app.render();
    return;
  }
  const previous = captureStudentExperience(app);
  for (const el of currentSheet.querySelectorAll('[data-scroll-key]')) app.scrollPositions?.set(el.dataset.scrollKey, el.scrollTop);
  const template = document.createElement("template");
  template.innerHTML = renderNotificationSheet(app).trim();
  const nextBody = template.content.querySelector(".sheet-scrim > .sheet > .col");
  const currentBody = currentSheet.querySelector(":scope > .col");
  if (!nextBody || !currentBody) {
    app.render();
    return;
  }
  currentBody.replaceWith(nextBody);
  for (const el of nextBody.querySelectorAll('[data-scroll-key]')) el.scrollTop = app.scrollPositions?.get(el.dataset.scrollKey) || 0;
  restoreStudentExperience(app, previous);
}

function studentVisibleNoticeText(text) {
  return String(text || "");
}

export function notificationAction(notice, todos = []) {
  if (notice.opensExemption) return {label: tx('查看申请','View application'), kind:'application'};
  if (notice.targetId && todos.some(todo => todo.recordId === notice.targetId)) return {label:tx('去补证','Add evidence'),kind:'proof'};
  if (notice.kind === 'review' && notice.targetId) return {label:tx('查看记录','View record'),kind:'record'};
  return null;
}
function noticeRow(notice, todos) {
  const text = notificationText(notice, tx), action = notificationAction(notice,todos);
  return `<button class="notice-row pressable student-notice" data-action="notifications.openNotice" data-notice-id="${esc(notice.id)}" data-student-motion="notice-${esc(notice.id)}">
    <span class="student-notice-dot${notice.isUnread?' is-unread':''}" aria-label="${notice.isUnread?tx('未读','Unread'):tx('已读','Read')}"></span>
    <span class="col grow"><span class="student-notice-meta"><strong>${esc(studentVisibleNoticeText(text.title))}</strong><time>${esc(notice.time)}</time></span><span class="student-notice-excerpt">${esc(studentVisibleNoticeText(text.message))}</span>${action?`<span class="student-notice-action">${action.label}${icon('chevron-right',16)}</span>`:''}</span>
  </button>`;
}

export function renderNotificationSheet(app) {
  const ui = notificationsState(app);
  const notices = app.visibleNotices();
  const unread = app.unreadNoticeCount();
  const selectedNotice = ui.selectedNoticeId ? notices.find((n) => n.id === ui.selectedNoticeId) : null;
  const showingDetail = !!selectedNotice;

  let content;
  if (showingDetail) {
    const text = notificationText(selectedNotice, tx);
    content = `<div class="col student-notice-detail" data-scroll-key="notice-detail-${esc(selectedNotice.id)}" style="gap:14px;overflow-y:auto">
      <div class="swiss-panel">
        <div class="title-large text-on-surface">${esc(studentVisibleNoticeText(text.title))}</div>
        <div style="height:4px"></div>
        <div class="label-medium text-muted">${esc(selectedNotice.time)}</div>
        <div style="height:6px"></div>
        <div class="body-medium text-muted" style="white-space:pre-line">${esc(studentVisibleNoticeText(text.message))}</div>
        ${app.isLocalPreview() && selectedNotice.id === "preview-notice-app-beta" ? `<a class="app-beta-notice-link" href="https://www.bnbusports.cn/">查看下载与安装指南 →</a>` : ""}
      </div>
      ${selectedNotice.isUnread ? `<button class="text-btn pressable" data-action="notifications.markRead" data-notice-id="${esc(selectedNotice.id)}" style="width:100%">
        ${icon("check-circle", 20)}<span>${t("notification_mark_read")}</span>
      </button>` : ""}
    </div>`;
  } else {
    const filtered = notices.filter((notice) => {
      switch (ui.filter) {
        case "unread": return notice.isUnread;
        case "deadline": return notice.category === "deadline";
        case "application": return notice.category === "review";
        default: return true;
      }
    });
    const todos = app.state.workspace.proofTodos || [];
    const actionable = filtered.filter(notice => notificationAction(notice,todos) || notice.category === 'deadline');
    const ordinary = filtered.filter(notice => !actionable.includes(notice));
    const group = (title,items) => items.length ? `<section class="student-notice-group"><h3>${title}</h3>${items.map(notice=>noticeRow(notice,todos)).join('')}</section>` : '';
    content = `
      <div class="row notification-filters" style="gap:8px;padding:10px 0;overflow-x:auto">
        ${FILTERS.map((f) => `<button class="filter-chip pressable" aria-pressed="${ui.filter === f.id}" data-action="notifications.filter" data-filter="${f.id}">
          ${ui.filter === f.id ? icon("check", 16) : ""}<span class="label-medium">${t(f.labelKey)}</span>
        </button>`).join("")}
      </div>
      ${filtered.length === 0
        ? emptyPlaceholder(t("notification_empty"), t("notification_empty_hint"))
        : `<div class="col student-notice-list" data-scroll-key="notice-list-${ui.filter}" style="gap:18px;overflow-y:auto;flex:1;min-height:0">${group(tx('待关注','Needs attention'),actionable)}${group(tx('其他通知','Other notifications'),ordinary)}</div>`}
    `;
  }

  return `<div class="sheet-scrim" data-action="notifications.scrim">
    <div class="sheet student-notification-sheet" role="dialog" aria-modal="true" aria-label="${t('notification_title')}">
      <button class="student-sheet-handle" data-notification-handle data-action="notifications.close" aria-label="${tx('关闭通知，也可向下拖动','Close notifications or drag down')}"><span></span></button>
      <div class="col" style="flex:1;min-height:0;padding:0 18px 12px">
        <div class="row" style="min-height:56px">
          ${showingDetail
            ? `<button class="icon-btn pressable" data-action="notifications.backToList" aria-label="${t("notification_back_list")}">${icon("chevron-left", 24)}</button>`
            : `<span class="text-primary" style="display:inline-flex">${icon("notifications", 24)}</span><span style="width:10px"></span>`}
          <span class="title-large text-on-surface grow">${t(showingDetail ? "notification_detail" : "notification_title")}</span>
          <button class="icon-btn pressable" data-action="notifications.close" aria-label="${t("notification_close")}">${icon("close", 24)}</button>
        </div>

        ${showingDetail ? "" : proofCountdown(app)}
        ${showingDetail ? "" : `<div class="row">
          ${statusBadge(unread > 0 ? t("notification_unread_count", unread) : t("notification_none_unread"))}
          <span class="grow"></span>
          <button class="text-btn pressable" data-action="notifications.markAll" ${unread > 0 ? "" : "disabled"}>${app.state.workspace.notificationNextCursor ? tx("已加载通知全部已读","Mark loaded notifications read") : t("notification_mark_all")}</button>
        </div>`}
        <div class="col" style="flex:1;min-height:0">${ui.error ? userFacingErrorPanel(ui.error, { compact: true }) : ""}${content}${!showingDetail && app.state.workspace.notificationNextCursor ? `<button class="outlined-btn" data-action="notifications.more">${tx("加载更早通知","Load earlier notifications")}</button>` : ""}</div>
      </div>
    </div>
  </div>`;
}

export const notificationActions = {
  "notifications.more": async(app)=>{
    const workspace=app.state.workspace,ui=notificationsState(app);
    if(ui.loading || !workspace.notificationNextCursor)return;ui.loading=true;
    try {const page=await listMyNotificationPage(workspace.notificationNextCursor);
      if(app.state.workspace!==workspace)return;
      const ids=new Set(workspace.notices.map(n=>n.id));
      workspace.notices.push(...page.data.map(mapServerNotification).filter(n=>!ids.has(n.id)));
      workspace.notificationNextCursor=page.meta?.pagination?.nextCursor ?? null;
    }catch(error){ui.error=toUserFacingError(error);}finally{ui.loading=false;refreshNotificationSheet(app);}
  },
  "notifications.scrim": (app, el, event) => {
    if (event.target === el) notificationActions["notifications.close"](app);
  },
  "notifications.close": (app) => {
    app.state.notificationSheetOpen = false;
    notificationsState(app).selectedNoticeId = null;
    app.render();
  },
  "notifications.backToList": (app) => {
    notificationsState(app).selectedNoticeId = null;
    refreshNotificationSheet(app);
  },
  "notifications.filter": (app, el) => {
    notificationsState(app).filter = el.dataset.filter;
    refreshNotificationSheet(app);
  },
  "notifications.openNotice": async (app, el) => {
    const ui = notificationsState(app);
    const notice = app.visibleNotices().find((n) => n.id === el.dataset.noticeId);
    if (!notice) return;
    ui.error = null;
    if (notice.isUnread && !(await app.markNoticeRead(notice.id))) {
      ui.error = app.state.lastError;
      refreshNotificationSheet(app);
      return;
    }
    const targetAction = notificationAction(notice, app.state.workspace.proofTodos || []);
    if (targetAction?.kind === 'proof') {
      app.state.notificationSheetOpen = false;
      await app.actions['checkin.selectProof'](app,{dataset:{recordId:notice.targetId}});
    } else if (notice.opensExemption) {
      app.state.notificationSheetOpen = false;
      app.ui.notifications = null;
      app.openSub("exemption", { targetId: notice.targetId || null });
    } else if (notice.kind === "review" && notice.targetId) {
      app.state.notificationSheetOpen = false;
      app.ui.notifications = null;
      if (!app.ui.checkin) app.ui.checkin = {};
      app.ui.checkin.selectedRecordId = notice.targetId;
      app.ui.grades = {...app.ui.grades,section:'records'};
      app.state.tab = 'grades';
      app.render();
    } else {
      ui.selectedNoticeId = notice.id;
      refreshNotificationSheet(app);
    }
  },
  "notifications.markRead": async (app, el) => {
    const ui = notificationsState(app);
    ui.error = null;
    if (!(await app.markNoticeRead(el.dataset.noticeId))) ui.error = app.state.lastError;
    refreshNotificationSheet(app);
  },
  "notifications.markAll": async (app) => {
    const ui = notificationsState(app);
    ui.error = null;
    if (!(await app.markAllNoticesRead())) ui.error = app.state.lastError;
    refreshNotificationSheet(app);
  },
};
