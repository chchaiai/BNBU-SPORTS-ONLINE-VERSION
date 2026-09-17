import {openMaterialPreview} from '../material-preview.js';
import {uploadProgressLabel} from '../upload-progress.js';
import {prepareApplicationFile} from '../material-files.js';
import {readApplicationDraft,writeApplicationDraft,deleteApplicationDraft} from '../application-draft-store.js';
// Endurance / fitness-test view (#35). Students only see confirmed time or exemption.
// Exemption applications (#36) — exemption/ExemptionScreen.kt
// Exemption applications use the authenticated `/api/v1` draft/upload/update/submit workflow.

import { t, tx } from "../i18n.js";
import { formatMediaSize } from "../media-size.js";
import { icon } from "../icons.js";
import { validateApplicationProofFile, applicationProofCount } from "../proofs.js";
import { esc, spinner, emptyPlaceholder, validationPanel, sectionTitle, statusBadge, statusMessagePanel, segmented, actionButton, fieldLabel, fieldControlAttrs, fieldSupport, userFacingErrorPanel, focusFirstInvalidField } from "../ui.js";
import {
  ApiError,
  createExemptionApplication,
  createMediaAccessUrl,
  getMediaEvidence,
  proxyObjectUrl,
  submitExemptionApplication,
  toUserFacingError,
  updateExemptionApplication,
  uploadExemptionApplicationMediaDraft,
  listMyEnrollments,
} from "../api.js";

// ═══════════════════════════════════════════════════════════════
//  #35 Endurance scoring
// ═══════════════════════════════════════════════════════════════

function formatRunTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}′${String(seconds).padStart(2, "0")}″`;
}

function demographicLabel(student) {
  const gender = student.gender === "male" ? tx("男", "Male") : student.gender === "female" ? tx("女", "Female") : student.gender;
  const grade = { freshman: tx("大一", "Year 1"), sophomore: tx("大二", "Year 2"), junior: tx("大三", "Year 3"), senior: tx("大四", "Year 4") }[student.gradeLevel] || student.gradeLevel;
  return [gender, grade].filter(Boolean).join(" · ");
}

export function renderEnduranceScoring(app) {
  const student = app.state.workspace.student;
  const grades = app.state.workspace.grades || {};
  const runType = grades.enduranceRunType || (student.gender === "male" ? "1000m" : student.gender === "female" ? "800m" : "800m / 1000m");
  const label = demographicLabel(student);
  const status = grades.enduranceRunStatus;
  const recordedTime = Number.isSafeInteger(grades.enduranceRunTimeSeconds) && grades.enduranceRunTimeSeconds >= 0 ? formatRunTime(grades.enduranceRunTimeSeconds) : null;
  let primary = tx("暂未记录", "Not recorded");
  let hint = tx("只显示教师已确认的项目、用时或免测。没有换算分或等级。", "Only the confirmed event, time, or exemption is shown. No converted scores or bands.");
  if (status === "recorded") {
    primary = recordedTime || primary;
    hint = [tx("已确认的测试用时", "Confirmed test time"), grades.enduranceTestedOn].filter(Boolean).join(' · ');
  } else if (status === "exempt") {
    primary = tx("免测", "Exempt");
    hint = tx("不记录真实用时，不产生换算分", "No recorded time and no converted score");
  }

  return `<div class="screen" style="background:transparent">
    <div class="screen-scroll" data-scroll-key="endurance">
      <div class="col" style="gap:0">
        <button class="row pressable" data-action="services.back" style="height:48px;width:100%;color:var(--color-on-surface)">
          ${icon("chevron-left", 24)}<span class="body-medium">${t("common_back")}</span>
        </button>
        <div style="height:16px"></div>
        ${sectionTitle(t("endurance_title"))}
        <div style="height:8px"></div>
        <div class="swiss-panel">
          <div class="row" style="gap:8px">
            <span class="text-primary" style="display:inline-flex;flex:none">${icon("fitness-center", 22)}</span>
            <div class="col">
              <span class="title-medium text-on-surface">${t("endurance_test", runType)}</span>
              <span class="body-medium text-muted">${esc(label)}</span>
            </div>
          </div>
        </div>
        <div style="height:12px"></div>
        <div class="swiss-panel">
          <div class="headline-medium text-on-surface">${esc(primary)}</div>
          <div style="height:8px"></div>
          <div class="body-small text-muted">${esc(hint)}</div>
        </div>
        <div style="height:28px"></div>
      </div>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
//  #36 Exemptions
// ═══════════════════════════════════════════════════════════════

const EXEMPTION_TYPES = {
  "800m": { checkIn: false, applicationType: "PHYSICAL_TEST", applicationSubtype: "RUN_800M" },
  "1000m": { checkIn: false, applicationType: "PHYSICAL_TEST", applicationSubtype: "RUN_1000M" },
  team: { checkIn: true, applicationType: "EXERCISE_CHECK_IN", applicationSubtype: "SCHOOL_TEAM" },
  club: { checkIn: true, applicationType: "EXERCISE_CHECK_IN", applicationSubtype: "STUDENT_CLUB" },
};
const MAX_EXEMPTION_REASON = 1000;
const MAX_EXEMPTION_MEDIA_ITEMS = 3;
const exemptionProofCount = (ui) => applicationProofCount(ui.serverDraft?.mediaIds || ui.resubmitting?.mediaIds, ui.form.proofs);
const applicationOwner = app => {
  const courses = app.state.workspace.courses.filter(course => course.enrollmentStatus === 'enrolled' && course.enrollmentId);
  const course = courses.find(item => item.isCurrent) || (courses.length === 1 ? courses[0] : null);
  const owner = app.state.workspace.student.localOwnerId;
  return owner && course ? `${owner}:enrollment:${course.enrollmentId}:v${course.enrollmentVersion || 1}` : null;
};
function persistApplication(app,ui) {
  ui.formEdited=true;const owner=applicationOwner(app);if(!owner || ui.resubmitting)return;
  const form={type:ui.form.type,organization:ui.form.organization,reason:ui.form.reason,proofs:ui.form.proofs.map(({id,name,size,file,captureSource,mediaId})=>({id,name,size,file,captureSource,mediaId}))};
  void writeApplicationDraft(owner,form).catch(()=>{ui.form.notice=tx('本机草稿保存失败，请保持页面打开后重试。','Local draft saving failed. Keep this page open and retry.');});
}


