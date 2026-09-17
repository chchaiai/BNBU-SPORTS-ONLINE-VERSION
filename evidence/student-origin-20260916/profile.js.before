// Profile tab (#26), account details (#27) and settings (#28)
// — feature/profile/ProfileScreen.kt, AccountDetailsScreen.kt.

import { t, tx, getLanguage, currentLocale } from "../i18n.js";
import { icon } from "../icons.js";
import { esc, brandMark, sectionTitle, statusBadge, emptyPlaceholder, segmented, spinner, fieldLabel, fieldControlAttrs, fieldSupport, userFacingErrorPanel, focusFirstInvalidField } from "../ui.js";
import { localStore } from "../store.js";
import { studentRegionLabel, studentRegionOptions } from '../student-regions.js';
import { STUDENT_COLLEGES, academicMajorOptions, allowsCustomMajor, validAcademicDetails } from '../student-academics.js';
import {
  ApiError,
  request,
  requestCurrentUserAccountDeletionChallenge,
  confirmCurrentUserAccountDeletion,
  toUserFacingError,
} from "../api.js";

const profileFields = [
  ['fullName','name',()=>tx('真实姓名','Full name')],
  ['studentNumber','id',()=>tx('学号','Student number')],
  ['gender','gender',()=>tx('性别','Gender')],
  ['gradeYear','admissionYear',()=>tx('入学年份','Admission year')],
  ['collegeName', 'college', () => tx('学院','College')],
  ['majorName', 'major', () => tx('专业','Major')],
  ['dateOfBirth', 'dateOfBirth', () => tx('出生年月日','Date of birth')],
  ['regionCode', 'regionCode', () => tx('地域','Region')],
];
function missingProfileFields(student) {
  return [...profileFields.filter(([,key])=>!String(student[key] || '').trim()).map(([, ,label])=>label()),
    ...(student.regionCode === 'OTHER' && !student.otherRegionName ? [tx('国家或地区名称','Country or region name')] : [])];
}
function profileCompletionNotice(app) {
  const missing = missingProfileFields(app.state.workspace.student);
  return app.isApiMode() && missing.length ? `<div class="swiss-panel" role="status"><p>${esc(tx('请完善账户资料：','Complete your profile: ')+missing.join('、'))}</p><button class="primary-btn pressable" data-action="profile.editDetails">${tx('去完善','Complete profile')}</button></div>` : '';
}
export function profileCompletionForm(app) {
  const state = app.ui.profileDetails;
  if (!state) return '';
  const field = (id,label,type='text',max=200) => `<label class="col" style="gap:6px">${esc(label)}<input class="text-field" placeholder="${esc(label)}" data-input="profile.detailsField" data-field="${id}" type="${type}" maxlength="${max}" required value="${esc(state[id] || '')}" ${state.busy ? 'disabled' : ''}></label>`;
  return `<form class="swiss-panel col" style="gap:16px" data-profile-details-form data-submit="profile.saveDetails">
    <h3>${tx('请完善个人信息','Complete your personal information')}</h3>
    <p>${tx('请确认并修正以下资料，保存成功后才能正常打卡。已验证邮箱无需重新填写。','Confirm and correct your details before checking in. Your verified email is retained.')}</p>
    <p role="status">${esc((app.state.workspace.student.profileQualityReasons || []).map(profileReasonLabel).join('；'))}</p>
    ${field('fullName',tx('真实姓名','Full name'),'text',100)}
    ${field('studentNumber',tx('学号（2 开头的 10 位数字）','Student number (10 digits, starting with 2)'),'text',10)}
    <label class="col">${tx('性别','Gender')}<select class="text-field" required data-input="profile.detailsField" data-field="gender"><option value="">${tx('请选择','Select')}</option>${[['MALE','男','Male'],['FEMALE','女','Female'],['OTHER','其他','Other']].map(([code,zh,en])=>`<option value="${code}" ${state.gender===code?'selected':''}>${tx(zh,en)}</option>`).join('')}</select></label>
    ${field('gradeYear',tx('入学年份','Admission year'),'number',4)}
    <label class="col">${tx('学院','College')}<select class="text-field" required data-input="profile.detailsField" data-field="collegeName" ${state.busy?'disabled':''}><option value="">${tx('请选择','Select')}</option>${STUDENT_COLLEGES.map(item=>`<option value="${item.code}" ${state.collegeName===item.code?'selected':''}>${esc(item.code+' '+item.name)}</option>`).join('')}</select></label>
    ${allowsCustomMajor(state.collegeName) ? field('majorName',tx('其他专业（仅大写英文字母）','Other major (uppercase letters only)')) : `<label class="col">${tx('专业','Major')}<select class="text-field" required data-input="profile.detailsField" data-field="majorName" ${state.busy?'disabled':''}><option value="">${tx('请选择','Select')}</option>${academicMajorOptions(state.collegeName).map(value=>`<option value="${value}" ${state.majorName===value?'selected':''}>${value}</option>`).join('')}</select></label>`}
    ${field('dateOfBirth',tx('出生年月日','Date of birth'),'date')}
    <label class="col">${tx('地域','Region')}<select class="text-field" required data-input="profile.detailsField" data-field="regionCode" ${state.busy?'disabled':''}><option value="">${tx('请选择','Select')}</option>${studentRegionOptions().map(option=>`<option value="${option.value}" ${state.regionCode===option.value?'selected':''}>${esc(option.label)}</option>`).join('')}</select></label>
    ${state.regionCode==='OTHER'?field('otherRegionName',tx('国家或地区名称','Country or region name'),'text',100):''}
    ${state.error?`<p role="alert" class="text-error">${esc(state.error)}</p>`:''}
    <button type="button" class="primary-btn pressable" data-action="profile.saveDetails" ${state.busy?'disabled':''}>${tx('保存资料','Save details')}</button>
    ${app.state.workspace.student.profileQualityStatus==='REQUIRES_PROFILE_UPDATE'?'':`<button type="button" class="text-btn pressable" data-action="profile.cancelDetails" ${state.busy?'disabled':''}>${tx('取消','Cancel')}</button>`}
  </form>`;
}

