// Course list (#17) and course detail (#18) — feature/courses/CoursesScreen.kt.

import { tx } from "../i18n.js";
import { icon } from "../icons.js";
import { esc } from "../ui.js";
import { localizedJoinStatus } from "./join.js";
import {currentCourse, courseSwitchLocked, switchCourse} from '../course-selection.js';

function enrollmentStatusLabel(status) {
  switch (status) {
    case "enrolled": return tx("修读中", "In progress");
    case "completed": return tx("已完成", "Complete");
    case "withdrawn": return tx("已退课", "Withdrawn");
    default: return status || tx("待确认", "Pending");
  }
}

function statusPill(text, { emphasized = false, destructive = false } = {}) {
  const cls = destructive ? "destructive" : emphasized ? "emphasized" : "";
  return `<span class="course-pill ${cls}">${esc(text)}</span>`;
}

function courseMetaLine(iconName, text) {
  return `<div class="row" style="gap:10px">
    <span class="text-muted" style="display:inline-flex;flex:none">${icon(iconName, 19)}</span>
    <span class="ellipsis" style="font-size:15px;line-height:20px;color:var(--color-on-surface)">${esc(text)}</span>
  </div>`;
}

function courseCard(course) {
  return `<button class="course-card pressable" data-action="courses.open" data-course-id="${esc(course.classSectionId || course.id)}">
    <div class="row" style="align-items:flex-start">
      <div class="col grow" style="gap:5px;text-align:left">
        <span data-student-motion="course-title-${esc(course.classSectionId || course.id)}" style="font-size:20px;line-height:26px;font-weight:600;color:var(--color-on-surface)">${esc(course.name)}</span>
      </div>
      <span style="width:10px"></span>
      <span class="text-muted" style="display:inline-flex;padding-top:2px">${icon("chevron-right", 22)}</span>
    </div>
    <div class="course-divider"></div>
    <div class="col" style="gap:10px;text-align:left">
      ${courseMetaLine("person-outline", course.teacher || tx("任课教师待公布", "Instructor to be announced"))}
      ${courseMetaLine("event", course.semester || tx("学期待定", "Semester pending"))}
    </div>
    <div class="row" style="gap:10px">
      ${statusPill(enrollmentStatusLabel(course.enrollmentStatus), { emphasized: course.enrollmentStatus === "enrolled" })}
    </div>
  </button>`;
}

function sectionHeader(title, count, unit) {
  return `<div class="row" style="padding-top:4px">
    <span class="grow" style="font-size:20px;line-height:25px;font-weight:600;color:var(--color-on-background)">${esc(title)}</span>
    <span style="font-size:15px;line-height:20px;color:var(--color-on-surface-variant)">${count} ${esc(unit)}</span>
  </div>`;
}

export function renderCourses(app) {
  if (!app.ui.courses) app.ui.courses = { selectedCourseId: null };
  const ui = app.ui.courses;
  const workspace = app.state.workspace;
  const currentCourses = workspace.courses.filter((course) => course.isCurrent && course.enrollmentStatus === "enrolled");
  const selected = ui.selectedCourseId ? currentCourses.find((course) => (course.classSectionId || course.id) === ui.selectedCourseId) : null;
  if (selected) return renderCourseDetail(app, selected);
  if (currentCourses.length === 1) return renderCourseDetail(app, currentCourses[0], true);

  const subtitle = currentCourses.length === 0
    ? tx("课程同步后将在这里显示", "Your courses will appear here after syncing.")
    : tx(`${currentCourses.length} 门课程正在修读`, `${currentCourses.length} courses in progress`);

  const request = workspace.courseJoinRequest;
  const hasPendingJoinRequest = request && request.status !== "ACTIVE";

  let listBody = "";
  if (currentCourses.length === 0) {
    listBody = `<div class="course-card" style="padding:24px 20px">
      <div class="col" style="gap:7px">
        <span style="font-size:20px;line-height:25px;font-weight:600;color:var(--color-on-surface)">${tx("还没有课程", "No courses yet")}</span>
        <span style="font-size:15px;line-height:22px;color:var(--color-on-surface-variant)">${tx("扫描教师提供的二维码或输入邀请码，加入体育教学班。", "Scan your instructor's QR code or enter an invitation code to join a class.")}</span>
      </div>
    </div>`;
  } else {
    listBody = sectionHeader(tx("本学期", "This semester"), currentCourses.length, tx("门", "courses"));
    listBody += currentCourses.map((course) => courseCard(course)).join("");
  }

  return `<div class="tab-content col" style="gap:20px;padding-top:8px">
    <div class="col" style="gap:5px">
      <span class="course-large-title">${tx("我的课程", "My courses")}</span>
      <span style="font-size:17px;line-height:23px;color:var(--color-on-surface)">${esc(subtitle)}</span>
      <span style="font-size:13px;line-height:18px;color:var(--color-on-surface-variant)">${workspace.student.maximumActiveEnrollments === 2 ? tx("本学期可同时加入两个班级。打卡和学时分别计算，可在页面上方切换班级。", "You may join two classes this semester. Switch above; check-ins and progress are separate.") : tx("同一时间可加入一个班级。", "You may join one class at a time.")}</span>
    </div>
    ${hasPendingJoinRequest ? `
      <button class="course-card pressable" data-action="join.openStatus" style="padding:16px 18px">
        <div class="row">
          <div class="col grow" style="gap:5px;text-align:left">
            <span style="font-size:17px;line-height:22px;font-weight:600;color:var(--color-on-surface)">${tx("课程加入申请", "Course join request")}</span>
            <span style="font-size:14px;line-height:19px;color:var(--color-on-surface-variant)">${esc(request.courseName || tx("课程", "Course"))}</span>
          </div>
          ${statusPill(localizedJoinStatus(request.status), { emphasized: request.status === "PENDING" })}
          <span style="width:8px"></span>
          <span class="text-muted" style="display:inline-flex">${icon("chevron-right", 20)}</span>
        </div>
      </button>` : ""}
    ${listBody}
    ${app.canStartNewCourseJoin() ? `<div class="col" style="gap:10px">
      <button class="primary-btn pressable" data-action="courses.scan" style="min-height:52px">
        ${icon("qr-code-scanner", 20)}<span style="font-size:16px;font-weight:600">${tx("扫描二维码", "Scan QR code")}</span>
      </button>
      <button class="outlined-btn pressable" data-action="courses.enterCode" style="min-height:52px;border-radius:14px">
        ${icon("text-fields", 20)}<span style="font-size:16px;font-weight:600">${tx("输入邀请码", "Enter invitation code")}</span>
      </button>
    </div>` : ""}
  </div>`;
}