export function enduranceExemptionTypeForGender(gender) {
  switch (String(gender || "").trim().toLowerCase()) {
    case "male": return "1000m";
    case "female": return "800m";
    default: return null;
  }
}

const exemptionTypeLabel = (type) => ({
  "800m": tx("800m 免测", "800 m test exemption"),
  "1000m": tx("1000m 免测", "1000 m test exemption"),
  team: tx("校队免打卡", "Team check-in exemption"),
  club: tx("社团免打卡", "Club check-in exemption"),
}[type] || type);

const exemptionTypeOptionLabel = (type) => ({
  "800m": tx("800m 耐力跑免测", "800 m endurance-run exemption"),
  "1000m": tx("1000m 耐力跑免测", "1000 m endurance-run exemption"),
  team: tx("校队免打卡", "School-team check-in exemption"),
  club: tx("社团免打卡", "Student-club check-in exemption"),
}[type] || type);

function applicationFieldLabel(id, label) {
  return `<label class="application-field-label" for="${esc(id)}"><span>${esc(label)}</span><span>${tx("必填", "Required")}</span></label>`;
}

function applicationFieldSupport({ id, counterKey, error = null, helper, current, maximum }) {
  const counterPersistent = current >= Math.max(0, maximum - 16);
  return `<div id="${esc(id)}-support" class="application-field-support${error ? " error" : ""}" ${error ? 'role="alert"' : ""}>
    <span>${esc(error || helper)}</span>
    <span class="application-field-counter${counterPersistent ? " persistent" : ""}" data-exemption-counter="${esc(counterKey)}">${current}/${maximum}</span>
  </div>`;
}

const exemptionStatusLabel = (status) => ({
  待审核: tx("审核中", "Under review"), 审核中: tx("审核中", "Under review"),
  需补材料: tx("需补材料", "Additional materials required"),
  已通过: tx("已通过", "Approved"), 已驳回: tx("已驳回", "Rejected"), 已过期: tx("已过期", "Expired"),
}[status] || status);

function exemptionState(app, params = {}) {
  if (!app.ui.exemption) {
    const student = app.state.workspace.student;
    const enduranceType = enduranceExemptionTypeForGender(student.gender);
    app.ui.exemption = {
      tab: "applications",
      selectedId: params.targetId || null,
      resubmitting: null,
      error: null,
      errorField: null,
      success: null,
      submitting: false,
      serverDraft: null,
      proofPreviewUrls: {},
      proofPreviewLoading: false,
      proofPreviewError: null,
      form: {
        type: enduranceType || "team",
        organization: "",
        reason: "",
        proofs: [],
        notice: null,
      },
    };
    const current=app.ui.exemption,owner=applicationOwner(app);
    if(owner)void readApplicationDraft(owner).then(form=>{
      if(app.ui.exemption!==current || current.formEdited || !form || !EXEMPTION_TYPES[form.type])return;
      current.form={...form,notice:tx('已恢复本机草稿，可继续编辑或切换申请类型。','Local draft restored. You can edit it or change its type.')};
      current.serverDraft=app.state.workspace.exemptions.find(item=>item.serverStatus==='DRAFT'&&item.type===form.type)||null;
      app.render();
    }).catch(()=>{});
  } else if (params.targetId && app.ui.exemption.selectedId !== params.targetId && !app.ui.exemption._consumedTarget) {
    app.ui.exemption.selectedId = params.targetId;
    app.ui.exemption._consumedTarget = true;
  }
  return app.ui.exemption;
}

function exemptionCard(exemption) {
  return `<button class="swiss-panel pressable" data-action="exemption.open" data-exemption-id="${esc(exemption.id)}" style="text-align:left">
    <div class="row" style="align-items:flex-start;gap:10px">
      <span class="text-primary" style="display:inline-flex;flex:none">${icon("fitness-center", 22)}</span>
      <div class="col grow" style="gap:8px">
        <div class="row">
          <span class="title-medium text-on-surface grow">${exemptionTypeLabel(exemption.type)}</span>
          ${statusBadge(exemptionStatusLabel(exemption.status), exemption.status === "已通过")}
        </div>
        ${exemption.reason ? `<div class="row" style="align-items:flex-start;gap:6px">
          <span class="text-muted" style="display:inline-flex;flex:none">${icon("description", 16)}</span>
          <span class="body-medium text-muted">${esc(exemption.reason)}</span>
        </div>` : ""}
        ${exemption.organization ? `<span class="body-medium text-muted">${tx(`所属组织：${exemption.organization}`, `Organization: ${exemption.organization}`)}</span>` : ""}
        ${exemption.proofFiles.length ? `<span class="label-medium text-primary">${tx(`已上传 ${exemption.proofFiles.length} 个证明文件`, `${exemption.proofFiles.length} proof file(s) uploaded`)}</span>` : ""}
        ${exemption.reviewComment ? `<div class="membership-comment">
          <span class="text-primary" style="display:inline-flex;flex:none">${icon("warning", 16)}</span>
          <div class="col">
            <span class="label-medium text-on-surface">${tx("审核意见", "Review comments")}</span>
            <span class="body-small text-muted">${esc(exemption.reviewComment)}</span>
          </div>
        </div>` : ""}
        <span class="label-medium text-muted">${tx(`提交时间：${exemption.createdAt} · 点击查看详情`, `Submitted: ${exemption.createdAt} · View details`)}</span>
      </div>
    </div>
  </button>`;
}