function localizedGradeLabel(student) {
  switch (student.gradeLevel) {
    case "freshman": return tx("大一", "Year 1");
    case "sophomore": return tx("大二", "Year 2");
    case "junior": return tx("大三", "Year 3");
    case "senior": return tx("大四", "Year 4");
    default: return student.gradeLevel;
  }
}

function localizedGenderLabel(student) {
  switch (String(student.gender || "").trim().toLowerCase()) {
    case "male": return tx("男", "Male");
    case "female": return tx("女", "Female");
    default: return t("profile_pending");
  }
}

function localizedStudentStatusLabel(status) {
  return status === "ACTIVE" ? tx("已进班", "Enrolled") : tx("已退班", "Withdrawn");
}

function studentNumberForDisplay(student) {
  const value = String(student.id || "").trim();
  const isInternalReviewId = value === "LOCAL-REVIEW-STUDENT";
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
  return value && !isInternalReviewId && !isUuid
    ? value
    : tx("学号未提供", "Student number unavailable");
}

function displayDate(value) {
  const raw = value.slice(0, 10);
  const [year, month, day] = raw.split("-").map(Number);
  if (!year || !month || !day) return raw;
  // Construct as local time so a date-only string never shifts by timezone.
  return new Date(year, month - 1, day).toLocaleDateString(currentLocale(), { year: "numeric", month: "short", day: "numeric" });
}

// ── #26 Profile tab ──

function serviceShortcut({ title, description, iconName, action }) {
  return `<button class="service-shortcut pressable" data-action="${action}">
    <span class="service-shortcut-icon">${icon(iconName, 21)}</span>
    <div class="col" style="gap:4px;text-align:left;min-width:0">
      <span class="title-small text-on-surface ellipsis">${esc(title)}</span>
      <span class="label-medium text-muted ellipsis">${esc(description)}</span>
    </div>
  </button>`;
}