function detailFactRow(label, value, last) {
  return `<div class="row" style="min-height:48px;padding:12px 0;align-items:flex-start">
      <span style="width:80px;flex:none;font-size:14px;line-height:20px;color:var(--color-on-surface-variant)">${esc(label)}</span>
      <span style="width:12px"></span>
      <span class="grow" style="font-size:15px;line-height:20px;color:var(--color-on-surface)">${esc(value)}</span>
    </div>${last ? "" : `<div class="course-divider course-detail-divider"></div>`}`;
}

function renderCourseDetail(app, course, single = false) {
  const selected = currentCourse(app.state.workspace);
  const teacher = course.teacher || app.state.workspace.teachers?.find(item => item.teacherId === course.teacherId)?.teacherName;
  const isSelected = selected?.enrollmentId === course.enrollmentId;
  const policy = isSelected ? app.state.workspace.creditPolicy : null;
  const rule = isSelected ? app.state.workspace.hourRule : null;
  const window = isSelected ? app.state.workspace.checkInTimeWindow : null;
  const minuteText = value => Number.isFinite(value) ? tx(`${value} 分钟`, `${value} min`) : '—';
  const hours = window?.windowMode === 'unavailable' || !window ? '—' : window.dailyStartTime === null && window.dailyEndTime === null ? tx('全天（北京时间）','All day (Beijing time)') : window.dailyStartTime && window.dailyEndTime ? `${window.dailyStartTime}–${window.dailyEndTime}` : '—';
  return `<div class="tab-content col student-page student-course" style="gap:18px;padding-top:2px">
    ${single ? `<header class="student-heading"><div><p class="student-eyebrow">${tx('本学期','THIS SEMESTER')}</p><h1>${tx('我的课程','My course')}</h1></div></header>` : `<button class="row pressable" data-action="courses.backToList" style="min-height:48px;color:var(--color-primary)">
      <span style="display:inline-flex;padding:0 10px">${icon("arrow-back", 24)}</span>
      <span style="font-size:17px;line-height:22px">${tx("我的课程", "My courses")}</span>
    </button>`}
    <section class="swiss-panel student-course-hero"><span class="student-small-icon">${icon('menu-book',28)}</span><div class="col" style="gap:8px">
      <h2 data-student-motion="course-title-${esc(course.classSectionId || course.id)}">${esc(course.name)}</h2>
      <p class="body-medium text-muted">${esc(teacher || tx('任课教师待公布','Instructor to be announced'))} · ${esc(course.semester || tx('学期待定','Semester pending'))}</p>
      <div class="row" style="gap:10px">
        ${statusPill(enrollmentStatusLabel(course.enrollmentStatus), { emphasized: course.enrollmentStatus === "enrolled" })}
      </div>
    </div></section>
    ${isSelected ? `<section class="swiss-panel student-course-requirements"><h2>${tx('运动要求','Exercise requirements')}</h2><div class="student-metric-pair"><div><span>${tx('最低运动时长','Minimum duration')}</span><strong>${minuteText(policy?.minCreditThresholdMinutes)}</strong></div><div><span>${tx('到点自动结束','Ends automatically at')}</span><strong>${minuteText(policy?.maxCreditMinutes)}</strong></div></div>
      <details data-disclosure="course-rules-${esc(course.id)}" class="student-disclosure"><summary>${tx('查看完整要求','View full requirements')}${icon('expand-more',20)}</summary><div>${detailFactRow(tx('每日开放','Daily hours'),hours,false)}${detailFactRow(tx('每天最多计入','Daily maximum'),Number.isInteger(policy?.dailyLimit)?tx(policy.dailyLimit+' 次',policy.dailyLimit+' times'):'—',false)}${detailFactRow(tx('每周最多计入','Weekly maximum'),Number.isInteger(policy?.weeklyLimit)?tx(policy.weeklyLimit+' 次',policy.weeklyLimit+' times'):'—',false)}${window?.dateRangeStart || window?.dateRangeEnd ? detailFactRow(tx('开放日期','Open dates'),`${window.dateRangeStart || '—'} – ${window.dateRangeEnd || '—'}`,false) : ''}${window?.excludedDates?.length ? detailFactRow(tx('排除日期','Excluded dates'),window.excludedDates.join('、'),false) : ''}${detailFactRow(tx('学期目标','Semester goal'),minuteText(Number.isFinite(rule?.total)?rule.total*60:null),false)}${detailFactRow(tx('课程相关','Course-related'),minuteText(Number.isFinite(rule?.courseRequired)?rule.courseRequired*60:null),false)}${detailFactRow(tx('自主运动','Independent'),minuteText(Number.isFinite(rule?.generalRequired)?rule.generalRequired*60:null),true)}<p class="body-small text-muted">${tx('拍摄凭证与运动说明要求，请在开始运动前确认。游泳须按页面要求分别拍摄运动前后凭证。','Confirm evidence and note requirements before starting. Swimming requires before and after evidence as shown in check-in.')}</p></div></details></section>
      <div class="student-course-links"><button class="primary-btn pressable" data-action="dashboard.openCheckIn">${icon('play-arrow',20)}${tx('去运动','Start exercising')}</button><button class="outlined-btn pressable" data-action="dashboard.openProgress">${tx('查看本课程进度','View course progress')}</button><button class="text-btn pressable" data-action="dashboard.openRecords">${tx('查看运动记录','View activity records')}${icon('chevron-right',18)}</button></div>` : `<button class="primary-btn pressable" data-action="courses.useCourse" data-enrollment-id="${esc(course.enrollmentId)}" ${courseSwitchLocked(app)?'disabled':''}>${tx('切换到此课程查看要求','Switch to this course to view requirements')}</button>${courseSwitchLocked(app)?`<p class="body-small text-muted">${tx('完成当前运动或操作后，可切换课程。','Finish the current exercise or action before switching courses.')}</p>`:''}`}
    ${single && app.state.workspace.courseJoinRequest && app.state.workspace.courseJoinRequest.status !== 'ACTIVE' ? `<button class="outlined-btn pressable" data-action="join.openStatus">${tx('查看课程加入申请','View course join request')}</button>` : ''}
    ${single && app.canStartNewCourseJoin?.() ? `<details class="student-disclosure" data-disclosure="join-another-course"><summary>${tx('加入课程','Join a course')}${icon('expand-more',20)}</summary><div class="student-course-links"><button class="outlined-btn pressable" data-action="courses.scan">${tx('扫描二维码','Scan QR code')}</button><button class="text-btn pressable" data-action="courses.enterCode">${tx('输入邀请码','Enter invitation code')}</button></div></details>` : ''}
  </div>`;
}

export const coursesActions = {
  "courses.useCourse": (app, el) => switchCourse(app, el.dataset.enrollmentId),
  "courses.refreshRoster": async (app) => { if (app.state.isLoading) return; await app.reloadApiWorkspace(); app.render(); },
  "courses.open": (app, el) => {
    app.ui.courses.selectedCourseId = el.dataset.courseId;
    app.navDirection = "forward";
    app.render();
  },
  "courses.backToList": (app) => {
    app.ui.courses.selectedCourseId = null;
    app.navDirection = "back";
    app.render();
  },
  "courses.scan": (app) => {
    app.ui.scan = null;
    app.openSub("scan", {});
  },
  "courses.enterCode": (app) => {
    app.ui.enterCode = null;
    app.openSub("enterCode", {});
  },
};

// Course detail intercepts back to return to the list (返回规则).
export function coursesBackInterceptor(app) {
  if (app.screenKey() === "tab-courses" && app.ui.courses?.selectedCourseId) {
    app.ui.courses.selectedCourseId = null;
    app.navDirection = "back";
    app.render();
    return true;
  }
  return false;
}