function exemptionProofDescriptor(proof, index, previewUrls = {}) {
  const objectProof = proof && typeof proof === "object" ? proof : null;
  const rawSource = String(objectProof?.source || objectProof?.previewUrl || proof || "");
  const mediaId = String(objectProof?.mediaId || (rawSource.startsWith("media:") ? rawSource.slice(6) : ""));
  const source = mediaId ? String(previewUrls[mediaId] || "") : rawSource;
  const sourceName = rawSource.split(/[\\/]/).pop()?.split("?")[0] || "";
  const name = String(objectProof?.name || objectProof?.fileName || (
    /\.(?:jpe?g|png|webp|pdf)$/iu.test(sourceName)
      ? sourceName
      : tx(`证明文件 ${index + 1}`, `Proof file ${index + 1}`)
  ));
  return { mediaId, name, source };
}

function exemptionDetail(app, exemption) {
  const ui = exemptionState(app);
  const proofs = exemption.proofFiles.map((proof, index) =>
    ({...exemptionProofDescriptor(proof, index, ui.proofPreviewUrls),document:ui.proofMimeTypes?.[exemptionProofDescriptor(proof,index).mediaId] === "application/pdf"}));
  return `<div class="col exemption-detail">
    <button class="row pressable exemption-detail-back" data-action="exemption.detailBack">
      ${icon("chevron-left", 24)}<span class="body-medium">${tx("返回我的申请", "Back to my applications")}</span>
    </button>
    <div class="swiss-panel exemption-detail-hero">
      <div class="exemption-detail-hero-row">
        <span class="exemption-detail-hero-icon">${icon("fitness-center", 23)}</span>
        <div class="col grow exemption-detail-heading">
          <span class="label-medium text-primary">${tx("申请详情", "Application details")}</span>
          <span class="headline-small text-on-surface">${esc(exemptionTypeLabel(exemption.type))}</span>
        </div>
        ${statusBadge(exemptionStatusLabel(exemption.status), exemption.status === "已通过")}
      </div>
    </div>
    <div class="swiss-panel exemption-detail-card">
      <div class="exemption-detail-section-head">
        <span class="exemption-detail-section-icon">${icon("assignment", 20)}</span>
        <span class="title-medium text-on-surface grow">${tx("申请信息", "Application information")}</span>
      </div>
      <div class="exemption-detail-field">
        <span class="label-medium text-muted">${tx("申请理由", "Application reason")}</span>
        <span class="body-medium text-on-surface">${esc(exemption.reason || tx("未填写申请理由", "No application reason provided"))}</span>
      </div>
      ${exemption.organization ? `<div class="exemption-detail-field">
        <span class="label-medium text-muted">${tx("所属组织", "Organization")}</span>
        <span class="body-medium text-on-surface">${esc(exemption.organization)}</span>
      </div>` : ""}
      <div class="exemption-detail-time">
        <span class="text-primary exemption-detail-time-icon">${icon("schedule", 20)}</span>
        <div class="col exemption-detail-time-copy">
          <span class="label-medium text-muted">${tx("提交时间", "Submitted")}</span>
          <span class="body-medium text-on-surface">${esc(exemption.createdAt)}</span>
        </div>
      </div>
    </div>
    <div class="swiss-panel exemption-detail-card">
      <div class="exemption-detail-section-head">
        <span class="exemption-detail-section-icon">${icon("description", 20)}</span>
        <span class="title-medium text-on-surface grow">${tx("证明材料", "Supporting documents")}</span>
        <span class="exemption-detail-count">${tx(`${proofs.length} 个文件`, `${proofs.length} file(s)`)}</span>
      </div>
      ${proofs.length === 0
        ? `<div class="body-medium text-muted exemption-detail-empty">${tx("尚未上传证明文件", "No supporting images uploaded")}</div>`
        : `<div class="col exemption-detail-files">${proofs.map((proof, index) => `<div class="exemption-detail-file">
            <button type="button" class="exemption-detail-thumbnail pressable" data-action="exemption.previewRemote" data-media-id="${esc(proof.mediaId)}" data-name="${esc(proof.name)}" aria-label="${esc(tx('预览材料','Preview material'))}" data-exemption-proof-thumbnail="${index + 1}">${proof.source
              ? proof.document ? `PDF` : `<img src="${esc(proof.source)}" alt="${esc(tx(`证明文件 ${index + 1} 缩略图`, `Proof file ${index + 1} thumbnail`))}" loading="lazy" />`
              : ui.proofPreviewLoading
                ? spinner(22)
                : icon("photo", 24)}</button>
            <div class="col grow exemption-detail-file-copy">
              <span class="body-medium text-on-surface exemption-detail-file-name">${esc(proof.name)}</span>
              <span class="body-small text-muted">${tx(`证明文件 ${index + 1}`, `Supporting file ${index + 1}`)}</span>
            </div>
          </div>`).join("")}</div>`}
      ${ui.proofPreviewError ? `<div class="body-small text-muted exemption-detail-preview-note">${esc(ui.proofPreviewError)}</div>` : ""}
    </div>
    <div class="swiss-panel exemption-detail-card">
      <div class="exemption-detail-section-head">
        <span class="exemption-detail-section-icon">${icon("info-outline", 20)}</span>
        <span class="title-medium text-on-surface grow">${tx("处理意见", "Review comments")}</span>
      </div>
      <div class="exemption-detail-review">
        <span class="exemption-detail-review-icon">${icon("info-outline", 20)}</span>
        <div class="col grow exemption-detail-review-copy">
          <span class="label-medium text-on-surface">${tx("当前处理意见", "Current review comment")}</span>
          <span class="body-medium text-muted">${esc(exemption.reviewComment || tx("暂无处理意见", "No review comment yet"))}</span>
        </div>
      </div>
    </div>
    ${exemption.serverStatus === "SUPPLEMENT_REQUIRED" || exemption.status === "需补材料"
      ? actionButton({ label: tx("补交证明材料", "Submit additional documents"), iconName: "upload-file", action: "exemption.supplement", filled: true })
      : ""}
  </div>`;
}