export function renderProfile(app) {
  const workspace = app.state.workspace;
  const student = workspace.student;
  const grade = localizedGradeLabel(student) || t("profile_pending_calculation");
  const studentNumber = studentNumberForDisplay(student);

  const header = `<div class="col" style="gap:14px">
    <div class="row">
      <span class="headline-large text-on-surface grow">${t("profile_heading")}</span>
      <button class="icon-btn pressable" data-action="profile.openSettings" aria-label="${t("profile_settings")}">${icon("settings", 24)}</button>
    </div>
    <button class="swiss-panel pressable" data-action="profile.openAccount" style="text-align:left" aria-label="${t("profile_account_details")}">
      <div class="col" style="gap:18px">
        <div class="row" style="gap:14px">
          ${brandMark(true)}
          <span class="headline-small text-on-surface grow ellipsis">${esc(student.name)}</span>
          ${statusBadge(localizedStudentStatusLabel(student.status), true)}
          <span class="text-muted" style="display:inline-flex">${icon("chevron-right", 20)}</span>
        </div>
        <div class="profile-facts">
          <div class="profile-fact"><span class="label-small text-muted">${t("profile_student_id_short")}</span><span class="label-medium text-on-surface ellipsis">${esc(studentNumber)}</span></div>
          <div class="profile-facts-row">
            <div class="profile-fact"><span class="label-small text-muted">${t("profile_class_short")}</span><span class="label-medium text-on-surface ellipsis">${esc(student.className || "—")}</span></div>
            <div class="profile-fact"><span class="label-small text-muted">${t("profile_grade_short")}</span><span class="label-medium text-on-surface ellipsis">${esc(grade)}</span></div>
          </div>
        </div>
      </div>
    </button>
  </div>`;

  const services = `<div class="col" style="gap:12px">
    ${sectionTitle(t("profile_services_title"))}
    <div class="row" style="gap:12px;align-items:stretch">
      ${serviceShortcut({ title: t("profile_exemption"), description: t("profile_exemption_short_hint"), iconName: "fitness-center", action: "profile.openExemption" })}
    </div>
  </div>`;

  const currentCourse = workspace.courses.find(
    (course) => course.isCurrent && course.enrollmentStatus === "enrolled",
  );
  const teachers = currentCourse?.teacher
    ? [{ teacherId: currentCourse.teacherId, teacherName: currentCourse.teacher }]
    : workspace.teachers.filter((teacher) => teacher.teacherId === currentCourse?.teacherId);
  const teacherPanel = teachers.length === 0 ? "" : `<div class="col" style="gap:12px">
    ${sectionTitle(t("profile_teacher_title"))}
    <div class="swiss-panel">
      ${teachers
        .map(
          (teacher, index) => `${index > 0 ? '<div class="course-divider"></div>' : ""}
          <div class="row" style="padding:12px 0;gap:12px">
            <span class="text-primary" style="display:inline-flex;flex:none">${icon("check-circle", 22)}</span>
            <div class="col grow" style="gap:4px">
              <span class="title-medium text-on-surface">${esc(teacher.teacherName)}</span>
              <span class="label-medium text-muted">${t("profile_teacher_role")}</span>
            </div>
          </div>`
        )
        .join("")}
    </div>
  </div>`;

  const memberships = workspace.memberships;
  const identityPanel = `<div class="col" style="gap:12px">
    ${sectionTitle(t("profile_identity_title"))}
    <span class="body-small text-muted">${tx("课程相关运动和其他运动均可获得认可学时，具体以教师审核结果为准。", "Recognized hours may apply to both course-related and other exercise, according to the teacher review.")}</span>
    ${memberships.length === 0
      ? emptyPlaceholder(t("profile_no_memberships"), t("profile_no_memberships_hint"))
      : `<div class="swiss-panel">${memberships
          .map(
            (membership, index) => `${index > 0 ? '<div class="course-divider"></div>' : ""}
            <div class="col" style="gap:12px;padding:12px 0">
              <div class="col" style="gap:6px">
                <span class="title-medium text-on-surface">${esc(`${membership.type === "team" ? "校队" : "社团"} · ${membership.organization}`)}</span>
                ${membership.validUntil
                  ? `<span class="label-medium text-muted">${t("profile_valid_until", displayDate(membership.validUntil))}</span>`
                  : membership.submittedAt
                    ? `<span class="label-medium text-muted">${tx(`提交时间：${membership.submittedAt}`, `Submitted: ${membership.submittedAt}`)}</span>`
                    : ""}
                <div class="row" style="gap:8px">
                  ${statusBadge(membership.status, ["认证有效", "有效", "已通过"].includes(membership.status))}
                  ${membership.offset ? `<span class="label-medium text-primary">${t("profile_offset", esc(membership.offset))}</span>` : ""}
                </div>
              </div>
              ${membership.comment && membership.comment !== "offset" ? `<div class="membership-comment">
                <span class="text-primary" style="display:inline-flex;flex:none">${icon("notifications", 16)}</span>
                <span class="body-medium text-muted grow">${esc(membership.comment)}</span>
              </div>` : ""}
            </div>`
          )
          .join("")}</div>`}
  </div>`;

  return `<div class="tab-content col" style="gap:24px">
    ${header}
    ${profileCompletionNotice(app)}
    ${services}
    ${teacherPanel}
    ${identityPanel}
    <div style="height:40px"></div>
  </div>`;
}

// ── #27 Account details ──

function accountDetailRow(label, value) {
  return `<div class="row" style="align-items:flex-start">
    <span class="body-medium text-muted" style="flex:none">${esc(label)}</span>
    <span style="width:12px"></span>
    <span class="body-medium text-on-surface grow" style="text-align:right">${esc(value)}</span>
  </div>`;
}

export function renderAccountDetails(app) {
  const student = app.state.workspace.student;
  const grade = localizedGradeLabel(student) || t("profile_pending_calculation");
  const gender = localizedGenderLabel(student);
  const studentNumber = studentNumberForDisplay(student);
  return `<div class="screen" style="background:transparent">
    <div class="screen-scroll" data-scroll-key="account-details">
      <div class="col" style="gap:16px">
        <button class="row pressable" data-action="profile.subBack" style="gap:8px;padding:12px 0 4px;width:100%;color:var(--color-on-surface)">
          ${icon("chevron-left", 24)}<span class="body-large">${t("common_back")}</span>
        </button>
        <div class="headline-small text-on-surface">${t("profile_account_details")}</div>
        ${app.ui.profileDetails ? profileCompletionForm(app) : profileCompletionNotice(app)}
        <div class="swiss-panel">
          <div class="row" style="gap:14px">
            ${brandMark(true)}
            <span class="title-large text-on-surface grow ellipsis">${esc(student.name)}</span>
          </div>
        </div>
        <div class="swiss-panel"><div class="col" style="gap:14px">
          ${accountDetailRow(t("profile_name"), student.name)}
          ${accountDetailRow(t("profile_student_id"), studentNumber)}
          ${accountDetailRow(tx("学院", "College"), student.college || tx("未填写", "Not provided"))}
          ${accountDetailRow(tx("专业", "Major"), student.major || tx("未填写", "Not provided"))}
          ${accountDetailRow(tx("出生年月日", "Date of birth"), student.dateOfBirth ? displayDate(student.dateOfBirth) : tx("未填写", "Not provided"))}
          ${accountDetailRow(tx("地域", "Region"), (student.regionCode === "OTHER" ? student.otherRegionName || studentRegionLabel(student.regionCode) : studentRegionLabel(student.regionCode)))}
          ${accountDetailRow(tx("学生状态", "Student status"), localizedStudentStatusLabel(student.status))}
          ${accountDetailRow(tx("性别", "Gender"), gender)}
          ${accountDetailRow(t("profile_class"), student.className)}
          ${accountDetailRow(t("profile_admission_year"), student.admissionYear ? String(student.admissionYear) : t("profile_pending"))}
          ${accountDetailRow(t("profile_current_grade"), grade)}
          ${student.currentAcademicYear ? accountDetailRow(t("profile_calculation_year"), student.currentAcademicYear) : ""}
        </div></div>
      </div>
    </div>
  </div>`;
}

// ── #28 Settings ──

function navigationRow(title, iconName, action, last = false) {
  return `<button class="settings-row pressable" data-action="${action}">
      <span class="text-primary" style="display:inline-flex;flex:none">${icon(iconName, 20)}</span>
      <span style="width:10px"></span>
      <span class="body-medium text-on-surface grow" style="text-align:left">${esc(title)}</span>
      <span class="text-muted" style="display:inline-flex">${icon("chevron-right", 18)}</span>
    </button>${last ? "" : '<div class="course-divider"></div>'}`;
}