function newExemptionForm(app, ui) {
  const student = app.state.workspace.student;
  const form = ui.form;
  for (const proof of form.proofs) {
    if (proof.coverLoaded) continue;
    proof.coverLoaded = true;
    void (async () => {
      if (proof.file?.type?.startsWith('image/')) {
        proof.coverUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(reader.result);
          reader.onerror = reject; reader.readAsDataURL(proof.file);
        });
      } else if (proof.mediaId) {
        const media = await getMediaEvidence(proof.mediaId);
        if (media.verifiedMimeType?.startsWith('image/'))
          proof.coverUrl = proxyObjectUrl((await createMediaAccessUrl(proof.mediaId)).accessUrl);
      }
      if (app.ui.exemption === ui && ui.form === form) app.render();
    })().catch(() => { proof.coverLoaded = false; });
  }
  const initial = ui.resubmitting;
  const draftLocked = Boolean(initial);
  const exemptions = app.state.workspace.exemptions;
  const pendingTypes = new Set(exemptions.filter((e) => e.status === "待审核" || e.status === "审核中").map((e) => e.type));
  const hasPendingSameType = !initial && pendingTypes.has(form.type);
  const enduranceType = enduranceExemptionTypeForGender(student.gender);
  const runTypes = enduranceType ? [enduranceType] : [];
  const availableTypes = [...runTypes, "team", "club"];
  const isCheckInType = EXEMPTION_TYPES[form.type]?.checkIn;
  const maxAttachments = MAX_EXEMPTION_MEDIA_ITEMS;
  const totalAttachments = exemptionProofCount(ui);
  const typeRows = [];
  for (let i = 0; i < availableTypes.length; i += 2) typeRows.push(availableTypes.slice(i, i + 2));

  return `<div class="swiss-panel"><div class="col" style="gap:16px">
    ${draftLocked ? `<span class="body-medium text-primary">${initial
      ? tx(`正在为 ${exemptionTypeLabel(initial.type)} 补交证明，请上传新的有效材料。`, `Submitting additional documents for ${exemptionTypeLabel(initial.type)}. Upload new valid documents.`)
      : tx(`正在编辑 ${exemptionTypeLabel(form.type)} 草稿。`, `Continuing the ${exemptionTypeLabel(form.type)} draft; its type is locked.`)}</span>` : `
      <span class="label-medium text-muted">${tx("选择申请类型", "Select application type")}</span>
      <div class="col" style="gap:10px">
        ${typeRows.map((row) => `<div class="row" style="gap:10px">${row
          .map((type) => `<button class="exemption-type-btn pressable${form.type === type ? " selected" : ""}" data-action="exemption.selectType" data-value="${type}" ${ui.submitting || pendingTypes.has(type) ? "disabled" : ""}>${exemptionTypeOptionLabel(type)}</button>`)
          .join("")}</div>`).join("")}
      </div>
      ${hasPendingSameType ? validationPanel(tx("你已有一个相同类型的待审核申请，请等待教师处理后再提交新申请。", "You already have a pending application of this type. Wait for the teacher's decision before submitting another.")) : ""}`}
    ${isCheckInType ? `<div class="col application-form-field" style="gap:8px">
      ${applicationFieldLabel("exemption-organization", tx("组织名称", "Organization name"))}
      <input ${fieldControlAttrs({ id: "exemption-organization", error: ui.errorField === "organization" ? tx("请填写相关组织名称", "Enter the organization name.") : null, helper: tx("请填写申请对应的组织全称。", "Enter the full organization name."), required: true })} class="text-field${ui.errorField === "organization" ? " error" : ""}" maxlength="128" value="${esc(form.organization)}" placeholder="${tx("填写相关组织名称", "Enter the organization name")}" data-input="exemption.organization" ${ui.submitting ? "disabled" : ""} />
      ${applicationFieldSupport({ id: "exemption-organization", counterKey: "organization", error: ui.errorField === "organization" ? tx("请填写相关组织名称", "Enter the organization name.") : null, helper: tx("请填写申请对应的组织全称。", "Enter the full organization name."), current: form.organization.length, maximum: 128 })}
    </div>` : ""}
    <div class="col application-form-field" style="gap:8px">
      ${applicationFieldLabel("exemption-reason", initial ? tx("补充说明", "Additional notes") : tx("申请理由", "Application reason"))}
      <textarea ${fieldControlAttrs({ id: "exemption-reason", error: ui.errorField === "reason" ? tx("请填写申请理由或补充说明", "Enter an application reason or additional notes.") : null, helper: tx("请只填写审核所需信息，避免加入无关敏感资料。", "Include only information needed for review and avoid unrelated sensitive data."), required: true })} class="text-field${ui.errorField === "reason" ? " error" : ""}" rows="3" maxlength="${MAX_EXEMPTION_REASON}" data-input="exemption.reason" ${ui.submitting ? "disabled" : ""} placeholder="${initial
        ? tx("请说明本次补充材料的内容...", "Describe the additional documents...")
        : isCheckInType
          ? tx("请说明组织身份及申请原因...", "Describe your organization identity and reason...")
          : tx("请说明申请免测的原因...", "Explain why you are applying for an exemption...")}">${esc(form.reason)}</textarea>
      ${applicationFieldSupport({ id: "exemption-reason", counterKey: "reason", error: ui.errorField === "reason" ? tx("请填写申请理由或补充说明", "Enter an application reason or additional notes.") : null, helper: tx("请只填写审核所需信息，避免加入无关敏感资料。", "Include only information needed for review and avoid unrelated sensitive data."), current: form.reason.length, maximum: MAX_EXEMPTION_REASON })}
    </div>
    <div class="col application-proof-section" style="gap:6px">
      <div class="row">
        <span class="label-medium text-muted grow">${tx("证明材料", "Supporting documents")}</span>
        <span class="label-medium text-muted">${tx(`${totalAttachments} / ${maxAttachments} 个文件`, `${totalAttachments} / ${maxAttachments} images`)}</span>
      </div>
      <div class="application-proof-actions">
        ${actionButton({ label: tx("拍照", "Take photo"), iconName: "camera-alt", action: "exemption.takePhoto", filled: totalAttachments < maxAttachments, disabled: ui.submitting || totalAttachments >= maxAttachments, extra: `id="exemption-proof-trigger" aria-describedby="exemption-proof-support"` })}
        ${actionButton({ label: tx("选择照片或 PDF", "Choose photos or PDF"), iconName: "upload-file", action: "exemption.choosePhotos", filled: totalAttachments < maxAttachments, disabled: ui.submitting || totalAttachments >= maxAttachments })}
      </div>
      <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" style="display:none" data-change="exemption.photoPicked" data-exemption-input="camera" />
      <input type="file" accept="application/pdf,image/*" multiple style="display:none" data-change="exemption.photosPicked" data-exemption-input="gallery" />
      ${form.notice ? `<span class="label-medium text-primary">${esc(form.notice)}</span>` : ""}
      ${form.proofs.length === 0
        ? `<span id="exemption-proof-support" class="body-small ${ui.errorField === "proofs" ? "text-error" : "text-muted"}" ${ui.errorField === "proofs" ? 'role="alert"' : ""}>${isCheckInType
            ? tx("必填：至少上传一个能够证明相关组织身份的 PDF、JPEG、PNG 或 WebP 文件。", "Required: upload at least one PDF, JPEG, PNG or WebP file proving organization membership.")
            : tx("必填：至少上传一个耐力跑免测 PDF、JPEG、PNG 或 WebP 证明文件。", "Required: upload at least one PDF, JPEG, PNG or WebP file for the endurance-run exemption.")}</span>`
        : form.proofs.map((proof) => `<div class="exemption-proof-row">
            <button type="button" class="exemption-proof-preview pressable" data-action="exemption.previewLocal" data-proof-id="${esc(proof.id)}" aria-label="${esc(tx('预览材料','Preview material')+': '+proof.name)}">${proof.coverUrl ? `<img src="${esc(proof.coverUrl)}" alt="${esc(proof.name)}">` : `<span class="text-on-surface" style="display:inline-flex;flex:none">${icon("photo", 24)}</span>`}
            <div class="col grow" style="gap:3px;min-width:0">
              <span style="font-size:13px;font-weight:500;color:var(--color-on-surface)" class="ellipsis">${esc(proof.name)}</span>
              <span class="label-medium text-muted">${proof.file?.type === "application/pdf" ? "PDF" : tx("图片", "Image")} · ${formatMediaSize(proof.size)}</span>
            </div>
            </button><button class="icon-btn pressable" data-action="exemption.removeProof" data-proof-id="${esc(proof.id)}" ${ui.submitting ? "disabled" : ""} aria-label="${tx("移除", "Remove")}" style="width:32px;height:32px">${icon("delete", 18)}</button>
          </div>`).join("")}
    </div>
    <button class="primary-btn pressable${ui.submitting ? " is-loading" : ""}" data-action="exemption.submit" ${!ui.submitting && app.isWriteAllowed() && !hasPendingSameType ? "" : "disabled"}>
      ${ui.submitting ? spinner(18, "on-primary") : icon("add", 20)}
      <span>${ui.submitting ? esc(ui.uploadProgress || tx("等待上传", "Waiting to upload")) : initial ? tx("提交补充材料", "Submit additional documents") : tx("提交申请", "Submit application")}</span>
    </button>
    ${!initial ? `<button class="outlined-btn pressable" data-action="exemption.deleteLocalDraft" ${ui.submitting ? "disabled" : ""}>${icon("delete",18)}<span>${tx("删除草稿", "Delete draft")}</span></button><p class="body-small text-muted">${tx("清除本机未提交的表单和材料。", "Clear the unsubmitted form and materials on this device.")}</p>` : ""}
  </div></div>`;
}