export function renderSettings(app) {
  const themeMode = localStore.getThemeMode();
  const language = getLanguage();
  return `<div class="screen" style="background:transparent">
    <div class="screen-scroll" data-scroll-key="settings">
      <div class="col" style="gap:16px">
        <button class="row pressable" data-action="profile.settingsBack" style="gap:8px;padding:12px 0 4px;width:100%;color:var(--color-on-surface)">
          ${icon("chevron-left", 24)}<span class="body-large">${t("common_back")}</span>
        </button>
        <div class="headline-small text-on-surface">${t("profile_settings")}</div>

        <div class="swiss-panel">
          <div class="title-medium text-on-surface" style="padding-bottom:4px">${t("profile_account_security")}</div>
          ${navigationRow(t("profile_login_contacts"), "email", "profile.openBinding")}
          ${navigationRow(tx("注销账户", "Delete account"), "delete", "profile.openAccountDeletion", true)}
        </div>

        <div class="swiss-panel"><div class="col" style="gap:12px">
          <div class="title-medium text-on-surface">${t("profile_preferences")}</div>
          <div class="title-medium text-on-surface">${t("profile_appearance")}</div>
          ${segmented({
            items: [
              { value: "light", label: t("theme_light") },
              { value: "dark", label: t("theme_dark") },
              { value: "system", label: t("theme_system") },
            ],
            selected: themeMode,
            action: "profile.theme",
          })}
          <div class="body-small text-muted">${t("profile_appearance_hint")}</div>
          <div class="course-divider"></div>
          <div class="title-medium text-on-surface">${t("profile_language")}</div>
          ${segmented({
            items: [
              { value: "zh", label: t("profile_chinese") },
              { value: "en", label: t("profile_english") },
            ],
            selected: language,
            action: "profile.language",
          })}
          <div class="body-small text-muted">${t("profile_language_hint")}</div>
          ${app.ui.preferenceError ? userFacingErrorPanel(app.ui.preferenceError, { compact: true }) : ""}
        </div></div>

        <div class="swiss-panel">
          <div class="title-medium text-on-surface" style="padding-bottom:4px">${t("profile_help_support")}</div>
          ${navigationRow(t("profile_help_center"), "help-outline", "profile.openHelp")}
          ${navigationRow(t("profile_privacy"), "fitness-center", "profile.openPrivacy")}
          ${navigationRow(t("profile_feedback"), "notifications", "profile.openFeedback")}
          ${navigationRow(t("profile_about"), "info-outline", "profile.openAbout", true)}
        </div>

        <button class="logout-card pressable" data-action="profile.logoutConfirm">
          <span class="text-error" style="display:inline-flex">${icon("close", 20)}</span>
          <span class="title-medium grow" style="color:var(--color-on-error-container);text-align:left">${t("profile_logout")}</span>
          <span class="text-error" style="display:inline-flex">${icon("chevron-right", 20)}</span>
        </button>
        <div style="height:40px"></div>
      </div>
    </div>
  </div>`;
}

function accountDeletionState(app) {
  if (!app.ui.accountDeletion) {
    app.ui.accountDeletion = {
      challengeId: null,
      challengeVersion: null,
      expiresAt: null,
      code: "",
      busy: false,
      error: null,
    };
  }
  return app.ui.accountDeletion;
}

export function renderAccountDeletion(app) {
  const state = accountDeletionState(app);
  const student = app.state.workspace.student;
  const codeError = state.code !== "" && !/^\d{4,10}$/u.test(state.code);
  const challengeReady = typeof state.challengeId === "string" && Number.isInteger(state.challengeVersion) && state.challengeVersion > 0;
  return `<div class="screen" style="background:transparent">
    <div class="screen-scroll" data-scroll-key="account-deletion">
      <div class="col" style="gap:16px">
        <button class="row pressable" data-action="profile.accountDeletionBack" ${state.busy ? "disabled" : ""} style="gap:8px;padding:12px 0 4px;width:100%;color:var(--color-on-surface)">
          ${icon("chevron-left", 24)}<span class="body-large">${t("common_back")}</span>
        </button>
        <div class="headline-small text-on-surface">${tx("注销账户", "Delete account")}</div>
        <div class="swiss-panel col" style="gap:12px;border:1px solid var(--color-error)">
          <div class="title-medium text-error">${tx("这是不可恢复的危险操作", "This is an irreversible action")}</div>
          <div class="body-medium text-on-surface">${tx("注销后，当前账号会立即停用，所有设备的登录会话、刷新令牌和推送设备关联都会失效。", "Deletion immediately disables this account and revokes sign-ins, refresh tokens, and push-device links on every device.")}</div>
          <div class="body-medium text-on-surface">${tx("可识别个人资料会删除或去标识化；为保证审核和审计完整性必须保留的记录会以匿名方式继续保存。", "Identifying profile data is removed or de-identified. Records required for reviews and audit integrity remain anonymously.")}</div>
          <div class="body-medium text-on-surface">${tx("以后再次注册会创建全新的账号，不会恢复这一个账号或它的历史身份。", "A later registration creates a new account; this identity and its old account are never restored.")}</div>
        </div>
        ${challengeReady ? `<div class="swiss-panel col" style="gap:14px">
          <div class="title-medium text-on-surface">${tx("验证当前邮箱", "Verify your current email")}</div>
          <div class="body-small text-muted">${tx(`验证码已发送到当前已验证邮箱 ${student.email || ""}，有效期约 10 分钟。`, `A code was sent to the current verified email ${student.email || ""} and is valid for about 10 minutes.`)}</div>
          <div class="col">
            ${fieldLabel({ id: "account-deletion-code", label: tx("邮箱验证码", "Email verification code"), required: true })}
            <div style="height:8px"></div>
            <div class="vfield${codeError ? " error" : ""}${state.busy ? " disabled" : ""}">
              <span class="vfield-icon">${icon("lock", 20)}</span>
              <input ${fieldControlAttrs({ id: "account-deletion-code", error: codeError ? tx("请输入 4–10 位数字验证码。", "Enter the 4–10 digit code.") : null, required: true })} class="vfield-input code-style" type="text" inputmode="numeric" maxlength="10" autocomplete="one-time-code" value="${esc(state.code)}" data-input="profile.accountDeletionCode" ${state.busy ? "disabled" : ""} />
            </div>
            ${fieldSupport({ id: "account-deletion-code", error: codeError ? tx("请输入 4–10 位数字验证码。", "Enter the 4–10 digit code.") : null, helper: tx("验证码只用于这次注销确认。", "The code is used only for this deletion confirmation.") })}
          </div>
          <button class="vlogin-submit pressable" data-action="profile.accountDeletionFinalConfirm" ${state.busy ? "disabled" : ""} style="background:var(--color-error)">
            ${state.busy ? `${spinner(18, "on-primary")}<span style="width:10px"></span>` : ""}<span class="title-medium">${tx("最终确认注销", "Final deletion confirmation")}</span>
          </button>
        </div>` : `<button class="vlogin-submit pressable" data-action="profile.accountDeletionRequestConfirm" ${state.busy ? "disabled" : ""} style="background:var(--color-error)">
          ${state.busy ? `${spinner(18, "on-primary")}<span style="width:10px"></span>` : ""}<span class="title-medium">${tx("开始注销验证", "Start deletion verification")}</span>
        </button>`}
        ${state.error ? userFacingErrorPanel(state.error, { compact: true }) : ""}
        <div style="height:40px"></div>
      </div>
    </div>
  </div>`;
}