export function renderExemption(app, params) {
  // Course membership and application state arrive together. Do not initialize
  // a form from the empty workspace or allow submission before that read ends.
  if (app.isApiMode() && (app.state.isLoading || app.state.isRestoringSession)) {
    return `<div class="screen" style="background:transparent"><div class="screen-scroll" data-scroll-key="exemption"><div class="swiss-panel row" role="status" style="gap:12px">${spinner(22)}<span class="body-medium">${tx("正在加载课程与申请信息…", "Loading course and application information…")}</span></div></div></div>`;
  }
  const ui = exemptionState(app, params);
  const exemptions = app.state.workspace.exemptions;
  const selected = ui.selectedId ? exemptions.find((e) => e.id === ui.selectedId) : null;

  let inner;
  if (selected) {
    inner = exemptionDetail(app, selected);
  } else {
    const listBody = ui.tab === "applications"
      ? exemptions.length === 0
        ? emptyPlaceholder(tx("暂无申请", "No applications"), tx("你还没有提交过免测或免打卡申请。", "You have not submitted a test- or check-in-exemption application."))
        : exemptions.map(exemptionCard).join("")
      : newExemptionForm(app, ui);
    inner = `<div class="col" style="gap:16px">
      <button class="row pressable" data-action="exemption.back" ${ui.submitting ? "disabled" : ""} style="height:48px;width:100%;color:var(--color-on-surface)">
        ${icon("chevron-left", 24)}<span class="body-medium">${tx("返回", "Back")}</span>
      </button>
      ${sectionTitle(tx("体育免测与免打卡申请", "Test and check-in exemptions"))}
      <div class="swiss-panel"><div class="col" style="gap:8px">
        <span class="label-medium text-primary">${tx("后端权威申请", "Backend-authoritative applications")}</span>
        <span class="body-medium text-on-surface">${tx("耐力跑免测仅适用于 800m / 1000m；通过后耐力跑位置显示免测，不记录用时。", "Endurance-run exemptions apply only to 800 m / 1000 m. After approval, the endurance slot shows exemption and records no time.")}</span>
        <span class="body-small text-muted">${tx("校队或社团免打卡须填写组织名称并上传证明，审核通过后由教师确认可抵扣的运动时长。", "Team or club check-in exemptions require an organization name and proof. The instructor confirms any eligible hour offset after approval.")}</span>
        <span class="body-small text-muted">${tx("申请、材料状态和审核结果均以后端为准；提交失败不会在本地伪造成功记录。", "Applications, evidence status, and review results are backend-authoritative. A failed submission never creates a local success record.")}</span>
      </div></div>
      ${segmented({
        items: [
          { value: "applications", label: tx("我的申请", "My applications") },
          { value: "new", label: tx("提交申请", "New application") },
        ],
        selected: ui.tab,
        action: "exemption.tab",
      })}
      ${ui.success ? statusMessagePanel(ui.success, "exemption.dismissSuccess") : ""}
      ${ui.error ? userFacingErrorPanel(ui.error, { compact: true }) : ""}
      ${listBody}
    </div>`;
  }

  return `<div class="screen" style="background:transparent">
    <div class="screen-scroll" data-scroll-key="exemption">${inner}<div style="height:28px"></div></div>
  </div>`;
}