export const profileActions = {
  "profile.editDetails": (app) => {
    const student=app.state.workspace.student;
    app.ui.profileDetails={...Object.fromEntries(profileFields.map(([id,key])=>[id,student[key] || ''])), otherRegionName:student.otherRegionName || '', gender:String(student.gender || '').toUpperCase(), expectedVersion:student.profileVersion, busy:false, error:null};
    app.openSub('account'); app.render();
  },
  "profile.detailsField": (app,el) => {
    const state=app.ui.profileDetails;
    if (!state || state.busy) return;
    state[el.dataset.field]=el.value; state.error=null;
    if (el.dataset.field==='collegeName') { state.majorName=''; app.render(); }
    if (el.dataset.field==='regionCode') app.render();
  },
  "profile.cancelDetails": (app) => {app.ui.profileDetails=null;app.render();},
  "profile.saveDetails": async (app) => {
    const state=app.ui.profileDetails, form=app._viewport?.querySelector('[data-profile-details-form]');
    if (!state || state.busy || !form?.reportValidity()) return;
    if (!validAcademicDetails(state.collegeName,state.majorName.trim())) { state.error=tx('专业须符合学院选项，且仅包含大写英文字母。','Choose a valid major containing uppercase letters only.'); app.render(); return; }
    if(!/^2[0-9]{9}$/.test(state.studentNumber.trim())) {state.error=tx('学号格式不正确，请填写 2 开头的 10 位正式学号。','Enter a 10-digit student number starting with 2.');app.render();return;}
    if(!state.fullName.trim() || (!/^[\p{L}\p{M} .·'’-]+$/u.test(state.fullName.trim()) || !/\p{L}/u.test(state.fullName.trim()))) {state.error=tx('请填写真实姓名，不可包含数字或特殊符号。','Enter your full name without numbers or symbols.');app.render();return;}
    state.busy=true;state.error=null;app.render();
    try {
      await request('/me/student-profile',{method:'POST',idempotent:true,body:{
        studentNumber:state.studentNumber.trim(),fullName:state.fullName.trim(),gender:state.gender,gradeYear:Number(state.gradeYear),
        collegeName:state.collegeName.trim(),majorName:state.majorName.trim(),dateOfBirth:state.dateOfBirth,
        regionCode:state.regionCode,...(state.regionCode==='OTHER'?{otherRegionName:state.otherRegionName.trim()}:{}),expectedVersion:state.expectedVersion}});
      app.ui.profileDetails=null;
      await app.reloadApiWorkspace();
      app.ui.profileDetails=null;
    } catch(error) {state.error=toUserFacingError(error).message; if(error.status===409) {await app.reloadApiWorkspace(); state.expectedVersion=app.state.workspace.student.profileVersion;} app.ui.profileDetails=state;}
    finally {state.busy=false;app.render();}
  },
  "profile.openSettings": (app) => app.openSub("settings"),
  "profile.openAccount": (app) => app.openSub("account"),
  "profile.openExemption": (app) => app.openSub("exemption", { targetId: null }),
  "profile.openEndurance": (app) => {
    app.ui.endurance = null;
    app.openSub("endurance");
  },
  "profile.subBack": (app) => app.closeSub(),
  "profile.settingsBack": (app) => app.closeSub(),
  "profile.openBinding": (app) => {
    app.ui.binding = null;
    app.openSub("binding");
  },
  "profile.openHelp": (app) => {
    app.ui.help = null;
    app.openSub("help");
  },
  "profile.openPrivacy": (app) => app.openSub("privacy"),
  "profile.openFeedback": (app) => {
    app.ui.feedback = null;
    app.openSub("feedback");
  },
  "profile.openAbout": (app) => app.openSub("about"),
  "profile.openAccountDeletion": (app) => {
    app.showDialog({
      title: tx("注销账户", "Delete account"),
      body: tx("暂时功能无法实现，敬请期待", "This feature is not available yet. Please stay tuned."),
      buttons: [{ label: tx("知道了", "OK"), action: "dialog.close" }],
    });
  },
  "profile.accountDeletionBack": (app) => {
    if (accountDeletionState(app).busy) return;
    app.ui.accountDeletion = null;
    app.closeSub();
  },
  "profile.accountDeletionCode": (app, el) => {
    const state = accountDeletionState(app);
    state.code = String(el.value || "").replace(/\D/gu, "").slice(0, 10);
    state.error = null;
    app.render();
  },
  "profile.accountDeletionRequestConfirm": (app) => {
    app.showDialog({
      title: tx("确认开始注销验证", "Start deletion verification?"),
      body: tx("下一步会向当前已验证邮箱发送验证码。账号此时还不会注销。", "The next step sends a code to the current verified email. The account is not deleted yet."),
      buttons: [
        { label: t("common_cancel"), action: "dialog.close" },
        { label: tx("发送验证码", "Send code"), action: "profile.accountDeletionRequest" },
      ],
    });
  },
  "profile.accountDeletionRequest": async (app) => {
    app.state.dialog = null;
    const state = accountDeletionState(app);
    state.busy = true;
    state.error = null;
    app.render();
    try {
      const result = await requestCurrentUserAccountDeletionChallenge(
        app.state.workspace.student.userVersion,
      );
      state.challengeId = result.challengeId;
      state.challengeVersion = result.version;
      state.expiresAt = result.expiresAt || null;
      state.code = "";
    } catch (error) {
      state.error = toUserFacingError(error);
    } finally {
      state.busy = false;
      app.render();
    }
  },
  "profile.accountDeletionFinalConfirm": (app) => {
    const state = accountDeletionState(app);
    if (!/^\d{4,10}$/u.test(state.code)) {
      app.render();
      focusFirstInvalidField(app._viewport, ["#account-deletion-code"]);
      return;
    }
    app.showDialog({
      title: tx("最后确认：注销账户", "Final confirmation: delete account"),
      body: tx("确认后账号立即停用，所有设备退出登录，且无法恢复。", "Confirming immediately disables the account, signs out every device, and cannot be undone."),
      dismissible: false,
      buttons: [
        { label: t("common_cancel"), action: "dialog.close" },
        { label: tx("确认永久注销", "Permanently delete"), action: "profile.accountDeletionFinalize" },
      ],
    });
  },
  "profile.accountDeletionFinalize": async (app) => {
    app.state.dialog = null;
    const state = accountDeletionState(app);
    if (!state.challengeId || !Number.isInteger(state.challengeVersion)) return;
    state.busy = true;
    state.error = null;
    app.render();
    try {
      await confirmCurrentUserAccountDeletion(
        state.challengeId,
        state.challengeVersion,
        state.code,
      );
      app.logout({ clearAccountData: true });
    } catch (error) {
      if (error instanceof ApiError && Number.isInteger(error.details?.actualVersion)) {
        state.challengeVersion = error.details.actualVersion;
      }
      if (error instanceof ApiError && error.code === "ACCOUNT_DELETION_REAUTH_REQUIRED") {
        state.challengeId = null;
        state.challengeVersion = null;
        state.expiresAt = null;
        state.code = "";
      }
      state.error = toUserFacingError(error);
      state.busy = false;
      app.render();
    }
  },
  "profile.theme": (app, el) => {
    app.setThemeMode(el.dataset.value);
  },
  "profile.language": (app, el) => {
    if (el.dataset.value !== getLanguage()) app.setAppLanguage(el.dataset.value);
  },
  "profile.logoutConfirm": (app) => {
    app.showDialog({
      title: t("profile_logout"),
      body: t("profile_logout_confirmation_message"),
      buttons: [
        { label: t("common_cancel"), action: "dialog.close" },
        { label: t("profile_logout"), action: "profile.logout" },
      ],
    });
  },
  "profile.logout": (app) => {
    app.state.dialog = null;
    app.logout();
  },
};

function profileReasonLabel(reason) {
  if(reason.startsWith('manual:')) return reason.slice(7);
  const labels={fullName:['姓名格式异常','Invalid name'],studentNumber:['学号格式异常','Invalid student number'],gender:['请选择性别','Select gender'],gradeYear:['入学年份异常','Invalid admission year'],collegeName:['请重新选择学院','Select college'],majorName:['请重新选择专业','Select major'],dateOfBirth:['请填写有效出生日期','Enter a valid birth date'],regionCode:['请重新选择地域','Select region'],'fullName.review':['请确认真实姓名','Confirm your full name']};
  return labels[reason]?tx(...labels[reason]):reason;
}
export function renderRequiredProfile(app) {
  if(!app.ui.profileDetails) {
    const student=app.state.workspace.student;
    app.ui.profileDetails={...Object.fromEntries(profileFields.map(([id,key])=>[id,student[key] || ''])),gender:String(student.gender || '').toUpperCase(),otherRegionName:student.otherRegionName || '',expectedVersion:student.profileVersion,busy:false,error:null};
  }
  return `<div class="screen screen-scroll" style="padding:24px" role="main">${profileCompletionForm(app)}</div>`;
}