export const servicesActions = {
  "exemption.previewLocal": async (app,el) => {
    const proof=exemptionState(app).form.proofs.find(item=>item.id===el.dataset.proofId);if(!proof)return;
    if(proof.file)return openMaterialPreview({file:proof.file,name:proof.name});
    if(proof.mediaId)return servicesActions['exemption.previewRemote'](app,{dataset:{mediaId:proof.mediaId,name:proof.name}});
  },
  "exemption.previewRemote": async (app,el) => {
    try {const [access,media]=await Promise.all([createMediaAccessUrl(el.dataset.mediaId),getMediaEvidence(el.dataset.mediaId)]);
      await openMaterialPreview({url:proxyObjectUrl(access.accessUrl),name:el.dataset.name,mime:media.verifiedMimeType});
    }catch{exemptionState(app).proofPreviewError=tx('材料加载失败，请重试。','Unable to load proof. Retry.');app.render();}
  },
  "services.back": (app) => {
    app.ui.endurance = null;
    app.closeSub();
  },
  // — Exemption —
  "exemption.back": (app) => {
    app.ui.exemption = null;
    app.closeSub();
  },
  "exemption.tab": (app, el) => {
    const ui = exemptionState(app);
    if (ui.submitting) return;
    ui.tab = el.dataset.value;
    app.render();
  },
  "exemption.open": async (app, el) => {
    const ui = exemptionState(app);
    ui.selectedId = el.dataset.exemptionId;
    ui.proofPreviewUrls = {};
    ui.proofPreviewError = null;
    const selectedId = ui.selectedId;
    const exemption = app.state.workspace.exemptions.find((item) => item.id === selectedId);
    if (exemption?.serverStatus === "DRAFT") {
      ui.selectedId = null;
      ui.serverDraft = exemption;
      ui.tab = "new";
      ui.form = { type: exemption.type, organization: exemption.organization || "", reason: exemption.reason || "", proofs: (exemption.mediaIds||[]).map(mediaId=>({id:mediaId,mediaId,name:tx("已上传材料","Uploaded material"),size:0})), notice: null };
      app.render();
      return;
    }
    const mediaIds = (exemption?.proofFiles || [])
      .map((proof) => exemptionProofDescriptor(proof, 0).mediaId)
      .filter(Boolean);
    ui.proofPreviewLoading = mediaIds.length > 0;
    app.navDirection = "forward";
    app.render();
    if (!ui.proofPreviewLoading) return;
    const results = await Promise.all(mediaIds.map(async (mediaId) => {
      try {
        const [access,media] = await Promise.all([createMediaAccessUrl(mediaId),getMediaEvidence(mediaId)]);
        return [mediaId, proxyObjectUrl(access.accessUrl), null, media.verifiedMimeType];
      } catch (error) {
        return [mediaId, "", error];
      }
    }));
    if (ui.selectedId !== selectedId) return;
    ui.proofPreviewUrls = Object.fromEntries(results.filter(([, url]) => url).map(([mediaId, url]) => [mediaId, url]));
    ui.proofMimeTypes = Object.fromEntries(results.map(([id,,,mime])=>[id,mime]));
    ui.proofPreviewLoading = false;
    if (results.some(([, , error]) => error)) {
      ui.proofPreviewError = tx("部分证明文件暂时无法加载。", "Some proof images are temporarily unavailable.");
    }
    app.render();
  },
  "exemption.detailBack": (app) => {
    const ui = exemptionState(app);
    ui.selectedId = null;
    app.navDirection = "back";
    app.render();
  },
  "exemption.supplement": (app) => {
    const ui = exemptionState(app);
    ui.resubmitting = app.state.workspace.exemptions.find((e) => e.id === ui.selectedId) || null;
    if (ui.resubmitting?.serverStatus && ui.resubmitting.serverStatus !== "SUPPLEMENT_REQUIRED") return;
    ui.selectedId = null;
    ui.tab = "new";
    ui.form.reason = "";
    ui.form.organization = ui.resubmitting?.organization || "";
    ui.form.type = ui.resubmitting?.type || ui.form.type;
    ui.form.proofs = [];
    ui.serverDraft = ui.resubmitting;
    ui.error = null;
    ui.errorField = null;
    app.render();
  },
  "exemption.selectType": (app, el) => {
    const ui = exemptionState(app);
    if (ui.submitting || ui.resubmitting) return;
    ui.serverDraft = null;
    ui.form.type = el.dataset.value;
    const savedDraft = app.state.workspace.exemptions.find((item) => item.serverStatus === "DRAFT" && item.type === ui.form.type);
    if (savedDraft) {
      ui.serverDraft = savedDraft;
      ui.form.organization = savedDraft.organization || "";
      ui.form.reason = savedDraft.reason || "";
    }
    if (!EXEMPTION_TYPES[ui.form.type]?.checkIn) ui.form.organization = "";
    persistApplication(app,ui);
    app.render();
  },
  "exemption.organization": (app, el) => {
    const ui = exemptionState(app);
    ui.form.organization = el.value.slice(0, 128);
    persistApplication(app,ui);
    if (ui.errorField === "organization") ui.errorField = null;
    const counter = app._viewport?.querySelector('[data-exemption-counter="organization"]');
    if (counter) {
      counter.textContent = `${ui.form.organization.length}/128`;
      counter.classList.toggle("persistent", ui.form.organization.length >= 112);
    }
  },
  "exemption.reason": (app, el) => {
    const ui = exemptionState(app);
    ui.form.reason = el.value.slice(0, MAX_EXEMPTION_REASON);
    persistApplication(app,ui);
    if (ui.errorField === "reason") ui.errorField = null;
    const counter = app._viewport?.querySelector('[data-exemption-counter="reason"]');
    if (counter) {
      counter.textContent = `${ui.form.reason.length}/${MAX_EXEMPTION_REASON}`;
      counter.classList.toggle("persistent", ui.form.reason.length >= MAX_EXEMPTION_REASON - 16);
    }
  },
  "exemption.takePhoto": (app) => app._viewport?.querySelector('[data-exemption-input="camera"]')?.click(),
  "exemption.choosePhotos": (app) => app._viewport?.querySelector('[data-exemption-input="gallery"]')?.click(),
  "exemption.photoPicked": async (app, el) => {
    const ui = exemptionState(app);
    let file = el.files?.[0];
    el.value = "";
    if (!file) return;
    try {file=await prepareApplicationFile(file);} catch(error){ui.form.notice=error.message;app.render();return;}
    const verdict = validateApplicationProofFile(file);
    if (!verdict.ok) {
      ui.form.notice = verdict.error === "size"
        ? tx("图片不能超过 10 MB。", "Images must not exceed 10 MB.")
        : tx("材料仅支持 PDF、JPEG、PNG 或 WebP 文件。", "Supporting material must be a PDF, JPEG, PNG or WebP file.");
      app.render();
      return;
    }
    if (exemptionProofCount(ui) >= MAX_EXEMPTION_MEDIA_ITEMS) {
      ui.form.notice = tx(`已达到 ${MAX_EXEMPTION_MEDIA_ITEMS} 个凭证上限。`, `Maximum of ${MAX_EXEMPTION_MEDIA_ITEMS} proof items reached.`);
    } else {
      ui.form.proofs.push({ id: `proof-${Date.now()}`, name: file.name, size: file.size, file, captureSource: "IN_APP_CAMERA" });
      ui.errorField = null;
      ui.form.notice = tx("已拍摄 1 张凭证照片。", "Captured 1 proof photo.");
      persistApplication(app,ui);
    }
    app.render();
  },
  "exemption.photosPicked": async (app, el) => {
    const ui = exemptionState(app);
    const remaining = Math.max(0, MAX_EXEMPTION_MEDIA_ITEMS - exemptionProofCount(ui));
    const selected = [...(el.files || [])];
    const files=[];
    for(const file of selected.slice(0,remaining)){try{const prepared=await prepareApplicationFile(file);if(validateApplicationProofFile(prepared).ok)files.push(prepared);}catch{}}
    el.value = "";
    for (const file of files) {
      ui.form.proofs.push({ id: `proof-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: file.name, size: file.size, file, captureSource: "FILE_PICKER" });
    }
    persistApplication(app,ui);
    const rejected = selected.length - files.length;
    ui.form.notice = files.length
      ? tx(`已添加 ${files.length} 个文件${rejected ? `，另有 ${rejected} 个文件因格式、大小或数量限制未添加` : ""}。`, `Added ${files.length} file(s)${rejected ? `; ${rejected} file(s) were rejected by format, size, or count limits` : ""}.`)
      : tx("材料仅支持不超过 10 MB 的 PDF、JPEG、PNG 或 WebP 文件。", "Supporting material must be a PDF, JPEG, PNG or WebP file up to 10 MB.");
    app.render();
  },
  "exemption.removeProof": (app, el) => {
    const ui = exemptionState(app);
    const removed = ui.form.proofs.find((proof) => proof.id === el.dataset.proofId);
    ui.form.proofs = ui.form.proofs.filter((p) => p.id !== el.dataset.proofId);
    persistApplication(app,ui);
    if (removed?.mediaId && Array.isArray(ui.serverDraft?.mediaIds)) {
      ui.serverDraft.mediaIds = ui.serverDraft.mediaIds.filter((mediaId) => mediaId !== removed.mediaId);
    }
    app.render();
  },
  "exemption.dismissSuccess": (app) => {
    exemptionState(app).success = null;
    app.render();
  },
  "exemption.deleteLocalDraft": async (app) => {
    const ui=exemptionState(app);
    if(ui.submitting || ui.resubmitting)return;
    try {
      ui.formEdited=true;
      await deleteApplicationDraft(applicationOwner(app));
      ui.form={type:ui.form.type,organization:"",reason:"",proofs:[],notice:tx("本机草稿已删除。", "Local draft deleted.")};
      ui.serverDraft=null;ui.error=null;ui.errorField=null;ui.success=null;
    } catch(error) {ui.error=toUserFacingError(error);}
    app.render();
  },
  "exemption.submit": async (app) => {
    if (app.isApiMode() && (app.state.isLoading || app.state.isRestoringSession)) return;
    const ui = exemptionState(app);
    if (ui.submitting || !app.isWriteAllowed()) return;
    const reason = ui.form.reason.trim();
    if (EXEMPTION_TYPES[ui.form.type]?.checkIn && !ui.form.organization.trim()) {
      ui.error = null;
      ui.errorField = "organization";
      app.render();
      focusFirstInvalidField(app._viewport, ["#exemption-organization"]);
      return;
    }
    if (!reason) {
      ui.error = null;
      ui.errorField = "reason";
      app.render();
      focusFirstInvalidField(app._viewport, ["#exemption-reason"]);
      return;
    }
    if (exemptionProofCount(ui) === 0) {
      ui.error = null;
      ui.errorField = "proofs";
      app.render();
      focusFirstInvalidField(app._viewport, ["#exemption-proof-trigger"]);
      return;
    }
    // Resolve live membership before using a restored draft or uploading media.
    // A semester display flag is not authoritative enrollment eligibility.
    let activeEnrollments;
    ui.submitting = true;
    ui.uploadProgress = uploadProgressLabel({phase:'WAITING'});
    app.render();
    try { activeEnrollments = (await listMyEnrollments()).filter(item => item.status === 'ACTIVE'); }
    catch (error) { ui.submitting = false; ui.error = toUserFacingError(error); app.render(); return; }
    ui.submitting = false;
    const preferred = app.state.workspace.courses.find(course => course.isCurrent &&
      activeEnrollments.some(item => item.id === course.enrollmentId));
    const enrollmentId = preferred?.enrollmentId || (activeEnrollments.length === 1 ? activeEnrollments[0].id : null);
    if (!enrollmentId) {
      ui.error = toUserFacingError(new ApiError(409, { code: "ENROLLMENT_NOT_ACTIVE" }));
      app.render();
      return;
    }

    if (ui.serverDraft && ui.serverDraft.enrollmentId !== enrollmentId) {
      ui.serverDraft = null;
      ui.resubmitting = null;
      ui.form.proofs = ui.form.proofs.filter(proof => proof.file);
      for (const proof of ui.form.proofs) delete proof.mediaId;
      if (!ui.form.proofs.length) {
        ui.form.notice = tx('班级已变更，请为当前班级重新添加证明材料。', 'Your class has changed. Add proof for your current class.');
        app.render(); return;
      }
    }

    const facts = EXEMPTION_TYPES[ui.form.type];
    const organizationName = facts.checkIn ? ui.form.organization.trim() : null;
    ui.submitting = true;
    ui.error = null;
    ui.errorField = null;
    app.render();
    try {
      let draft = ui.serverDraft;

      for (const proof of ui.form.proofs) {
        if (proof.mediaId) {
          const media = await getMediaEvidence(proof.mediaId);
          if (media.enrollmentId === enrollmentId) continue;
          delete proof.mediaId;
        }
        if (!proof.file) throw new ApiError(422, { code: "EXEMPTION_APPLICATION_MEDIA_INVALID" });
        const uploaded = await uploadExemptionApplicationMediaDraft(draft?.enrollmentId || enrollmentId, proof, proof.file,{onProgress:progress=>{const label=uploadProgressLabel(progress);if(ui.uploadProgress!==label){ui.uploadProgress=label;app.render();}}});
        proof.mediaId = uploaded.mediaId;
      }

      ui.uploadProgress = tx('正在提交申请…', 'Submitting application…');
      app.render();
      const mediaIds = [...new Set([
        ...(Array.isArray(draft?.mediaIds) ? draft.mediaIds : []),
        ...ui.form.proofs.map((proof) => proof.mediaId).filter(Boolean),
      ])];
      if (!draft) {
        const created = await createExemptionApplication({
          enrollmentId,
          applicationType: facts.applicationType,
          applicationSubtype: facts.applicationSubtype,
          organizationName,
          reason,
          mediaIds,
        });
        draft = { ...created, mediaIds: Array.isArray(created.mediaIds) ? created.mediaIds : [] };
        ui.serverDraft = draft;
      }

      const updated = await updateExemptionApplication(draft.id, {
        applicationSubtype: facts.applicationSubtype,
        organizationName,
        reason,
        mediaIds,
        expectedVersion: draft.version,
      });
      ui.serverDraft = { ...draft, ...updated, mediaIds };
      await submitExemptionApplication(updated.id, updated.version);
      ui.success = tx("申请已提交，教师审核结果会以后端记录为准。", "Application submitted. The backend review record is authoritative.");
      ui.resubmitting = null;
      ui.serverDraft = null;
      ui.tab = "applications";
      await app.reloadApiWorkspace();
      ui.form.organization = "";
      ui.form.reason = "";
      ui.form.proofs = [];
      if(applicationOwner(app))await deleteApplicationDraft(applicationOwner(app)).catch(()=>{});
    } catch (error) {
      ui.error = toUserFacingError(error);
      const firstField = ui.error.fieldErrors?.[0]?.field;
      ui.errorField = firstField === "organizationName"
        ? "organization"
        : firstField === "reason"
          ? "reason"
          : firstField === "mediaIds"
            ? "proofs"
            : null;
    } finally {
      ui.submitting = false;
      app.render();
      if (ui.errorField) {
        focusFirstInvalidField(app._viewport, [{ organization: "#exemption-organization", reason: "#exemption-reason", proofs: "#exemption-proof-trigger" }[ui.errorField]]);
      }
    }
  },
};

// Detail back and submitting lock (免测详情返回列表；提交中禁用返回).
export function servicesBackInterceptor(app) {
  if (app.state.subScreen === "exemption" && app.ui.exemption) {
    if (app.ui.exemption.submitting) {
      app.ui.exemption.error = tx("申请正在提交，请等待完成后再返回", "Your application is being submitted. Please wait.");
      app.render();
      return true;
    }
    if (app.ui.exemption.selectedId) {
      app.ui.exemption.selectedId = null;
      app.navDirection = "back";
      app.render();
      return true;
    }
  }
  return false;
}
