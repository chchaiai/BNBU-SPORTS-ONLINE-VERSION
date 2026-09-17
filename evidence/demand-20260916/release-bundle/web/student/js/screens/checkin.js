import {isRealtimeSwim, ensureSwimIntake} from "../swim-submission.js";
import {uploadProgressLabel} from '../upload-progress.js';
import {savePhotoOriginal,listPhotoOriginals,removePhotoOriginal,prepareJpegEvidence} from "../photo-originals.js";
import {SPORT_OPTIONS} from "../sports-catalog.js";
import {proofTodoContext} from '../proof-todo.js';
// Exercise check-in flow (#20–#24) — feature/checkin/CheckInScreen.kt,
// ExerciseCheckInScreen.kt, CheckInRecords.kt, SessionMediaManager.kt and the
// session controller. States: Idle → Active ↔ Paused → Finished → Submitted.
// Drafts remain local until explicit discard or successful server submission.

import { mountLocalVideoPlayer } from "../local-video-player.js";
import { prepareVideoSource, recordingLimit } from "../video-source.js";
import { saveSuccessfulEvidence } from "../native-album.js";
import { saveProofDraft, loadProofDrafts, removeProofDraft, clearProofDrafts } from "../checkin-drafts.js";
import { tx, currentLocale, getLanguage } from "../i18n.js";
import { icon } from "../icons.js";
import { formatMediaSize } from "../media-size.js";
import { esc, spinner, emptyPlaceholder, validationPanel, sectionTitle, statusBadge, userFacingErrorPanel, fieldLabel, fieldControlAttrs, fieldSupport } from "../ui.js";

import { resolvePublicReasonModel, reviewStageFromRecord, reviewStageLabel } from "../v81-review.js";
import { canNormalizeCapturedImage, validateProofFile, PROOF_VIDEO_MAX_BYTES } from "../proofs.js";
import {
  canStartExercise, hasSubmittedCheckInToday, loadSession, saveSession, clearSession,
  startSession, restoreServerSession, pauseSession, resumeSession, sessionDurationMs,
  creditedHours, formatTimer, businessToday, shouldAutoEnd,
} from "../session.js";
import {
  request, startServerSession, pauseServerSession, resumeServerSession, finishServerSession,
  cancelServerSession, createRecordDraft, submitRecord, getSwimIntake, acceptSwimIntake,
  uploadMediaDraft, cacheRecordProofs, createMediaAccessUrl, proxyObjectUrl,
  getRecordWorkflow, getRecordEvidenceContext, submitRecordSupplement,
  loadServerRecordProofs,
  listMyRecords, getActiveSession, getServerSession, ApiError, toUserFacingError,
  isQualificationReached, sessionStartErrorText,
  MAX_PROOF_VIDEO_SECONDS, MAX_PROOF_IMAGES, MAX_PROOF_VIDEOS,
} from "../api.js";

const MAX_DESCRIPTION = 200;
// Mirrors the backend's MEDIA-001 limits (see api.js).
const MAX_IMAGES = MAX_PROOF_IMAGES;
const MAX_VIDEOS = MAX_PROOF_VIDEOS;
const OTHER = "other";

function selectedProofTodo(app) {
  const todos = Array.isArray(app.state.workspace?.proofTodos) ? app.state.workspace.proofTodos : [];
  const focused = checkinState(app).focusProofRecordId;
  return todos.find((item) => item.recordId === focused) || null;
}

function proofSubmitPanel(app) {
  const todo = selectedProofTodo(app);
  if (!todo) return (app.state.workspace.proofTodos||[]).map(item=>`<div class="swiss-panel" style="margin-top:12px">${proofTodoContext(item)}<button class="outlined-btn pressable" data-action="checkin.selectProof" data-record-id="${esc(item.recordId)}" style="margin-top:10px">${tx('为这条记录补证','Add evidence for this record')}</button></div>`).join('');
  const ui = checkinState(app);
  const retained = (ui.drafts || []).filter((draft) => draft.url);
  return `${proofTodoContext(todo)}<div class="body-small text-muted" style="margin-top:12px">${tx("请在有效期内现场拍摄并提交补充材料，原材料会一并保留供教师复核。", "Capture and submit additional evidence before the deadline. Original evidence is retained for teacher review.")}</div>
    <button class="outlined-btn pressable" type="button" data-action="checkin.submitProof" ${app.isWriteAllowed() && !ui.finish.submitting && !ui.restoringDrafts && !todo.paused && !todo.expired ? "" : "disabled"} style="min-height:44px;margin-top:8px">${retained.length ? tx("提交这条记录的补证", "Submit evidence for this record") : tx("为这条记录拍摄补证", "Capture evidence for this record")}</button>`;
}

function creditPolicyChips(policy) {
  const threshold = Number(policy?.minCreditThresholdMinutes);
  const knownThreshold = Number.isInteger(threshold) && threshold >= 1 && threshold <= 1440 &&
    Number.isInteger(policy?.weeklyLimit) && policy.weeklyLimit > 0 && Number.isInteger(policy?.dailyLimit) && policy.dailyLimit > 0;
  return `<div class="body-medium text-on-surface" data-testid="checkin.minimum-duration">${knownThreshold
    ? `${tx("本课程运动要求", "Current course requirements")}<br>${tx(`每周最多计入：${policy.weeklyLimit} 次`, `Weekly maximum: ${policy.weeklyLimit}`)}<br>${tx(`每天最多计入：${policy.dailyLimit} 次`, `Daily maximum: ${policy.dailyLimit}`)}<br>${tx(`最低运动时长：${threshold} 分钟`, `Minimum exercise duration: ${threshold} minutes`)}`
    : tx("最短运动时长暂未获取，请刷新后重试。", "The minimum exercise duration is unavailable. Refresh and try again.")}${Number.isInteger(policy?.maxCreditMinutes)?`<br>${tx(`单次最多打卡时长：${policy.maxCreditMinutes} 分钟（到点自动结束）`,`Maximum per check-in: ${policy.maxCreditMinutes} minutes (ends automatically)`)}`:''}</div>`;
}

function initialLiveCameraState() {
  return {
    mode: null,
    status: "idle",
    stream: null,
    recorder: null,
    chunks: [],
    timer: null,
    countdownTimer: null,
    recordingStartedAt: null,
    pausedAt: null,
    pausedDurationMs: 0,
    finalDurationSeconds: null,
    discardOnStop: false,
  };
}



const creditTypeLabel = (creditType) =>
  creditType === "course" ? tx("课程相关", "Course-related") : creditType === "general" ? tx("其他运动", "Other exercise") : tx("系统抵扣", "System offset");

const estimatedCreditedHours = (app,durationMs) => {
  const local=loadSession(accountId(app));
  const maximumMinutes=local?((local.maximumDurationSeconds??3600)/60):(app.state.workspace?.creditPolicy?.maxCreditMinutes??60);
  const hours=creditedHours(durationMs,app.state.workspace?.creditPolicy?.minCreditThresholdMinutes,maximumMinutes);
  return hours === null ? "—" : Number(hours.toFixed(2));
};

/** Use only the Backend's submitted-record fact; missing data never falls back to a local timer. */
export function authoritativeCreditedHours(record) {
  const seconds = record?.creditedDurationSeconds;
  return Number.isInteger(seconds) && seconds >= 0 ? seconds / 3600 : null;
}

function sportLabel(details) {
  if (details.sportType === OTHER) return details.customSportName || "";
  const option = SPORT_OPTIONS.find((o) => o.value === details.sportType);
  return option ? tx(option.zh, option.en) : details.sportType;
}

function sportIconName(value) {
  const raw = String(value || "").trim();
  const key = raw.toLowerCase();
  const option = SPORT_OPTIONS.find((item) => item.value === key || item.zh === raw);
  return option?.icon || "sport-other";
}

/** courseSportSelection (ExerciseSessionState.kt): sport inferred from course name. */
function courseSportSelection(courseName) {
  const name = courseName.trim();
  const known = [
    ["table_tennis", "乒乓球", ["乒乓球", "table tennis", "ping pong", "ping-pong"]],
    ["badminton", "羽毛球", ["羽毛球", "badminton"]],
    ["basketball", "篮球", ["篮球", "basketball"]],
    ["football", "足球", ["足球", "football", "soccer"]],
    ["swimming", "游泳", ["游泳", "swimming"]],
    ["running", "跑步", ["跑步", "长跑", "running"]],
    ["cycling", "骑行", ["骑行", "cycling"]],
    ["fitness", "健身", ["健身", "体能", "力量训练", "fitness"]],
  ];
  const lower = name.toLowerCase();
  for (const [sportType, displayName, keywords] of known) {
    if (keywords.some((k) => lower.includes(k.toLowerCase()))) return { sportType, displayName, customSportName: null };
  }
  const paren = [...name.matchAll(/[（(]([^（）()]+)[）)]/g)].pop()?.[1]?.trim();
  const displayName = paren || name || "课程运动";
  return { sportType: OTHER, displayName, customSportName: displayName };
}

function checkinState(app) {
  if (!app.ui.checkin) {
    app.ui.checkin = {
      tab: "exercise",
      selectedRecordId: null,
      setup: { creditType: "course", generalSportType: "running", generalCustomSportName: "" },
      finish: { submitting: false },
      mediaNotice: null,
      captureError: null,
      recordOpenError: null,
      recordProofLoadingId: null,
      sessionTransitioning: false,
      activeSessionConflict: null,
      drafts: [],
      previewDraftId: null,
      focusProofRecordId: null,
      liveCamera: initialLiveCameraState(),
    };
  }
  if (!app.ui.checkin.liveCamera) {
    app.ui.checkin.liveCamera = initialLiveCameraState();
  }
  return app.ui.checkin;
}

/** The single current enrolled-and-open course (shared lookup). */
function findCurrentCourse(workspace) {
  return workspace.courses.find(
    (c) => c.isCurrent && c.enrollmentStatus === "enrolled" && ["active", "open", "enabled"].includes(String(c.status).trim().toLowerCase())
  ) || null;
}

function originalOwnerId(app) {
  return app.state.workspace.student.localOwnerId || accountId(app);
}

function accountId(app) {
  return app.state.workspace.student.id;
}

function draftScope(app) {
  const focused=selectedProofTodo(app);if(focused)return 'proof:'+focused.recordId;
  const session = loadSession(accountId(app));
  return session?.serverId && session.phase !== "submitted" ? session.serverId
    : "pending";
}

export async function restoreCheckinContinuity(app) {
  const owner = accountId(app), ui = checkinState(app), scope = draftScope(app);
  const local = loadSession(owner), server = app.state.workspace.activeServerSession;
  if (local?.serverId === server?.id && ["active", "paused"].includes(local?.phase) && ["IN_PROGRESS", "PAUSED"].includes(server?.status)) persist(app, reconcileAuthoritativeSession(local, server));
  if (!owner || ui.draftScope === scope) return;
  for(const draft of ui.drafts)if(draft.url?.startsWith('blob:'))URL.revokeObjectURL(draft.url);
  ui.drafts=[];ui.proofSubmissionIntent=null;ui.captureError=null;
  ui.draftScope = scope;
  ui.restoringDrafts = true;
  try {
    const drafts = await loadProofDrafts(owner, scope);
    if (accountId(app) !== owner || app.ui.checkin !== ui || ui.draftScope !== scope) {
      for (const draft of drafts) URL.revokeObjectURL(draft.url);
      return;
    }
    const ids = new Set(ui.drafts.map(draft => draft.id));
    for (const draft of drafts) if (!ids.has(draft.id)) ui.drafts.push(draft); else URL.revokeObjectURL(draft.url);
    for (const draft of drafts.filter(d=>d.normalizationPending)) await addDraftFromFile(app,draft.blob,"video",draft.capturedDurationSeconds,draft.id,draft.nativeCapture ?? false);
  } catch {
    ui.captureError = tx("无法读取本机保存的凭证，请保持此页面并重试。", "Cannot read saved proof on this device. Keep this page open and retry.");
    ui.draftScope = null;
  } finally { ui.restoringDrafts = false; }
}

export async function resumeCheckinContinuity(app) {
  if (!app.state.authenticated || app.state.isLoading || !app.isApiMode()) return;
  const owner = accountId(app), local = loadSession(owner);
  if (!local?.serverId || !["active", "paused"].includes(local.phase)) return;
  try {
    const server = await getServerSession(local.serverId);
    if (accountId(app) !== owner || loadSession(owner)?.serverId !== local.serverId) return;
    if (["IN_PROGRESS", "PAUSED"].includes(server.status)) {
      const reconciled = reconcileAuthoritativeSession(local, server);
      persist(app, reconciled);
      app.state.workspace.activeServerSession = server;
      // Preserve a playing video or open camera while updating the clock.
      if (reconciled.phase !== local.phase) app.render();
      else checkinTick(app);
    }
  } catch { /* Temporary connectivity loss must not erase the local session. */ }
}

function healthAcknowledged(app) {
  return app.overlay.healthReminderAck === true;
}

// ── Readiness (evaluateCheckInReadiness) ──
function evaluateReadiness(app) {
  const workspace = app.state.workspace;
  if (String(workspace.student.accountStatus).toUpperCase() !== "ACTIVE") {
    return { canStart: false, blockedReason: tx("账号状态异常，无法打卡", "Account status prevents check-in.") };
  }
  if (!app.hasActiveEnrollment()) {
    return { canStart: false, blockedReason: tx("你尚未加入本学期体育课程，请先扫码或输入邀请码加入", "You have not joined a sports course this semester. Scan a QR code or enter an invitation code first.") };
  }
  if (workspace.activeServerSession && ['IN_PROGRESS','PAUSED'].includes(workspace.activeServerSession.status))
    return {canStart:true, blockedReason:null};
  if(workspace.creditPolicy?.allocationPending)return {canStart:false,blockedReason:tx('课程总目标已调整，等待教师分配两类目标后即可开始打卡。','The course target changed. New check-ins resume after your teacher allocates both category targets.')};
  if (!findCurrentCourse(workspace)) {
    return { canStart: false, blockedReason: tx("当前课程尚未开放打卡，请联系任课教师", "Check-in is not open for the current course. Contact your instructor.") };
  }
  // The start endpoint evaluates current regular and per-student makeup windows.
  // Cached legacy dates cannot veto a server-authorized makeup session.
  if (app.isApiMode()) return { canStart: true, blockedReason: null };
  const windowReason = canStartExercise(workspace.checkInTimeWindow);
  if (windowReason) return { canStart: false, blockedReason: windowReason };
  return { canStart: true, blockedReason: null };
}

const formatDateTime = (ms) => new Date(ms).toLocaleString(currentLocale(), { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const formatDateOnly = (ms) => new Date(ms).toLocaleDateString(currentLocale(), { year: "numeric", month: "short", day: "numeric" });
const formatTimeOnly = (ms) => new Date(ms).toLocaleTimeString(currentLocale(), { hour: "2-digit", minute: "2-digit" });

function statusPill(label, color) {
  return `<span class="checkin-pill" style="background:color-mix(in srgb, ${color} 12%, transparent);color:${color}">
    <span class="dot" style="background:${color}"></span>${esc(label)}
  </span>`;
}

const GREEN = "#34C759";
const ORANGE = "#FF9500";
const RED = "#FF3B30";
const BLUE = "var(--color-primary)";

// ═══════════════════════════════════════════════════════════════
//  Root
// ═══════════════════════════════════════════════════════════════

export function renderCheckIn(app) {
  const ui = checkinState(app);
  const session = loadSession(accountId(app));
  const phase = session?.phase || "idle";
  const mediaStatus = ui.mediaNotice ? `<div data-checkin-upload-status role="status" aria-live="polite" class="swiss-panel" style="position:sticky;bottom:16px;z-index:5;padding:16px;background:var(--color-surface)">${esc(ui.mediaNotice)}</div>` : "";

  if (ui.selectedRecordId) {
    const record = app.state.workspace.records.find((r) => r.id === ui.selectedRecordId);
    if (record) return renderRecordDetail(app, record);
    ui.selectedRecordId = null;
  }
  if(selectedProofTodo(app))return `<div class="tab-content col" style="gap:16px"><button class="outlined-btn" data-action="checkin.leaveProof">${tx('返回打卡','Back to check-in')}</button><h2>${tx('为指定记录补证','Supplement this record')}</h2><div class="swiss-panel">${proofSubmitPanel(app)}</div>${captureButtonsHtml(app,{allowVideo:true})}${draftListHtml(app)}${mediaStatus}</div>${liveCameraOverlayHtml(app)}${draftPreviewOverlayHtml(app)}`;

  const focused = phase === "active" || phase === "paused" || phase === "finished";
  let inner;
  if (ui.tab === "records" && !focused) {
    inner = renderRecordsTab(app);
  } else if (phase === "active" || phase === "paused") {
    inner = renderRunning(app, session, phase === "paused");
  } else if (phase === "finished") {
    inner = renderFinished(app, session);
  } else if (phase === "submitted") {
    inner = renderSubmitted(app, session);
  } else {
    inner = renderPreparation(app);
  }

  const header = focused ? "" : `
    <div class="headline-medium" style="color:var(--color-on-background)">${tx("运动打卡", "Exercise check-in")}</div>
    <div style="height:14px"></div>
    <div class="checkin-tabbar">
      <button class="checkin-tab pressable" aria-selected="${ui.tab === "exercise"}" data-action="checkin.tab" data-tab="exercise">${tx("运动", "Exercise")}</button>
      <button class="checkin-tab pressable" aria-selected="${ui.tab === "records"}" data-action="checkin.tab" data-tab="records">${tx("记录", "Records")}</button>
    </div>
    <div style="height:16px"></div>`;

  return `<div class="tab-content checkin-root">${header}${inner}${mediaStatus}</div>${liveCameraOverlayHtml(app)}${draftPreviewOverlayHtml(app)}`;
}

function liveCameraOverlayHtml(app) {
  const camera = checkinState(app).liveCamera;
  if (!camera?.mode) return "";
  const isVideo = camera.mode === "video";
  if (isVideo) return liveVideoCameraOverlayHtml(camera);

  const statusText = camera.status === "requesting"
    ? tx("正在申请相机权限…", "Requesting camera access…")
    : tx("实时相机画面", "Live camera preview");
  return `<div data-live-camera-overlay class="live-video-overlay">
    <section class="live-video-dialog" role="dialog" aria-modal="true" aria-label="${esc(tx("现场拍照", "Take live photo"))}">
      <video data-live-camera-video autoplay playsinline muted></video><div class="live-video-scrim" aria-hidden="true"></div>
      <header class="live-video-topbar"><strong class="live-video-title">${tx("打卡照片", "Check-in photo")}</strong><button class="live-video-close pressable" data-action="checkin.cameraClose" type="button" aria-label="${tx("关闭", "Close")}">${icon("close",28)}</button></header>
      <div class="live-video-info-card"><span data-live-camera-status>${statusText}</span></div>
      <div class="live-video-bottom"><div class="live-video-controls">
        <button class="live-video-action live-video-action-secondary pressable" data-action="checkin.cameraFlip" type="button" ${camera.status !== 'ready' ? 'disabled' : ''}>${tx('切换摄像头', 'Switch camera')}</button>
        <button class="live-video-action live-video-action-primary pressable" data-action="checkin.cameraTakePhoto" type="button" ${camera.status !== "ready" ? "disabled" : ""}>${icon("camera-alt",24)}<span>${tx("拍摄照片", "Take photo")}</span></button>
      </div></div>
    </section>
  </div>`;
}

function liveVideoCameraOverlayHtml(camera) {
  const recording = camera.status === "recording";
  const paused = camera.status === "paused";
  const saving = camera.status === "saving";
  const requesting = camera.status === "requesting";
  const remainingSeconds = liveCameraRemainingSeconds(camera);
  const phaseText = requesting
    ? tx("— 正在连接相机 —", "— Connecting camera —")
    : recording
      ? tx("— 正在录像 —", "— Recording —")
      : paused
        ? tx("— 已暂停 —", "— Paused —")
        : saving
          ? tx("— 正在保存 —", "— Saving —")
          : tx("— 准备就绪 —", "— Ready —");
  const controls = saving
    ? `<div class="live-video-saving">${spinner(24)}<span>${tx("正在保存视频，请稍候…", "Saving video. Please wait…")}</span></div>`
    : recording || paused
      ? `<button class="live-video-action ${paused ? "live-video-action-primary" : "live-video-action-secondary"} pressable" data-action="${paused ? "checkin.cameraResumeVideo" : "checkin.cameraPauseVideo"}" type="button" ${typeof camera.recorder?.pause !== "function" ? "disabled" : ""}>${icon(paused ? "play-arrow" : "pause", 23)}<span>${paused ? tx("继续录制", "Resume") : tx("暂停", "Pause")}</span></button>
         <button class="live-video-action ${paused ? "live-video-action-secondary" : "live-video-action-primary"} pressable" data-action="checkin.cameraStopVideo" type="button">${icon("stop", 21)}<span>${tx("结束", "Finish")}</span></button>
         <button class="live-video-retake pressable" data-action="checkin.cameraRetakeVideo" type="button" aria-label="${esc(tx("重拍", "Retake"))}"><span>${icon("refresh", 25)}</span><small>${tx("重拍", "Retake")}</small></button>`
      : `<button class="live-video-action live-video-action-secondary pressable" data-action="checkin.cameraFlip" type="button" ${camera.status !== 'ready' ? 'disabled' : ''}>${tx('切换摄像头', 'Switch camera')}</button><button class="live-video-action live-video-action-primary live-video-start pressable" data-action="checkin.cameraStartVideo" type="button" ${camera.status !== "ready" ? "disabled" : ""}>${icon("play-arrow", 24)}<span>${tx("开始录像", "Start recording")}</span></button>`;

  return `<div data-live-camera-overlay class="live-video-overlay">
    <section class="live-video-dialog" role="dialog" aria-modal="true" aria-label="${esc(tx("现场录像", "Record live video"))}">
      <video data-live-camera-video autoplay playsinline muted></video>
      <div class="live-video-scrim" aria-hidden="true"></div>
      <header class="live-video-topbar">
        <strong class="live-video-title">${tx(`打卡视频 · 最长 10 秒`, `Check-in video · 10s max`)}</strong>
        <button class="live-video-close pressable" data-action="checkin.cameraClose" type="button" aria-label="${esc(tx("取消录像", "Cancel video"))}" ${saving ? "disabled" : ""}>${icon("close", 28)}</button>
      </header>
      <div class="live-video-info-card">
        <strong data-live-camera-remaining>${saving ? tx("正在保存视频…", "Saving video…") : tx(`剩余 ${remainingSeconds} 秒`, `${remainingSeconds}s left`)}</strong>
        <span>${saving ? tx("正在完成文件处理，请稍候", "Finalizing the recording. Please wait.") : tx("暂停期间不计时 · 录像将包含声音", "Paused time is excluded · Audio is recorded")}</span>
      </div>
      <div class="live-video-bottom">
        <div data-live-camera-status class="live-video-phase">${phaseText}</div>
        <div class="live-video-controls">${controls}</div>
      </div>
    </section>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
//  #20 Preparation
// ═══════════════════════════════════════════════════════════════

function renderPreparation(app) {
  const ui = checkinState(app);
  const workspace = app.state.workspace;

  if (!app.hasActiveEnrollment()) {
    // [Android 当前实现] the no-course branch passes empty join callbacks:
    // the entry card is displayed but its buttons perform no navigation.
    return `<div class="col" style="gap:16px">
      ${sectionTitle(tx("加入体育课程", "Join a sports course"))}
      <div class="swiss-panel">
        <div class="title-large text-on-surface">${tx("加入体育课程", "Join a sports course")}</div>
        <div style="height:8px"></div>
        <div class="body-medium text-muted">${tx("扫码或输入邀请码加入本学期体育课", "Scan a QR code or enter an invitation code for this semester’s sports course.")}</div>
        <div style="height:20px"></div>
        <button class="primary-btn pressable" data-action="courses.scan">${icon("qr-code-scanner", 20)}<span>${tx("扫码加入课程", "Scan QR to Join Course")}</span></button>
        <div style="height:4px"></div>
        <button class="text-btn pressable" data-action="courses.enterCode" style="width:100%;min-height:48px">${icon("text-fields", 18)}<span class="label-large">${tx("输入邀请码", "Enter invitation code")}</span></button>
      </div>
      ${(app.state.workspace.proofTodos||[]).length ? `<div class="swiss-panel">${proofSubmitPanel(app)}</div>` : ""}
    </div>`;
  }

  const timeWindow = workspace.checkInTimeWindow;
  const readiness = evaluateReadiness(app);
  const blocked = readiness.blockedReason;
  const currentCourse = findCurrentCourse(workspace);
  const courseSport = currentCourse ? courseSportSelection(currentCourse.name) : null;
  const setup = ui.setup;
  const isCourse = setup.creditType === "course";
  const sportType = isCourse ? (courseSport?.sportType || "") : setup.generalSportType;
  const customSportName = isCourse ? (courseSport?.customSportName || "") : setup.generalCustomSportName;
  const detailsValid = isCourse
    ? !!courseSport
    : sportType !== OTHER || (customSportName.trim() !== "" && customSportName.length <= 32);
  const hasSubmittedToday = hasSubmittedCheckInToday(workspace);
  // This is display-only. The Backend remains authoritative for the
  // organization timezone, startedAt-derived businessDate and daily limit.
  const todayKey = businessToday();
  const todayHours = workspace.records
    .filter((r) => r.creditType !== "offset" && (r.businessDate || r.submittedAt || "").slice(0, 10) === todayKey)
    .reduce((sum, r) => sum + (Number(r.hours) || 0), 0);

  const sportOptions = isCourse
    ? (courseSport
        ? [{ value: courseSport.sportType, zh: courseSport.displayName, en: courseSport.displayName, icon: SPORT_OPTIONS.find((o) => o.value === courseSport.sportType)?.icon || "sport-other" }]
        : [])
    : SPORT_OPTIONS;

  return `<div class="checkin-prep">
    <div class="col" style="gap:20px;padding-bottom:104px">
      <div class="swiss-panel">
        <div class="row" style="align-items:flex-start">
          <div class="col grow">
            <div class="headline-small text-on-surface">${blocked === null ? tx("准备开始", "Ready to start") : tx("暂时无法开始", "Unable to start")}</div>
            <div style="height:5px"></div>
            <div class="body-medium text-muted">${blocked === null ? tx("选择运动项目，开始记录有效时长", "Choose an exercise to start recording active time.") : esc(blocked)}</div>
            <div style="height:8px"></div>
            <div style="height:12px"></div>
            ${creditPolicyChips(workspace.creditPolicy)}
            ${proofSubmitPanel(app)}
          </div>
          ${statusPill(blocked === null ? app.isApiMode() ? tx("待核验", "Pending check") : tx("可打卡", "Available") : tx("不可打卡", "Unavailable"), blocked === null ? GREEN : ORANGE)}
        </div>
        <div class="course-divider" style="margin:18px 0 14px"></div>
        <div class="row" style="gap:10px">
          <span class="text-primary" style="display:inline-flex;flex:none">${icon("timer", 20)}</span>
          <div class="col grow">
            <span class="body-medium text-on-surface" style="font-weight:500">${timeWindow.windowMode === "unavailable"
              ? tx("每日打卡时间暂不可用", "Daily check-in hours unavailable")
              : timeWindow.dailyStartTime === null && timeWindow.dailyEndTime === null
                ? tx("每日允许打卡：全天（北京时间）", "Daily check-in: all day (Beijing time)")
                : timeWindow.dailyStartTime && timeWindow.dailyEndTime
                  ? esc(tx(`每日允许打卡：${timeWindow.dailyStartTime}–${timeWindow.dailyEndTime}（北京时间）`, `Daily check-in: ${timeWindow.dailyStartTime}–${timeWindow.dailyEndTime} (Beijing time)`))
                  : tx("每日打卡时间暂不可用", "Daily check-in hours unavailable")}</span>
            ${app.isApiMode() ? `<span class="body-small text-muted">${tx("开始时核验课程开放时间及本人补练资格", "Course hours and your makeup authorization are checked when starting")}</span>` : ""}
            ${timeWindow.dateRangeStart || timeWindow.dateRangeEnd ? `<span class="body-small text-muted">${tx(`${timeWindow.dateRangeStart || ""} 至 ${timeWindow.dateRangeEnd || ""}`, `${timeWindow.dateRangeStart || ""} to ${timeWindow.dateRangeEnd || ""}`)}</span>` : ""}
          </div>
        </div>
        ${currentCourse ? `<div style="height:14px"></div>
        <div class="row" style="gap:10px;align-items:flex-start">
          <span class="checkin-course-dot"><span></span></span>
          <div class="col grow">
            <span class="body-medium text-on-surface" style="font-weight:500">${esc(currentCourse.name)}</span>
            ${currentCourse.teacher ? `<span class="body-small text-muted">${tx(`任课教师 ${currentCourse.teacher}`, `Instructor: ${currentCourse.teacher}`)}</span>` : ""}
          </div>
        </div>` : ""}
        ${timeWindow.excludedDates.length ? `<div style="height:12px"></div><span class="body-small text-muted">${tx(`排除日期：${timeWindow.excludedDates.slice(0, 3).join("、")}`, `Excluded dates: ${timeWindow.excludedDates.slice(0, 3).join(", ")}`)}${timeWindow.excludedDates.length > 3 ? tx(" 等", " etc.") : ""}</span>` : ""}
      </div>

      <div class="col" style="gap:10px">
        ${checkinSectionHeaderHtml(
          tx("本次运动", "This exercise"),
          tx("选择打卡类别与运动项目", "Choose a check-in category and exercise type"),
        )}
        <div class="swiss-panel" style="padding:16px">
          <div class="title-small text-on-surface">${tx("打卡类别", "Check-in category")}</div>
          <div style="height:10px"></div>
          <div class="row" style="gap:8px">
            <button class="category-btn pressable${isCourse ? " selected" : ""}" data-action="checkin.creditType" data-value="course">${tx("课程相关", "Course-related")}</button>
            <button class="category-btn pressable${!isCourse ? " selected" : ""}" data-action="checkin.creditType" data-value="general">${tx("自主运动", "Independent exercise")}</button>
          </div>
          <div class="course-divider" style="margin:18px 0 16px"></div>
          <div class="title-small text-on-surface">${isCourse ? tx("课程运动", "Course exercise") : tx("运动项目", "Exercise type")}</div>
          <div style="height:10px"></div>
          <div class="sport-grid">${sportOptions.map((option) => `<button class="sport-btn pressable${sportType === option.value ? " selected" : ""}" data-action="checkin.sport" data-value="${esc(option.value)}" type="button">
              <span class="sport-glyph">${icon(option.icon, 24)}</span>
              <span class="label-medium ellipsis">${esc(tx(option.zh, option.en))}</span>
            </button>`).join("")}</div>
          ${isCourse && currentCourse ? `<div style="height:10px"></div><span class="body-small text-muted">${tx(`已根据当前课程“${currentCourse.name}”自动选择`, `Automatically selected for the current course “${currentCourse.name}”.`)}</span>` : ""}
          ${!isCourse && sportType === OTHER ? `<div style="height:12px"></div>
            <div class="col custom-sport-card">
              ${fieldLabel({ id: "custom-sport", label: tx("具体运动名称", "Exercise name"), required: true })}
              <div class="custom-sport-control">
                <span aria-hidden="true">${icon("edit", 19)}</span>
                <input ${fieldControlAttrs({ id: "custom-sport", helper: tx("最多 32 个字符", "Up to 32 characters"), required: true })} maxlength="32" value="${esc(customSportName)}" data-input="checkin.customSport" placeholder="${tx("例如：瑜伽、轮滑", "For example: yoga or skating")}" />
              </div>
              ${fieldSupport({ id: "custom-sport", helper: tx(`${customSportName.length}/32，最多 32 个字符`, `${customSportName.length}/32, up to 32 characters`) }).replace("class=\"field-supporting\"", 'class="field-supporting" data-custom-sport-counter')}
            </div>` : ""}
        </div>
      </div>

      <div class="row" style="gap:10px;align-items:flex-start;padding:0 2px">
        <span class="text-muted" style="display:inline-flex;flex:none">${icon("camera-alt", 18)}</span>
        <span class="body-small text-muted">${tx("运动中可随时现场拍照或录像。凭证仅保存在本机，结束运动并确认后才会提交。", "You can take photos or videos while exercising. Proof stays on this device until you end the session and confirm submission.")}</span>
      </div>
    </div>
    ${app.isApiMode() && currentCourse ? `<button class="outlined-btn" data-action="checkin.historyOpen">${tx("补录历史运动", "Add past exercise")}</button>` : ""}
    <div class="start-exercise-bar">
      <div class="start-exercise-divider"></div>
      ${blocked ? `<div class="body-small text-muted" style="text-align:center;padding-top:8px">${esc(blocked)}</div>` : ""}
      <button class="checkin-cta pressable" data-action="checkin.start" ${detailsValid && blocked === null ? "" : "disabled"} style="margin-top:${blocked ? 8 : 12}px">
        ${icon("play-arrow", 24)}<span class="title-small">${detailsValid && blocked === null ? workspace.activeServerSession ? tx("恢复运动", "Restore exercise") : tx("开始运动", "Start exercise") : tx("当前不可开始", "Cannot start now")}</span>
      </button>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
//  #21 Running / paused
// ═══════════════════════════════════════════════════════════════

function swimEvidenceHtml(app) {
  const session = loadSession(accountId(app));
  if (selectedProofTodo(app) || !isRealtimeSwim(session)) return '';
  const ui = checkinState(app);
  return `<div class="swiss-panel col" style="gap:12px;margin-top:12px">
    <strong>${tx('游泳前后凭证', 'Swimming evidence')}</strong>
    <p class="body-small">${tx('请在下水前、出水后分别拍照，并按真实拍摄阶段标记。预受理后材料批次锁定，请保管原始文件并继续上传。请勿在更衣室拍摄。', 'Take photos before entering and after leaving the water, then label them truthfully. The accepted batch is locked; retain the original files. Do not photograph changing rooms.')}</p>
    ${ui.drafts.filter(d=>d.type==='image').map((d,i)=>`<label>${tx(`照片 ${i+1} 拍摄阶段`, `Photo ${i+1} stage`)}<select data-change="checkin.swimPhase" data-draft-id="${esc(d.id)}" ${ui.finish.submitting || d.swimLocked ? 'disabled' : ''}>
      ${[['','未标记','Not labelled'],['BEFORE','运动前','Before swimming'],['AFTER','运动后','After swimming'],['OTHER','其他','Other']].map(([v,zh,en])=>`<option value="${v}" ${d.swimPhase===v?'selected':''} ${v==='BEFORE'&&d.capturedAfterEnd?'disabled':''}>${tx(zh,en)}</option>`).join('')}</select></label>`).join('')}
    <label>${tx('延迟原因（如适用）', 'Delay reason (if applicable)')}<textarea maxlength="1000" data-change="checkin.swimDelay" ${ui.finish.submitting?'disabled':''}>${esc(session.swimDelayReason||'')}</textarea></label>
    <span class="body-small">${tx('结束后超过15分钟预受理或超过续传时限时，需填写真实原因，由教师审核；超过24小时无法提交。', 'A truthful reason is required for intake more than 15 minutes after finishing or late transfer, for teacher review. Submission closes after 24 hours.')}</span>
  </div>`;
}

function draftListHtml(app, { submissionRequired = false } = {}) {
  const ui = checkinState(app);
  const imageCount = ui.drafts.filter((draft) => draft.type === "image").length;
  const videoCount = ui.drafts.filter((draft) => draft.type === "video").length;
  const counts = `<div class="proof-counts" aria-label="${esc(tx("已拍摄凭证数量", "Captured proof count"))}">
    <span class="proof-count-pill">${tx(`照片 ${imageCount}/${MAX_IMAGES}`, `Photos ${imageCount}/${MAX_IMAGES}`)}</span>
    <span class="proof-count-pill">${tx(`视频 ${videoCount}/${MAX_VIDEOS}`, `Video ${videoCount}/${MAX_VIDEOS}`)}</span>
  </div>`;
  const header = `<div class="proof-list-header">
    <span class="title-small text-on-surface">${tx("已拍摄素材", "Captured media")}</span>
    ${counts}
  </div>`;
  const submissionNote = submissionRequired
    ? `<div class="body-small text-muted proof-submission-note">${tx("当前保留的照片和视频会全部作为本次打卡凭证提交。", "All retained photos and videos will be submitted as proof for this check-in.")}</div>`
    : "";
  if (!ui.drafts.length) {
    const emptyText = submissionRequired
      ? (isRealtimeSwim(loadSession(accountId(app))) ? tx("请提供运动前、运动后照片各至少一张。", "Provide at least one photo before and one after swimming.") : tx("请先现场拍摄至少 1 张照片或 1 个视频。", "Capture at least one on-site photo or video first."))
      : tx("拍摄完成后，照片和视频会立即显示在这里。", "Captured photos and videos will appear here immediately.");
    return `${header}<div class="proof-empty body-small text-muted">${icon("camera-alt", 20)}<span>${emptyText}</span></div>${submissionNote}${swimEvidenceHtml(app)}`;
  }
  return `${header}
    <div class="proof-card-strip">${ui.drafts
    .map(
      (draft) => {
        const locked = ui.finish.submitting || isRetainedEvidenceLocked(draft);
        const evidenceStatus = retainedEvidenceStatus(draft);
        const typeLabel = draft.type === "video" ? tx("现场视频", "On-site video") : tx("现场照片", "On-site photo");
        const badgeLabel = draft.type === "video" ? tx("视频", "Video") : tx("照片", "Photo");
        const statusLabel = evidenceStatus === "AVAILABLE" ? tx("已验证", "Verified") : evidenceStatus === "FAILED" ? tx("校验失败", "Verification failed") : evidenceStatus === "PROCESSING" ? tx("校验中", "Verifying") : tx("本机草稿", "Local draft");
        const media = draft.type === "image"
          ? `<img src="${esc(draft.url)}" alt="">`
          : `${draft.thumbnailUrl
            ? `<img class="proof-card-thumbnail" src="${esc(draft.thumbnailUrl)}" alt="">`
            : `<span class="proof-card-video-placeholder" aria-hidden="true">${icon("videocam", 32)}</span>`}${draft.normalizationPending ? "" : `<span class="proof-card-play">${icon("play-arrow", 24)}</span>`}`;
        return `<button class="proof-card pressable" type="button" data-action="checkin.previewDraft" data-draft-id="${esc(draft.id)}" aria-label="${esc(tx(`预览${typeLabel}，${statusLabel}${locked ? "，已锁定" : ""}`, `Preview ${typeLabel}, ${statusLabel}${locked ? ", locked" : ""}`))}">
          <span class="proof-card-media">${media}<span class="proof-card-type">${badgeLabel}</span></span>
          <span class="proof-card-copy">
            <span class="label-medium text-on-surface ellipsis">${draft.normalizationPending ? tx("视频待处理", "Video processing pending") : typeLabel}</span>
            <span class="body-small text-muted">${formatMediaSize(draft.byteCount)}${draft.durationSeconds ? ` · ${Math.ceil(draft.durationSeconds)}s` : ""}</span>
          </span>
        </button>`;
      }
    )
    .join("")}</div>
    <div class="body-small text-muted proof-preview-hint">${tx("点击某项凭证可预览；正式提交开始前，可以删除不合适的照片或视频。", "Open an evidence item to preview it. Before formal submission starts, you can delete an unsuitable photo or video.")}</div>
    ${submissionNote}${swimEvidenceHtml(app)}`;
}

function draftPreviewOverlayHtml(app) {
  const ui = checkinState(app);
  const draft = ui.drafts.find((item) => item.id === ui.previewDraftId);
  if (!draft) return "";
  const locked = ui.finish.submitting || isRetainedEvidenceLocked(draft);
  const typeLabel = draft.type === "video" ? tx("现场视频", "On-site video") : tx("现场照片", "On-site photo");
  const media = draft.normalizationPending
    ? `<div role="status">${ui.normalizingVideo ? tx("正在处理视频，请稍候…", "Processing video, please wait…") : tx("视频原件已保留，请重试格式处理。", "The original video is retained. Retry processing.")}${!ui.normalizingVideo ? `<button class="outlined-btn" data-action="checkin.retryVideo">${tx("重试视频处理", "Retry video processing")}</button>` : ""}</div>`
    : draft.type === "video"
    ? `<div class="proof-preview-video-wrap">
        <video data-proof-preview-video data-preview-id="${esc(draft.id)}" data-preview-source="${esc(draft.url)}" class="proof-preview-media" ${draft.thumbnailUrl ? `poster="${esc(draft.thumbnailUrl)}"` : ""} controls preload="auto" playsinline></video>
        <div class="body-small" data-proof-preview-video-status role="status"></div>
        <div class="proof-preview-video-error body-medium" data-proof-preview-video-error hidden>${tx("暂时无法播放，原件已保留。请尝试重新打开预览。", "Playback is unavailable. The original is retained. Try reopening the preview.")}</div>
      </div>`
    : `<img class="proof-preview-media" src="${esc(draft.url)}" alt="${esc(typeLabel)}">`;
  return `<div class="proof-preview-overlay" role="dialog" aria-modal="true" aria-label="${esc(tx("凭证预览", "Proof preview"))}">
    <div class="proof-preview-topbar">
      <button class="proof-preview-icon pressable" type="button" data-action="checkin.closeDraftPreview" aria-label="${esc(tx("关闭预览", "Close preview"))}">${icon("close", 24)}</button>
      <div class="col grow proof-preview-title"><span class="title-medium">${typeLabel}</span><span class="body-small">${formatMediaSize(draft.byteCount)}${draft.durationSeconds ? ` · ${Math.ceil(draft.durationSeconds)}s` : ""}</span></div>
      <button class="proof-preview-icon proof-preview-delete pressable" type="button" data-action="checkin.deleteDraft" data-draft-id="${esc(draft.id)}" aria-label="${esc(tx("删除该凭证", "Delete this proof"))}" ${locked ? "disabled" : ""}>${icon("delete", 23)}</button>
    </div>
    <div class="proof-preview-stage">${media}</div>
    <div class="proof-preview-caption body-small">${locked
      ? tx("该凭证已进入正式提交流程，当前不可删除。", "This proof has entered formal submission and can no longer be deleted.")
      : tx("如凭证不合适，可点击右上角删除；删除后可重新拍摄。", "If this proof is unsuitable, delete it from the top right and capture another.")}</div>
  </div>`;
}

export function attachDraftVideoPreview(app) {
  const video = app._viewport?.querySelector("[data-proof-preview-video]");
  if (!video) return;
  const draft=checkinState(app).drafts.find(d=>d.id===video.dataset.previewId);
  if(!draft?.blob||draft.normalizationPending)return;
  void mountLocalVideoPlayer(video,draft.blob,state=>{
    if(!video.isConnected)return;
    const error=app._viewport?.querySelector('[data-proof-preview-video-error]');
    const status=app._viewport?.querySelector('[data-proof-preview-video-status]');
    if(error)error.hidden=state!=='error';
    if(status)status.textContent=state==='loading'?tx('正在载入本机视频…','Loading local video…'):'';
  });
}

/** Confirmed/bound Session evidence is append-only for final submission. */
export function isRetainedEvidenceLocked(draft) {
  return Boolean(
    draft?.mediaId ||
    draft?.pendingUpload?.confirmed ||
    draft?.pendingUpload?.bound
  );
}

export function retainedEvidenceStatus(draft) {
  if (draft?.mediaId) return "AVAILABLE";
  if (draft?.processingFailure || draft?.pendingUpload?.verificationStatus === "FAILED") return "FAILED";
  if (draft?.pendingUpload?.confirmed || draft?.pendingUpload?.bound) return "PROCESSING";
  return "LOCAL_DRAFT";
}

function captureButtonsHtml(app, { allowVideo }) {
  const ui = checkinState(app);
  const imageCount = ui.drafts.filter((d) => d.type === "image").length;
  const videoCount = ui.drafts.filter((d) => d.type === "video").length;
  const batchLocked = false;
  const photoLimit = batchLocked || imageCount >= MAX_IMAGES;
  const videoLimit = batchLocked || videoCount >= MAX_VIDEOS;
  let limitNote = "";
  if (batchLocked) {
    limitNote = tx('游泳材料已锁定，请使用现有文件继续提交。', 'Swimming evidence is locked. Continue with the retained files.');
  } else if (photoLimit && allowVideo && videoLimit) {
    limitNote = tx("照片和视频均已达到本次运动的凭证上限；可点击凭证预览并在提交前删除。", "Photo and video evidence limits are reached; open an item to preview or delete it before submission.");
  } else if (photoLimit) {
    limitNote = tx(`照片已达到 ${MAX_IMAGES} 张上限；可点击照片并在提交前删除。`, `The ${MAX_IMAGES}-photo limit is reached; open a photo to delete it before submission.`);
  } else if (allowVideo && videoLimit) {
    limitNote = tx(`视频已达到 ${MAX_VIDEOS} 个上限；可点击视频并在提交前删除。`, `The ${MAX_VIDEOS}-video limit is reached; open the video to delete it before submission.`);
  }
  return `
    ${ui.captureError ? validationPanel(ui.captureError) : ""}
    ${ui.normalizingVideo ? `<div role="status">${tx("正在处理视频，请稍候…", "Processing video, please wait…")}</div>` : ui.drafts.some(d=>d.normalizationPending) ? `<button class="outlined-btn" data-action="checkin.retryVideo">${tx("重试视频处理", "Retry video processing")}</button>` : ""}
    ${!selectedProofTodo(app)&&loadSession(accountId(app))?.recordOrigin === 'HISTORICAL' ? `<label class="capture-btn" style="width:100%;min-height:48px;box-sizing:border-box"><span>${tx("选择历史运动凭证", "Choose past exercise evidence")}</span><input style="display:none" type="file" accept="image/*,video/*" multiple data-change="checkin.historyFiles" /></label>` : ""}
    <div class="row" style="gap:10px">
      <button class="capture-btn pressable" data-action="checkin.capturePhoto" ${photoLimit ? "disabled" : ""}>${icon("camera-alt", 20)}<span>${tx("现场拍照", "Take photo")}</span></button>
      ${allowVideo ? `<button class="capture-btn pressable" data-action="checkin.captureVideo" ${videoLimit ? "disabled" : ""}>${icon("videocam", 20)}<span>${tx("现场录像", "Record video")}</span></button>` : ""}
    </div>
    ${allowVideo ? `<p class="body-small text-muted" style="margin:8px 0 0">${tx("视频请保留声音，单段最长 10 秒。", "Keep audio enabled. Each video can be up to 10 seconds long.")}</p>` : ""}
    ${limitNote ? `<div class="body-small" style="color:${ORANGE};margin-top:8px">${esc(limitNote)}</div>` : ""}`;
}

function renderRunning(app, session, paused) {
  const ui = checkinState(app);
  const duration = sessionDurationMs(session);
  const details = session.details;
  return `<div class="col" style="gap:0;padding-bottom:24px">
    <div class="row">
      <span class="sport-glyph">${icon(sportIconName(details.sportType), 24)}</span>
      <span style="width:10px"></span>
      <div class="col grow">
        <span class="headline-small text-on-surface">${esc(sportLabel(details))}</span>
        <span class="body-small text-muted">${creditTypeLabel(details.creditType)}</span>
      </div>
      ${statusPill(paused ? tx("已暂停", "Paused") : tx("记录中", "Recording"), paused ? ORANGE : GREEN)}
    </div>
    <div style="height:18px"></div>
    <div class="swiss-panel" style="padding:28px 18px;display:flex;flex-direction:column;align-items:center">
      <span class="text-primary" style="display:inline-flex">${icon("timer", 24)}</span>
      <div style="height:12px"></div>
      <span class="timer-value" data-timer-value>${formatTimer(duration)}</span>
      <span class="body-medium text-muted">${paused ? tx("计时已暂停", "Timer paused") : tx("有效运动时长", "Active exercise time")}</span>
      <div class="course-divider" style="margin:24px 0 18px;width:100%"></div>
      <div class="row" style="width:100%">
        <div class="col grow" style="align-items:center"><span class="session-metric-value">${formatTimeOnly(session.startedAt)}</span><span class="label-medium text-muted" style="margin-top:4px">${tx("开始", "Started")}</span></div>
        <div class="col grow" style="align-items:center"><span class="session-metric-value" data-timer-hours>${estimatedCreditedHours(app,duration)}h</span><span class="label-medium text-muted" style="margin-top:4px">${tx("预计学时", "Expected hours")}</span></div>
        <div class="col grow" style="align-items:center"><span class="session-metric-value">${ui.drafts.length}</span><span class="label-medium text-muted" style="margin-top:4px">${tx("现场凭证", "On-site proof")}</span></div>
      </div>
    </div>
    <div style="height:14px"></div>
    <div class="swiss-panel" style="padding:16px">
      <div class="row">
        <div class="col grow">
          <span class="title-medium text-on-surface">${tx("现场凭证", "On-site proof")}</span>
          <span class="body-small text-muted">${tx("仅保存在本机，结束后再确认提交", "Saved only on this device until you confirm submission after ending.")}</span>
        </div>
      </div>
      <div style="height:14px"></div>
      ${captureButtonsHtml(app, { allowVideo: true })}
      <div style="height:14px"></div>
      ${draftListHtml(app)}
    </div>
    <div style="height:20px"></div>
    ${paused
      ? `<button class="checkin-cta pressable" data-action="checkin.resume" ${ui.sessionTransitioning ? "disabled" : ""}>${icon("play-arrow", 24)}<span>${tx("继续运动", "Continue exercise")}</span></button>`
      : `<button class="checkin-cta pressable" data-action="checkin.pause" ${ui.sessionTransitioning ? "disabled" : ""}>${icon("pause", 24)}<span>${tx("暂停运动", "Pause exercise")}</span></button>`}
    <div style="height:10px"></div>
    <button class="checkin-end-btn pressable" data-action="checkin.requestFinish" ${ui.sessionTransitioning ? "disabled" : ""}>${ui.sessionTransitioning ? spinner(18) : icon("stop", 20)}<span>${ui.sessionTransitioning ? tx("正在同步运动状态…", "Synchronizing exercise state…") : tx("结束运动", "End exercise")}</span></button>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
//  #22 Finished — complete and submit
// ═══════════════════════════════════════════════════════════════

function summaryRow(label, value) {
  return `<div class="row" style="padding:4px 0">
    <span class="body-medium text-muted">${esc(label)}</span>
    <span class="grow"></span>
    <span class="body-medium text-on-surface" style="font-weight:500;text-align:right">${esc(value)}</span>
  </div>`;
}

function checkinSectionHeaderHtml(title, supportingText) {
  return `<div class="checkin-section-header">
    <span class="title-large text-on-surface">${esc(title)}</span>
    <span class="body-small text-muted">${esc(supportingText)}</span>
  </div>`;
}

function renderFinished(app, session) {
  const ui = checkinState(app);
  const details = session.details;
  const credited = estimatedCreditedHours(app,session.activeDurationMillis);
  if (credited === 0) return `<div class="col" style="gap:16px;padding-bottom:28px">
    <span class="headline-medium text-on-surface">${tx("本次运动已结束", "Exercise ended")}</span>
    <div class="swiss-panel"><span class="display-small">${formatTimer(session.activeDurationMillis)}</span>
      <p>${tx("运动时长未达到课程最低要求，本次不会生成打卡记录，也不会送交教师审核。", "The duration is below the course minimum. No check-in record or teacher review will be created.")}</p></div>
    ${draftListHtml(app)}
    <button class="checkin-cta pressable" data-action="checkin.returnHome">${tx("返回打卡", "Back to check-in")}</button>
  </div>`;
  const retainedImages = ui.drafts.filter((d) => d.type === "image").length;
  const retainedVideos = ui.drafts.filter((d) => d.type === "video").length;
  return `<div class="col" style="gap:16px;padding-bottom:28px">
    <div class="col">
      <span class="headline-medium text-on-surface">${session.recordOrigin === "HISTORICAL" ? tx("历史补录", "Past exercise entry") : tx("完成记录", "Complete record")}</span>
      <div style="height:4px"></div>
      <span class="body-medium text-muted">${session.recordOrigin === "HISTORICAL" ? esc(tx(`运动日期：${formatDateOnly(session.startedAt)}，上传凭证后由教师审核`, `Exercise date: ${formatDateOnly(session.startedAt)}. Teacher review is required.`)) : tx("补充说明、确认现场凭证并提交", "Add notes, confirm on-site proof, and submit")}</span>
    </div>
    <div class="swiss-panel">
      <span class="display-small text-on-surface">${formatTimer(session.activeDurationMillis)}</span>
      <div style="height:8px"></div>
      <span class="body-large text-on-surface">${tx(`有效运动时长 · 预计 ${credited} 小时，计入结果以审核为准`, `Active exercise time · estimated ${credited} hours, subject to review`)}</span>
      <div style="height:6px"></div>
      <span class="body-large text-muted">${creditTypeLabel(details.creditType)} · ${esc(sportLabel(details))}</span>
    </div>
    <div class="swiss-panel" style="padding:16px">
      ${fieldLabel({ id: "checkin-description", label: tx("运动说明", "Exercise description"), required: true })}
      <div style="height:8px"></div>
      <textarea ${fieldControlAttrs({ id: "checkin-description", helper: tx(`运动说明不能为空，最多 ${MAX_DESCRIPTION} 字`, `Exercise description is required and must be at most ${MAX_DESCRIPTION} characters.`), required: true })} class="text-field" rows="3" maxlength="${MAX_DESCRIPTION}" placeholder="${tx("请填写本次运动内容", "Describe this exercise")}" data-input="checkin.description" required>${esc(details.description || "")}</textarea>
      ${fieldSupport({ id: "checkin-description", helper: `${tx(`已输入 ${(details.description || "").length}/${MAX_DESCRIPTION}`, `${(details.description || "").length}/${MAX_DESCRIPTION} entered`)} · ${tx(`运动说明不能为空，最多 ${MAX_DESCRIPTION} 字`, `Exercise description is required and must be at most ${MAX_DESCRIPTION} characters.`)}` }).replace("class=\"field-supporting\"", 'class="field-supporting" data-description-counter')}
    </div>
    <div class="swiss-panel" style="padding:16px">
      <span class="title-medium text-on-surface">${session.recordOrigin === "HISTORICAL" ? tx("历史运动凭证", "Past exercise evidence") : tx("现场补拍", "Capture more proof")}</span>
      <div style="height:8px"></div>
      <span class="body-small text-muted">${session.recordOrigin === "HISTORICAL" ? tx("请选择能证明所填日期运动的照片或视频，等待教师审核。", "Choose evidence of exercise on the declared date for teacher review.") : tx("运动结束后仍可调用相机补拍照片或最长 10 秒的有声视频。", "After exercise, use the camera for photos or a video with audio up to 10 seconds.")}</span>
      <div style="height:12px"></div>
      ${captureButtonsHtml(app, { allowVideo: true })}
      <div class="course-divider" style="margin:18px 0 16px"></div>
      <span class="title-medium text-on-surface">${tx("本次打卡凭证", "Check-in proof")}</span>
      <span class="body-small text-muted">${isRealtimeSwim(session) ? tx("运动前后照片各至少 1 张，当前保留素材会全部提交", "At least one before and one after photo; all retained media will be submitted") : tx("至少拍摄 1 项，当前保留素材会全部提交", "Capture at least one item; all retained media will be submitted")}</span>
      <div style="height:10px"></div>
      ${draftListHtml(app, { submissionRequired: true })}
    </div>
    <span class="body-small text-muted">${tx(`最多 ${MAX_IMAGES} 张照片和 ${MAX_VIDEOS} 个视频`, `Up to ${MAX_IMAGES} photos and ${MAX_VIDEOS} video`)}</span>
    ${checkinSectionHeaderHtml(tx("提交确认", "Confirm submission"), tx("请核对以下信息", "Review the following information"))}
    <div class="swiss-panel" style="padding:16px">
      <div class="col" style="gap:8px">
        ${summaryRow(tx("打卡类别", "Check-in category"), creditTypeLabel(details.creditType))}
        ${summaryRow(tx("运动项目", "Exercise type"), sportLabel(details))}
        ${summaryRow(tx("开始时间", "Start time"), formatDateTime(session.startedAt))}
        ${summaryRow(tx("结束时间", "End time"), formatDateTime(session.endedAt))}
        ${summaryRow(tx("实际运动时长", "Active duration"), formatTimer(session.activeDurationMillis))}
        ${summaryRow(tx("计入时长", "Credited time"), tx(`${credited} 小时`, `${credited} hours`))}
        ${summaryRow(tx("打卡日期", "Check-in date"), formatDateOnly(session.startedAt))}
        ${summaryRow(tx("凭证数量", "Proof count"), tx(`${retainedImages} 张照片`, `${retainedImages} photos`) + (retainedVideos > 0 ? tx(` + ${retainedVideos} 个视频`, ` + ${retainedVideos} videos`) : ""))}
      </div>
    </div>
    <div class="col">
      <button class="checkin-cta pressable" data-action="checkin.submit" ${!ui.finish.submitting && app.isWriteAllowed() ? "" : "disabled"}>
        ${ui.finish.submitting ? `${spinner(18, "on-primary")}<span style="width:8px"></span>` : ""}
        <span>${ui.finish.submitting ? tx("提交中…", "Submitting…") : tx("提交打卡", "Submit check-in")}</span>
      </button>
      <button class="text-btn pressable" data-action="checkin.abandon" ${ui.finish.submitting ? "disabled" : ""} style="width:100%"><span style="color:${RED}">${tx("放弃本次记录", "Discard this record")}</span></button>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
//  #23 Submitted
// ═══════════════════════════════════════════════════════════════

function renderSubmitted(app, session) {
  const summary = session.summary;
  const creditedSummary = tx("记录已提交，审核状态与计入时长请查看打卡记录。", "Record submitted. View check-in records for review status and credited time.");
  return `<div class="col" style="gap:18px;padding:18px 0 28px">
    <div class="col" style="align-items:center;padding:10px 0">
      <span class="submit-success-circle">${icon("check-circle", 34)}</span>
      <div style="height:16px"></div>
      <span class="headline-medium" style="color:var(--color-on-background)">${tx("提交成功", "Submitted")}</span>
      <div style="height:6px"></div>
      <span class="body-medium text-muted">${creditedSummary}</span>
    </div>
    <div class="swiss-panel" style="padding:16px">
      <div class="col" style="gap:8px">
        ${summaryRow(tx("打卡日期", "Check-in date"), summary.date)}
        ${summaryRow(tx("开始时间", "Start time"), summary.startTime)}
        ${summaryRow(tx("结束时间", "End time"), summary.endTime)}
        ${summaryRow(tx("运动时长", "Exercise duration"), summary.duration)}
        ${summaryRow(tx("打卡类别", "Check-in category"), summary.creditType)}
        ${summaryRow(tx("运动项目", "Exercise type"), summary.sportType)}
        ${summaryRow(tx("凭证数量", "Proof count"), tx(`${summary.proofCount} 个`, `${summary.proofCount} items`))}
      </div>
    </div>
    <div class="col">
      <button class="checkin-cta pressable" data-action="checkin.viewRecords">${tx("查看打卡记录", "View check-in records")}</button>
      <button class="text-btn pressable" data-action="checkin.returnHome" style="width:100%">${tx("返回运动首页", "Back to exercise home")}</button>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
//  Records tab (#20 records) and record detail (#24)
// ═══════════════════════════════════════════════════════════════

export function creditedMinuteText(hours) {
  const minutes = Math.round(Math.max(0, Number(hours) || 0) * 60);
  return tx(`${minutes} 分钟`, `${minutes} min`);
}

const recordSportName = (record) => {
  const value = (record.sportType || "").trim();
  if (!value) {
    return ["", "运动打卡", "Exercise check-in"].includes(record.taskTitle.trim()) ? tx("运动打卡", "Exercise check-in") : record.taskTitle;
  }
  const map = {
    running: ["跑步", "Running"], 跑步: ["跑步", "Running"],
    basketball: ["篮球", "Basketball"], 篮球: ["篮球", "Basketball"],
    football: ["足球", "Football"], 足球: ["足球", "Football"],
    badminton: ["羽毛球", "Badminton"], 羽毛球: ["羽毛球", "Badminton"],
    table_tennis: ["乒乓球", "Table tennis"], 乒乓球: ["乒乓球", "Table tennis"],
    swimming: ["游泳", "Swimming"], 游泳: ["游泳", "Swimming"],
    fitness: ["健身", "Fitness"], 健身: ["健身", "Fitness"],
    cycling: ["骑行", "Cycling"], 骑行: ["骑行", "Cycling"],
    yoga: ["瑜伽", "Yoga"], 瑜伽: ["瑜伽", "Yoga"],
  };
  const match = map[value.toLowerCase()] || map[value];
  return match ? tx(match[0], match[1]) : value;
};

function proofSummaryText(record) {
  if (record.proofPhotoCount === 0 && record.proofVideoCount === 0) return record.proofSummary;
  const parts = [];
  if (record.proofPhotoCount > 0) parts.push(tx(`${record.proofPhotoCount} 张图片`, `${record.proofPhotoCount} ${record.proofPhotoCount === 1 ? "photo" : "photos"}`));
  if (record.proofVideoCount > 0) parts.push(tx(`${record.proofVideoCount} 个短视频`, `${record.proofVideoCount} ${record.proofVideoCount === 1 ? "video" : "videos"}`));
  return parts.join(tx("，", ", "));
}

function renderRecordsTab(app) {
  const records = app.state.workspace.records.filter((r) => r.creditType !== "offset");
  // Same rule as the dashboard progress: rejected records are listed but do
  // not add hours, so the two screens can never show different totals.
  const totalHours = records
    .filter((r) => r.reviewResult === "VALID")
    .reduce((sum, r) => sum + (Number(r.hours) || 0), 0);
  const intro = `<div class="col" style="gap:18px">
    <div class="col" style="gap:6px">
      ${sectionTitle(tx("打卡记录", "Check-in records"))}
      <span class="body-medium text-muted">${tx("查看每次运动的计入分钟与记录详情", "View the credited minutes and details of every exercise.")}</span>
    </div>
    ${records.length ? `<div class="swiss-panel" style="padding:18px 20px">
      <div class="row">
        <div class="col grow" style="gap:3px">
          <span class="label-medium text-muted">${tx("计入时长", "Credited time")}</span>
          <span class="headline-medium text-on-surface">${creditedMinuteText(totalHours)}</span>
        </div>
        <div class="col" style="align-items:flex-end;gap:4px">
          <span class="body-medium text-on-surface" style="font-weight:500">${tx(`共 ${records.length} 条记录`, `${records.length} records`)}</span>
          <span class="body-small text-muted">${tx("运动记录汇总", "Exercise record summary")}</span>
        </div>
      </div>
    </div>` : ""}
  </div>`;

  const cards = records
    .map((record) => {
      const course = record.courseId ? app.state.workspace.courses.find((c) => c.id === record.courseId) : null;
      const courseName = course?.name || tx("自主运动", "Independent exercise");
      return `<button class="course-card pressable" data-action="checkin.openRecord" data-record-id="${esc(record.id)}" style="text-align:left">
        <div class="row" style="align-items:flex-start;gap:10px">
          <span class="sport-glyph compact">${icon(sportIconName(record.sportCode || record.sportType), 20)}</span>
          <div class="col grow" style="gap:4px;min-width:0">
            <span class="title-large text-on-surface ellipsis">${esc(recordSportName(record))}</span>
            <span class="body-small text-muted">${esc(record.submittedAt.split(" ")[0] || tx("未提供", "Not available"))}</span>
          </div>
        </div>
        <div class="row">
          <span class="title-medium text-on-surface">${creditedMinuteText(record.hours)}</span>
          <span style="width:6px"></span>
          <span class="body-small text-muted">${creditLabel(record)}</span>
          <span class="grow"></span>
          ${statusBadge(reviewStatusText(record))}<span style="width:8px"></span>
          <span class="label-medium text-muted">${creditTypeLabel(record.creditType)}</span>
        </div>
        <div class="course-divider"></div>
        <div class="row">
          <div class="col grow" style="gap:7px;min-width:0">
            <span class="row" style="gap:8px"><span class="text-muted" style="display:inline-flex">${icon("school", 17)}</span><span class="body-small text-muted ellipsis">${esc(courseName)}</span></span>
            <span class="row" style="gap:8px"><span class="text-muted" style="display:inline-flex">${icon("attach-file", 17)}</span><span class="body-small text-muted ellipsis">${esc(proofSummaryText(record))}</span></span>
          </div>
          <span style="width:12px"></span>
          <span class="text-muted" style="display:inline-flex">${icon("chevron-right", 20)}</span>
        </div>
      </button>`;
    })
    .join("");

  return `<div class="col" style="gap:14px;padding-bottom:28px">
    ${intro}
    ${records.length === 0
      ? emptyPlaceholder(tx("暂无记录", "No records"), tx("当前账号还没有可展示的打卡记录。", "There are no check-in records to show for this account."))
      : `<div class="row" style="padding-top:2px">
          <span class="title-medium text-on-surface grow">${tx("全部记录", "All records")}</span>
          <span class="label-medium text-muted">${tx(`${records.length} 条`, `${records.length} records`)}</span>
        </div>${cards}`}
  </div>`;
}

function proofDisplayName(proof) {
  const generated = /^media:/.test(proof.source || "")
    ? /^(?:运动照片|运动视频|Exercise photo|Exercise video) (\d+)$/.exec(proof.fileName || "")
    : null;
  if (!generated) return proof.fileName || tx("媒体文件", "Media file");
  return proof.type === "video"
    ? tx(`运动视频 ${generated[1]}`, `Exercise video ${generated[1]}`)
    : tx(`运动照片 ${generated[1]}`, `Exercise photo ${generated[1]}`);
}

function mediaThumb(proof, aspect = "16/9") {
  const source = proof.previewSource || proof.source;
  const displayable = /^(https?:\/\/|content:\/\/|file:\/\/|blob:|data:|\/)/.test(source || "");
  const thumbnailSource = proof.type === "video" ? proof.thumbnailUrl : source;
  const thumbnailDisplayable = /^(https?:\/\/|content:\/\/|file:\/\/|blob:|data:|\/)/.test(thumbnailSource || "");
  const inner = (proof.type === "image" ? displayable : thumbnailDisplayable)
    ? `<img src="${esc(thumbnailSource)}" alt="${esc(proofDisplayName(proof))}" style="width:100%;height:100%;object-fit:cover">`
    : proof.type === "video" && displayable
    ? `<video src="${esc(source)}#t=0.001" muted playsinline preload="metadata" aria-label="${esc(proofDisplayName(proof))}" style="width:100%;height:100%;object-fit:cover;pointer-events:none"></video>`
    : `<div class="col" style="align-items:center;justify-content:center;height:100%;gap:6px">
        ${icon(proof.type === "video" ? "videocam" : "photo", 28)}
        <span class="label-small" style="max-width:90%;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(proofDisplayName(proof))}</span>
      </div>`;
  const videoOverlay = proof.type === "video"
    ? `<span class="media-play-overlay">${icon("play-arrow", 30)}</span><span class="media-video-tag">${tx("视频", "Video")}</span>`
    : "";
  return `<div class="media-thumb" style="aspect-ratio:${aspect}">${inner}${videoOverlay}</div>`;
}

function detailInfoRow(iconName, label, value, last = false) {
  return `<div class="row" style="align-items:flex-start;padding:9px 0">
      <span class="text-muted" style="display:inline-flex;flex:none">${icon(iconName, 18)}</span>
      <span style="width:10px"></span>
      <span class="body-medium text-muted" style="width:68px;flex:none">${esc(label)}</span>
      <span class="body-medium text-on-surface grow" style="font-weight:500">${esc(value)}</span>
    </div>${last ? "" : `<div class="course-divider"></div>`}`;
}

// current API: a submitted record is VALID immediately, and the only later
// teacher action is appending INVALID. The student therefore has to be able to
// see that verdict — it is the sole reason credited hours can drop.
// A record keeps its creditedDurationSeconds after a teacher appends INVALID —
// 2.0.13 has no mechanism to zero it (creditedDurationOverrideSeconds is blocked
// until ADR-047), the hours stop counting through the score ledger instead. So
// the number is real, but calling it "credited" on a rejected record would
// contradict the total right above it, which excludes exactly those records.
function creditLabel(record) {
  return record.reviewResult === "INVALID"
    ? tx("未计入学时", "Not credited")
    : tx("计入时长", "Credited time");
}

function reviewStatusText(record) {
  return reviewStageLabel(reviewStageFromRecord(record), getLanguage() === "en");
}

function renderPublicReasonPanel(record) {
  const model = resolvePublicReasonModel(record);
  let publicNote = model.publicNote;
  // Server mappings retain the original comment separately from generated copy.
  // Recompute only system copy when the user changes language in this session.
  if (Object.prototype.hasOwnProperty.call(record, "reviewPublicComment")) {
    if (record.reviewPublicComment) publicNote = record.reviewPublicComment;
    else if (model.reason) publicNote = tx(model.reason.zh, model.reason.en);
    else if (record.reviewResult === "VALID") publicNote = Number(record.hours) > 0
      ? tx("记录有效，已计入运动时长。", "Record valid; hours credited.")
      : tx("记录有效，当前未计入考核进度。", "Record valid; currently not credited toward the target.");
    else if (record.reviewResult === "INVALID") publicNote = tx("记录未通过审核。", "Record was rejected.");
    else if (record.workflowStage === "AWAITING_SUPPLEMENT") publicNote = tx("等待补充材料。", "Supplementary evidence required.");
    else if (record.workflowStage === "TECHNICAL") publicNote = tx("材料技术处理中。", "Evidence is being processed.");
    else if (record.reviewResult || record.serverStatus === "SUBMITTED") publicNote = tx("材料已受理，等待审核。", "Evidence received; awaiting review.");
    else publicNote = tx("记录缺少有效审核状态。", "The record has no valid review state.");
  }
  if (!publicNote) return "";
  return `<div class="swiss-panel" data-testid="reviewReason.card">
    <div class="label-medium text-muted">${tx("公开说明", "Public note")}</div>
    <div class="body-medium text-on-surface" style="margin-top:4px">${esc(publicNote)}</div>
  </div>`;
}

function recordDetailTime(value) {
  if (!value) return tx("未提供", "Not available");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(currentLocale(), { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function durationDetail(record) {
  const total = record.actualDurationSeconds;
  if (total === null || total === undefined) return tx("未提供", "Not available");
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  let out = "";
  if (hours > 0) out += tx(`${hours}小时`, `${hours}h`);
  if (minutes > 0 || (hours === 0 && seconds === 0)) out += tx(`${minutes}分钟`, `${minutes}m`);
  if (seconds > 0) out += tx(`${seconds}秒`, `${seconds}s`);
  return out;
}

function renderRecordDetail(app, record) {
  const ui = checkinState(app);
  const proofLoading = ui.recordProofLoadingId === record.id;
  const course = record.courseId ? app.state.workspace.courses.find((c) => c.id === record.courseId) : null;
  const courseName = course?.name || tx("自主运动", "Independent exercise");
  const taskTitle = ["", "运动打卡", "Exercise check-in"].includes(record.taskTitle.trim()) ? tx("运动打卡", "Exercise check-in") : record.taskTitle;
  return `<div class="tab-content col" style="gap:14px">
    <button class="row pressable" data-action="checkin.recordBack" style="height:52px;width:100%">
      <span class="text-primary" style="display:inline-flex">${icon("chevron-left", 28)}</span>
      <span style="width:8px"></span>
      <span class="title-medium text-on-surface">${tx("打卡详情", "Check-in details")}</span>
    </button>
    <div class="swiss-panel" style="padding:20px">
      <div class="row"><span class="grow"></span><span class="body-small text-muted">${esc(record.submittedAt.split(" ")[0])}</span></div>
      <div style="height:18px"></div>
      <span class="headline-small text-on-surface">${esc(recordSportName(record))}</span>
      <div style="height:4px"></div>
      <span class="body-medium text-muted">${esc(taskTitle)}</span>
      <div class="course-divider" style="margin:20px 0 16px"></div>
      <span class="headline-medium text-on-surface">${creditedMinuteText(record.hours)}</span>
      <span class="label-medium text-muted">${creditLabel(record)}</span>
    </div>
    <div class="row" style="padding-top:8px"><span class="title-medium text-on-surface grow">${tx("记录信息", "Record information")}</span></div>
    <div class="swiss-panel" style="padding:6px 18px">
      ${detailInfoRow("info-outline", tx("审核状态", "Review status"), reviewStatusText(record))}
      ${detailInfoRow("timer", tx("提交时间", "Submitted"), record.submittedAt)}
      ${detailInfoRow("timer", tx("开始时间", "Started"), recordDetailTime(record.startTime))}
      ${detailInfoRow("timer", tx("结束时间", "Ended"), recordDetailTime(record.endTime))}
      ${detailInfoRow("timer", tx("实际运动时长", "Active duration"), durationDetail(record))}
      ${detailInfoRow("school", tx("关联课程", "Course"), courseName)}
      ${detailInfoRow("info-outline", tx("打卡类别", "Check-in category"), creditTypeLabel(record.creditType))}
      ${detailInfoRow("attach-file", tx("凭证", "Proof"), proofSummaryText(record), true)}
    </div>
    ${renderPublicReasonPanel(record)}
    ${record.note ? `
      <div class="row" style="padding-top:8px"><span class="title-medium text-on-surface grow">${tx("运动说明", "Exercise notes")}</span></div>
      <div class="swiss-panel"><span class="body-medium text-on-surface">${esc(record.note)}</span></div>` : ""}
    ${record.remark ? `
      <div class="row" style="padding-top:8px"><span class="title-medium text-on-surface grow">${tx("补充备注", "Additional note")}</span></div>
      <div class="swiss-panel"><span class="body-medium text-on-surface">${esc(record.remark)}</span></div>` : ""}
    ${ui.recordOpenError ? (typeof ui.recordOpenError === "string" ? validationPanel(ui.recordOpenError) : userFacingErrorPanel(ui.recordOpenError, { compact: true })) : ""}
    <div class="row" style="padding-top:8px">
      <span class="title-medium text-on-surface grow">${tx("照片与视频", "Photos & videos")}</span>
      <span class="label-medium text-muted">${proofLoading ? tx("加载中", "Loading") : tx(`${record.proofFiles.length} 个`, `${record.proofFiles.length} items`)}</span>
    </div>
    ${proofLoading
      ? `<div class="swiss-panel row" style="justify-content:center;padding:22px;gap:10px">${spinner()}<span class="body-medium text-muted">${tx("正在读取服务端凭证…", "Loading server evidence…")}</span></div>`
      : record.proofFiles.length === 0
      ? emptyPlaceholder(tx("暂无照片或视频", "No photos or videos"), tx("这条记录没有可展示的媒体文件。", "This record has no media files to display."))
      : record.proofFiles
          .map(
            (proof) => `<button class="course-card pressable" data-action="checkin.openProof" data-source="${esc(proof.source)}" data-type="${proof.type}" style="padding:0;overflow:hidden;gap:0;text-align:left">
              ${mediaThumb(proof)}
              <div class="row" style="padding:12px 14px;gap:8px">
                <span class="text-muted" style="display:inline-flex">${icon(proof.type === "video" ? "videocam" : "photo", 18)}</span>
                <span class="body-medium text-on-surface grow ellipsis">${esc(proofDisplayName(proof))}</span>
                ${proof.durationSeconds ? `<span class="label-medium text-muted">${proof.durationSeconds >= 60 ? tx(`${Math.floor(proof.durationSeconds / 60)}分${Math.round(proof.durationSeconds % 60)}秒`, `${Math.floor(proof.durationSeconds / 60)}m${Math.round(proof.durationSeconds % 60)}s`) : tx(`${Math.round(proof.durationSeconds)}秒`, `${Math.round(proof.durationSeconds)}s`)}</span>` : ""}
                <span class="text-muted" style="display:inline-flex">${icon("chevron-right", 20)}</span>
              </div>
            </button>`
          )
          .join("")}
    <div style="height:28px"></div>
  </div>`;
}

async function hydrateRecordProofs(app, record) {
  const ui = checkinState(app);
  if (!app.isApiMode() || ui.recordProofLoadingId === record.id) return;
  ui.recordProofLoadingId = record.id;
  ui.recordOpenError = null;
  app.render();
  try {
    const context = await getRecordEvidenceContext(record.id);
    const proofs = await loadServerRecordProofs(record.id, context);
    record.startTime = context.startedAt ?? null;
    record.endTime = context.endedAt ?? null;
    record.proofFiles = proofs;
    record.proofPhotoCount = proofs.filter((proof) => proof.type === "image").length;
    record.proofVideoCount = proofs.filter((proof) => proof.type === "video").length;
    record.proofSummary = proofs.length ? "" : record.proofSummary;
    record.serverProofsLoaded = true;
    cacheRecordProofs(record.id, proofs);
    // Signed addresses are short-lived: keep them only in memory and renew on open.
    await Promise.all(proofs.map(async (proof) => {
      try {
        const access = await createMediaAccessUrl(proof.mediaId);
        if (app.ui.checkin !== ui) return;
        proof.previewSource = proxyObjectUrl(access.accessUrl);
      } catch (error) {
        if (app.ui.checkin === ui) ui.recordOpenError = toUserFacingError(error);
      }
    }));
  } catch (error) {
          ui.recordOpenError = toUserFacingError(error);
  } finally {
    if (ui.recordProofLoadingId === record.id) ui.recordProofLoadingId = null;
    if (ui.selectedRecordId === record.id) app.render();
  }
}

// ═══════════════════════════════════════════════════════════════
//  Session transitions
// ═══════════════════════════════════════════════════════════════

function persist(app, session) {
  saveSession(accountId(app), session);
}

function apiFailureDialog(app, error, title) {
  const model = toUserFacingError(error);
  app.showDialog({
    title: title || model.title,
    contentHtml: userFacingErrorPanel({ ...model, title: title || model.title }, { compact: true }),
    buttons: [{ label: tx("我知道了", "Got it"), action: "dialog.close" }],
  });
}

const REVIEW_REASON_LABELS = {
  INSUFFICIENT_EVIDENCE: ["凭证不足", "Insufficient evidence"],
  INVALID_MEDIA: ["凭证无效", "Invalid proof"],
  DURATION_INCONSISTENT: ["运动时长不一致", "Duration inconsistency"],
  IDENTITY_MISMATCH: ["身份不匹配", "Identity mismatch"],
  DUPLICATE_SUBMISSION: ["重复提交", "Duplicate submission"],
  OUTSIDE_ALLOWED_SCOPE: ["不在允许范围内", "Outside the allowed scope"],
  OTHER: ["其他原因", "Other reason"],
};

function rejectionReasonText(record) {
  if (record.reviewPublicComment) return record.reviewPublicComment;
  const label = REVIEW_REASON_LABELS[record.reviewReasonCode];
  return label ? tx(label[0], label[1]) : tx("教师未提供公开说明", "No public explanation was provided");
}

export function isActiveSessionConflict(error) {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    error.code === "SESSION_ALREADY_ACTIVE"
  );
}

const ACTIVE_SESSION_STATUSES = new Set(["IN_PROGRESS", "PAUSED"]);

function safeActiveSessionSummary(error, activeSession = null) {
  const details = error instanceof ApiError ? error.details : {};
  const statusCandidate = activeSession?.status ?? details?.currentState ?? details?.status;
  const startedAtCandidate = activeSession?.startedAt ?? details?.startedAt;
  const status = ACTIVE_SESSION_STATUSES.has(statusCandidate) ? statusCandidate : null;
  const startedDate = typeof startedAtCandidate === "string" ? new Date(startedAtCandidate) : null;
  const startedAt = startedDate && Number.isFinite(startedDate.getTime())
    ? startedDate.toLocaleString(currentLocale() === "en-US" ? "en-US" : "zh-CN")
    : null;
  return { status, startedAt };
}

function activeSessionStatusLabel(status) {
  if (status === "PAUSED") return tx("已暂停", "Paused");
  if (status === "IN_PROGRESS") return tx("进行中", "In progress");
  return tx("服务端已确认存在 Active Session", "The server confirmed an active session");
}

function renderActiveSessionConflictDialog(app) {
  const conflict = checkinState(app).activeSessionConflict;
  if (!conflict) return;
  const model = toUserFacingError(conflict.originalError, { log: false });
  const summary = conflict.noActive
    ? { status: null, startedAt: null }
    : safeActiveSessionSummary(conflict.originalError, conflict.activeSession);
  const rows = [
    summary.startedAt ? `<div><b>${esc(tx("开始时间", "Started"))}</b><span>${esc(summary.startedAt)}</span></div>` : "",
    `<div><b>${esc(tx("当前状态", "Status"))}</b><span>${esc(conflict.noActive ? tx("刷新后未发现 Active Session", "No active session after refresh") : activeSessionStatusLabel(summary.status))}</span></div>`,
  ].filter(Boolean).join("");
  app.showDialog({
    title: tx("已有运动正在进行", "An exercise is already in progress"),
    dismissible: false,
    contentHtml: `<section class="active-session-conflict" role="status" aria-live="polite">
      <p>${esc(tx("检测到你的账号还有一条正在进行中的运动记录，可能是在另一台设备上创建的。", "Your account already has an exercise in progress, possibly from another device."))}</p>
      <div class="active-session-conflict-facts">${rows}</div>
      <p>${esc(tx("请回到原设备继续或明确结束该运动。本设备不会自动取消、接管或创建第二条 Session。", "Return to the original device to continue or explicitly end it. This device will not cancel, take over, or create a second session."))}</p>
      ${conflict.refreshMessage ? `<p class="active-session-refresh-message">${esc(conflict.refreshMessage)}</p>` : ""}
      ${model.requestId ? `<p class="user-facing-error-request">${esc(tx("诊断编号", "Diagnostic reference"))}：<code>${esc(model.requestId)}</code></p>` : ""}
    </section>`,
    buttons: [
      { label: conflict.refreshing ? tx("正在刷新…", "Refreshing…") : tx("刷新状态", "Refresh status"), action: "checkin.refreshActiveSessionConflict" },
      { label: tx("返回首页", "Return home"), action: "checkin.activeSessionHome" },
    ],
  });
}

async function refreshActiveSessionConflict(app) {
  const conflict = checkinState(app).activeSessionConflict;
  if (!conflict || conflict.refreshing) return;
  conflict.refreshing = true;
  conflict.refreshMessage = null;
  renderActiveSessionConflictDialog(app);
  try {
    conflict.activeSession = await getActiveSession();
    conflict.noActive = false;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      conflict.activeSession = null;
      conflict.noActive = true;
      conflict.refreshMessage = tx("刷新后未发现正在进行的 Session；返回首页后可重新进入打卡页。", "No active session was found after refresh. Return home and reopen Check-in.");
    } else {
      const refreshError = toUserFacingError(error);
      conflict.refreshMessage = `${refreshError.message} ${refreshError.action}${refreshError.requestId ? ` ${tx("诊断编号", "Diagnostic reference")}：${refreshError.requestId}` : ""}`;
    }
  } finally {
    conflict.refreshing = false;
    renderActiveSessionConflictDialog(app);
  }
}

function hydrateRecordDetail(app, record) {
  void hydrateRecordProofs(app, record);
}

function showActiveSessionConflict(app, error) {
  const summary = safeActiveSessionSummary(error);
  checkinState(app).activeSessionConflict = {
    originalError: error,
    activeSession: summary.status || summary.startedAt ? {
      status: summary.status,
      startedAt: typeof error.details?.startedAt === "string" ? error.details.startedAt : null,
    } : null,
    refreshing: false,
    noActive: false,
    refreshMessage: null,
  };
  toUserFacingError(error);
  renderActiveSessionConflictDialog(app);
  void refreshActiveSessionConflict(app);
}

export function isExactCancelledSession(result, expectedId, expectedEnrollmentId) {
  return (
    result?.id === expectedId &&
    result?.enrollmentId === expectedEnrollmentId &&
    result?.status === "CANCELLED"
  );
}

function sessionReconciliationError(message) {
  return new ApiError(409, {
    code: "SESSION_RECONCILIATION_REQUIRED",
    message,
  });
}

/**
 * Synchronizes the local display mirror from a fresh authoritative GET. It
 * never adds a synthetic delta in the browser; the exact returned duration and
 * version are the only values accepted.
 */
export function reconcileAuthoritativeSession(localSession, authoritativeSession, now = Date.now()) {
  const status = authoritativeSession?.status;
  const durationSeconds = authoritativeSession?.actualDurationSeconds;
  if (
    !localSession?.serverId ||
    authoritativeSession?.id !== localSession.serverId ||
    (localSession.enrollmentId && authoritativeSession.enrollmentId !== localSession.enrollmentId) ||
    !["IN_PROGRESS", "PAUSED"].includes(status) ||
    !Number.isInteger(durationSeconds) ||
    durationSeconds < 0 ||
    !Number.isInteger(authoritativeSession.version) ||
    authoritativeSession.version < 1
  ) {
    throw sessionReconciliationError("Authoritative Session did not match the local Session");
  }
  return {
    ...localSession,
    phase: status === "PAUSED" ? "paused" : "active",
    accumulatedMs: durationSeconds * 1000,
    lastResumedAt: status === "PAUSED" ? null : now,
    serverVersion: authoritativeSession.version,
    serverActualDurationSeconds: durationSeconds,
    maximumDurationSeconds: authoritativeSession.maximumDurationSeconds??null,
  };
}

async function finishSession(app, session) {
  const ui = checkinState(app);
  const complete = (serverSession) => {
    const paused = session.phase === "active" ? pauseSession(session) : session;
    const finished = {
      ...paused,
      phase: "finished",
      endedAt: Date.now(),
      activeDurationMillis: serverSession ? serverSession.actualDurationSeconds * 1000 : paused.accumulatedMs,
      serverVersion: serverSession ? serverSession.version : paused.serverVersion,
      serverActualDurationSeconds: serverSession ? serverSession.actualDurationSeconds : null,
    };
    ui.finish = { submitting: false };
    if (serverSession) app.state.workspace.activeServerSession = null;
    persist(app, finished);
    app.render();
  };
  if (app.isApiMode() && session.serverId) {
    if (ui.sessionTransitioning) return;
    ui.sessionTransitioning = true;
    try {
      const current = await getServerSession(session.serverId);
      if (current.id !== session.serverId || current.enrollmentId !== session.enrollmentId)
        throw sessionReconciliationError('Session identity changed');
      const result = current.status === 'COMPLETED' ? current :
        await finishServerSession(session.serverId, current.version);
      if (result?.id !== session.serverId || result.enrollmentId !== session.enrollmentId || result.status !== 'COMPLETED' ||
          !Number.isSafeInteger(result.actualDurationSeconds) || result.actualDurationSeconds < 0 || !Number.isInteger(result.version) || result.version < 1)
        throw sessionReconciliationError('Backend did not confirm the completed session');
      if (loadSession(accountId(app))?.serverId !== session.serverId)
        throw sessionReconciliationError('Local session changed while completion was in progress');
      complete(result);
    } catch (error) {
      apiFailureDialog(app, error, tx("结束运动失败", "Could not end the session"));
    } finally { ui.sessionTransitioning = false; app.render(); }
    return;
  }
  if (app.isLocalPreview()) complete(null);
}

async function transitionLiveSession(app, command) {
  const ui = checkinState(app);
  const local = loadSession(accountId(app));
  if (!local?.serverId || ui.sessionTransitioning) return;
  ui.sessionTransitioning = true;
  // Immediate display feedback; the server still decides credited duration.
  persist(app, command === 'pause' ? pauseSession(local) : resumeSession(local));
  app.render();
  try {
    const transition = command === 'pause' ? pauseServerSession : resumeServerSession;
    let result;
    try {
      result = await transition(local.serverId, local.serverVersion);
    } catch (error) {
      if (error.status !== 409) throw error;
      const current = await getServerSession(local.serverId);
      reconcileAuthoritativeSession(local, current);
      const target = command === 'pause' ? 'PAUSED' : 'IN_PROGRESS';
      result = current.status === target ? current : await transition(current.id, current.version);
    }
    if (loadSession(accountId(app))?.serverId !== local.serverId)
      throw sessionReconciliationError('Local session changed during transition');
    persist(app, reconcileAuthoritativeSession(local, result));
    app.state.workspace.activeServerSession = result;
  } catch (error) {
    if (loadSession(accountId(app))?.serverId === local.serverId) persist(app, local);
    apiFailureDialog(app, error, command === 'pause' ? tx('暂停失败', 'Pause failed') : tx('继续失败', 'Resume failed'));
  } finally {
    ui.sessionTransitioning = false;
    app.render();
  }
}

function stopLiveCamera(ui) {
  const camera = ui.liveCamera;
  if (!camera) return;
  if (camera.timer) clearTimeout(camera.timer);
  if (camera.countdownTimer) clearInterval(camera.countdownTimer);
  camera.timer = null;
  camera.countdownTimer = null;
  if (camera.recorder) {
    camera.recorder.ondataavailable = null;
    camera.recorder.onstop = null;
    if (camera.recorder.state !== "inactive") camera.recorder.stop();
  }
  camera.stream?.getTracks().forEach((track) => track.stop());
  Object.assign(camera, initialLiveCameraState());
}

function liveCameraRecordedMs(camera, now = Date.now()) {
  if (!camera.recordingStartedAt) return 0;
  const pendingPauseMs = camera.pausedAt ? Math.max(0, now - camera.pausedAt) : 0;
  return Math.max(0, now - camera.recordingStartedAt - camera.pausedDurationMs - pendingPauseMs);
}

function liveCameraRemainingSeconds(camera, now = Date.now()) {
  const remainingMs = Math.max(0, 10 * 1000 - liveCameraRecordedMs(camera, now));
  return Math.ceil(remainingMs / 1000);
}

function updateLiveCameraReadout(app) {
  const camera = checkinState(app).liveCamera;
  const remaining = app._viewport?.querySelector("[data-live-camera-remaining]");
  if (remaining && camera.status !== "saving") {
    const seconds = liveCameraRemainingSeconds(camera);
    remaining.textContent = tx(`剩余 ${seconds} 秒`, `${seconds}s left`);
  }
}

function scheduleVideoLimit(app) {
  const camera = checkinState(app).liveCamera;
  if (camera.timer) clearTimeout(camera.timer);
  if (camera.countdownTimer) clearInterval(camera.countdownTimer);
  const remainingMs = Math.max(0, 10 * 1000 - liveCameraRecordedMs(camera));
  camera.timer = setTimeout(() => finishLiveVideoRecording(app, { limit: 'duration' }), remainingMs);
  camera.countdownTimer = setInterval(() => updateLiveCameraReadout(app), 200);
  updateLiveCameraReadout(app);
}

function finishLiveVideoRecording(app, { discard = false, limit = null } = {}) {
  const camera = checkinState(app).liveCamera;
  const recorder = camera.recorder;
  if (!recorder || recorder.state === "inactive") return;
  if (camera.timer) clearTimeout(camera.timer);
  if (camera.countdownTimer) clearInterval(camera.countdownTimer);
  camera.timer = null;
  camera.countdownTimer = null;
  const now = Date.now();
  if (camera.pausedAt) {
    camera.pausedDurationMs += Math.max(0, now - camera.pausedAt);
    camera.pausedAt = null;
  }
  camera.finalDurationSeconds = capturedRecordingDurationSeconds(
    camera.recordingStartedAt || now,
    now,
    camera.pausedDurationMs,
  );
  camera.discardOnStop = discard;
  camera.limitReason = limit;
  camera.status = "saving";
  recorder.stop();
  app.render();
  requestAnimationFrame(() => attachLiveCamera(app));
}

function attachLiveCamera(app) {
  const ui = checkinState(app);
  const video = app._viewport?.querySelector("[data-live-camera-video]");
  if (!video || !ui.liveCamera.stream) return;
  video.srcObject = ui.liveCamera.stream;
  video.play().catch(() => {});
}

async function openLiveCamera(app, mode, facingMode = 'environment') {
  const ui = checkinState(app);
  stopLiveCamera(ui);
  ui.captureError = null;
  ui.liveCamera.mode = mode;
  ui.liveCamera.facingMode = facingMode;
  ui.liveCamera.status = "requesting";
  app.render();
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("camera-api-unavailable");
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facingMode }, ...(mode === "video" ? {width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30,max:30}} : {}) },
      audio: mode === "video",
    });
    if (ui.liveCamera.mode !== mode) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    ui.liveCamera.stream = stream;
    ui.liveCamera.status = "ready";
    app.render();
    requestAnimationFrame(() => attachLiveCamera(app));
  } catch {
    stopLiveCamera(ui);
    ui.captureError = tx(
      "无法打开实时相机。请允许浏览器使用相机；录像还需允许麦克风。",
      "The live camera could not be opened. Allow camera access; video also requires microphone access.",
    );
    app.render();
  }
}

function preferredRecorderMimeType() {
  // Prefer native MP4; browsers recording WebM use local normalization before upload.
  const candidates = ["video/mp4;codecs=avc1.42001E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp8,opus", "video/webm"];
  return candidates.find((type) => globalThis.MediaRecorder?.isTypeSupported?.(type)) || "";
}

async function normalizeCapturedPhoto(file) {
  if (!canNormalizeCapturedImage(file)) throw new Error("unsupported-source-image");
  if(file.type.toLowerCase()==='image/jpeg')return prepareJpegEvidence(file);
  if(file.type.toLowerCase()==='image/png')return file;
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("image-decode-failed"));
      element.src = sourceUrl;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("image-decode-failed");

    // Fresh JPEG bytes omit the original EXIF/GPS blocks. Backend still
    // performs the authoritative location-metadata and integrity checks.
    const maxDimension = 4096;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("image-encode-unavailable");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const jpeg = await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("image-encode-failed")), "image/jpeg", 0.9);
    });
    return new File([jpeg], `proof_photo_${Date.now()}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export function videoThumbnailDimensions(width, height, maxDimension = 640) {
  const sourceWidth = Math.max(1, Math.round(Number(width) || 1));
  const sourceHeight = Math.max(1, Math.round(Number(height) || 1));
  const limit = Math.max(1, Math.round(Number(maxDimension) || 640));
  const scale = Math.min(1, limit / Math.max(sourceWidth, sourceHeight));
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

function captureVideoThumbnail(video) {
  if (!video.videoWidth || !video.videoHeight || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
  try {
    const size = videoThumbnailDimensions(video.videoWidth, video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return null;
    context.drawImage(video, 0, 0, size.width, size.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return null;
  }
}

export function resolveRecordedVideoDuration(previewDuration, capturedDuration) {
  if (Number.isFinite(previewDuration) && previewDuration > 0) return previewDuration;
  return Number.isFinite(capturedDuration) && capturedDuration > 0 &&
    capturedDuration <= MAX_PROOF_VIDEO_SECONDS ? capturedDuration : null;
}

export function validateVideoDraftDuration(file, durationSeconds, nativeCapture = false) {
  const verdict = validateProofFile(file, 'video', { durationSeconds });
  return verdict.ok && nativeCapture && durationSeconds > 10
    ? { ok: false, error: 'duration' } : verdict;
}

export async function readVideoPreview(url) {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    let durationSeconds = null, thumbnailUrl = null, settled = false, timeoutId;
    const finish = (thumbnailUrl) => {
      if (settled) return; settled = true; clearTimeout(timeoutId);
      video.onloadedmetadata = video.onloadeddata = video.ondurationchange = video.oncanplay = video.ontimeupdate = video.onerror = null;
      video.pause(); video.removeAttribute("src"); video.load(); video.remove();
      resolve({durationSeconds,thumbnailUrl});
    };
    const sample = () => {
      if (settled) return;
      if (Number.isFinite(video.duration) && video.duration > 0) durationSeconds = video.duration;
      thumbnailUrl ||= captureVideoThumbnail(video);
      // A decoded frame can arrive before finite duration metadata on phones.
      // Keep listening rather than reporting an otherwise valid clip as unknown.
      if (thumbnailUrl && durationSeconds !== null) finish(thumbnailUrl);
    };
    // Mobile engines may ignore preload for a detached element. Keep a real
    // rendering surface and start muted inline playback before reading pixels.
    video.preload = "auto"; video.muted = true; video.defaultMuted = true; video.playsInline = true;
    video.setAttribute("playsinline", ""); video.setAttribute("webkit-playsinline", "");
    video.setAttribute("aria-hidden", "true"); video.tabIndex = -1;
    video.style.cssText = "position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:.01;pointer-events:none;z-index:2147483646";
    video.onloadedmetadata = sample;
    video.onloadeddata = video.oncanplay = video.ontimeupdate = sample;
    video.ondurationchange = video.onloadedmetadata;
    video.onerror = () => finish(null);
    document.body.append(video); video.src = url; video.load();
    timeoutId = setTimeout(()=>finish(thumbnailUrl || captureVideoThumbnail(video)),20000);
    video.play().then(sample).catch(()=>{});
    video.requestVideoFrameCallback?.(sample);
  });
}

export function capturedRecordingDurationSeconds(startedAt, endedAt = Date.now(), pausedDurationMs = 0) {
  const elapsedSeconds = (endedAt - startedAt - Math.max(0, pausedDurationMs)) / 1000;
  return Math.min(MAX_PROOF_VIDEO_SECONDS, Math.max(0.1, elapsedSeconds));
}

export async function addDraftFromFile(app, file, type, capturedDurationSeconds = null, existingDraftId = null, nativeCapture = false) {
  const ui = checkinState(app);
  const converting = type === "video";
  if (converting && ui.normalizingVideo) return;
  if (converting) ui.normalizingVideo = true;
  try { await addDraftFromFileImpl(app, file, type, capturedDurationSeconds, existingDraftId, converting, nativeCapture); }
  finally { if (converting) { ui.normalizingVideo = false; app.render(); } }
}

async function addDraftFromFileImpl(app, file, type, capturedDurationSeconds, existingDraftId, converting, nativeCapture) {
  const ui = checkinState(app), owner = accountId(app), scope = draftScope(app);
  ui.captureError = null;
  const name = capturedDurationSeconds !== null ? tx('刚录制的视频', 'Recorded video')
    : file.name || (type === "image" ? tx("图片文件", "image file") : tx("视频文件", "video file"));
  const rejectWith = (message) => {
    ui.captureError = message;
    app.render();
  };

  const draftId = existingDraftId || `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let uploadFile = file;
  if (converting) {
    try { uploadFile = await prepareVideoSource(file); }
    catch (error) { rejectWith(error.message === 'size'
      ? tx('视频为空或超过 200MB 限制，请重新录制。', 'Video is empty or exceeds 200MB. Record again.')
      : tx('无法识别视频文件，请重新拍摄。', 'Video format could not be recognized. Record again.')); return; }
  }
  if (type === "image") {
    try {
      await savePhotoOriginal(originalOwnerId(app),draftId,file);
      uploadFile = await normalizeCapturedPhoto(file);
    } catch {
      rejectWith(tx(
        `「${name}」无法在当前浏览器中转换为不含位置元数据的 JPEG，请重新拍摄或使用 JPEG/PNG。`,
        `“${name}” cannot be converted to a location-metadata-free JPEG in this browser. Capture it again or use JPEG/PNG.`
      ));
      return;
    }
  }

  // Video duration is measured below. The one-second value here is only used
  // to run the exact MIME/size precheck and is never sent to Backend.
  const preVerdict = validateProofFile(uploadFile, type, { durationSeconds: type === "video" ? 1 : null });
  if (!preVerdict.ok) {
    if (preVerdict.error === "format" || preVerdict.error === "empty") {
      rejectWith(type === "video"
        ? tx(`「${name}」格式不支持，请使用 MP4 视频。`, `“${name}” is unsupported. Use an MP4 video.`)
        : tx(`「${name}」无法转换为有效的 JPEG/PNG。`, `“${name}” could not be converted to a valid JPEG/PNG.`));
    } else {
      rejectWith(type === "image"
        ? tx(`「${name}」超过单张图片 10MB 上限。`, `“${name}” exceeds the 10MB per-photo limit.`)
        : tx(`「${name}」超过视频 200MB 上限，请重新录制。`, `“${name}” exceeds the 200MB video limit. Record again.`));
    }
    return;
  }
  const url = URL.createObjectURL(uploadFile);
  let durationSeconds = null;
  let thumbnailUrl = null;
  let verdict = preVerdict;
  if (type === "video") {
    durationSeconds = capturedDurationSeconds;
    verdict = validateVideoDraftDuration(uploadFile, durationSeconds, nativeCapture);
    if (!verdict.ok) { URL.revokeObjectURL(url); rejectWith(tx('视频超过 10 秒时长限制，请重新录制。', 'Video exceeds 10 seconds. Record again.')); return; }
  }

  const draft = {
    id: draftId,
    type,
    fileName: `proof_${type === "image" ? "photo" : "video"}_${Date.now()}.${verdict.extension}`,
    byteCount: uploadFile.size,
    durationSeconds,
    thumbnailUrl,
    url,
    blob: uploadFile,
    mimeType: verdict.mimeType,
    capturedAfterEnd: ['finished','submitted'].includes(loadSession(accountId(app))?.phase),
    captureSource: !selectedProofTodo(app)&&loadSession(accountId(app))?.recordOrigin === 'HISTORICAL' ? 'FILE_PICKER' : 'IN_APP_CAMERA',
  };
  try {
    if (accountId(app) !== owner || app.ui.checkin !== ui) { URL.revokeObjectURL(url); return; }
    await saveProofDraft(owner, scope, draft);
  } catch {
    ui.captureError = tx("凭证尚未保存到本机，请勿关闭页面；请释放存储空间后重新拍摄。", "Proof is not saved on this device. Keep this page open and free storage before capturing again.");
  }
  if (accountId(app) !== owner || app.ui.checkin !== ui) { URL.revokeObjectURL(url); return; }
  for (const previous of ui.drafts.filter(d=>d.id===draftId)) URL.revokeObjectURL(previous.url);
  ui.drafts = ui.drafts.filter(d=>d.id!==draftId);
  ui.drafts.push(draft);
  ui.mediaNotice = type === "image" ? tx("已添加现场照片。", "On-site photo added.") : tx("已添加现场视频。", "On-site video added.");
  app.render();
}

function submitCheckIn(app, session) {
  const ui = checkinState(app);
  const details = session.details;
  const retained = [...ui.drafts];
  if (retained.some(d=>d.normalizationPending)) {
    app.showDialog({title:tx("视频仍在处理", "Video processing"),body:tx("视频原件已保存在本机，请完成视频处理后再提交。", "The original video is saved. Finish processing before submitting."),buttons:[{label:tx("确定", "OK"),action:"dialog.close"}]});return;
  }
  if (retained.length === 0) {
    app.showDialog({ title: tx("凭证检查", "Proof check"), body: tx("请至少保留 1 项现场凭证", "Keep at least one on-site proof item."), buttons: [{ label: tx("确定", "OK"), action: "dialog.close" }] });
    return;
  }
  const normalizedDescription = (details.description || "").trim();
  if (!normalizedDescription) {
    app.showDialog({ title: tx("凭证检查", "Proof check"), body: tx("请填写运动说明", "Enter exercise details."), buttons: [{ label: tx("确定", "OK"), action: "dialog.close" }] });
    return;
  }
  details.description = normalizedDescription;
  persist(app, session);
  ui.finish.submitting = true;
  app.render();
  if (app.isApiMode() && session.serverId) {
    submitCheckInApi(app, session, retained);
    return;
  }
  ui.finish.submitting = false;
  if (app.isLocalPreview()) {
    app.showDialog({
      title: tx("本地预览不提交", "Local preview does not submit"),
      body: tx("这是本地界面预览，不会写入 Backend，也不是正式打卡成功。", "This is a local UI preview. Nothing is written to Backend, and this is not a formal check-in."),
      buttons: [{ label: tx("知道了", "OK"), action: "dialog.close" }],
    });
    return;
  }
  apiFailureDialog(app, new ApiError(401, { code: "AUTH_SESSION_REQUIRED", message: "" }), tx("提交失败", "Submission failed"));
  app.render();
}

/** Real submission: record draft → media upload/confirm/bind → submit. */
async function submitCheckInApi(app, session, retained) {
  const ui = checkinState(app);
  const details = session.details;
  try {
    session.recordSubmission ||= { createKey: crypto.randomUUID(), submitKey: crypto.randomUUID() };
    persist(app, session);
    // Reconcile a committed submission whose response was lost, as well as a
    // retained draft. The server enforces one record per exercise session.
    let record = (await listMyRecords()).find(
      (r) => ['DRAFT', 'SUBMITTED', 'REVIEWED'].includes(r.status) && r.sessionId === session.serverId
    ) || null;
    if (!record) {
      const recordInput = {
        sessionId: session.serverId,
        creditType: details.creditType,
        sportType: details.sportType,
        sportName: details.customSportName || null,
        description: details.description,
      };
      session.recordSubmission.input ||= recordInput;
      persist(app, session);
      record = await createRecordDraft(session.recordSubmission.input, session.recordSubmission.createKey);
    }
    if (record.status === 'DRAFT' && (record.description || '') !== details.description.trim()) {
      record = await request(`/exercise-records/${record.id}`, {method:'PATCH',idempotent:true,
        body:{description:details.description.trim(),expectedVersion:record.version}});
    }
    const alreadySubmitted = record.status !== 'DRAFT';
    if (!alreadySubmitted && isRealtimeSwim(session)) {
      ui.mediaNotice = tx('正在预受理游泳材料…', 'Accepting swimming evidence…');
      app.render();
      await ensureSwimIntake({
        record, drafts: retained, intent: session.recordSubmission, delayReason: session.swimDelayReason,
        get: getSwimIntake, accept: acceptSwimIntake,
        prepare: async draft => uploadMediaDraft(session.serverId, draft, draft.blob || await fetch(draft.url).then(r=>r.blob()), {prepareOnly:true}),
        save: async draft => { if(draft) await saveProofDraft(accountId(app), session.serverId, draft); persist(app,session); },
        fail: reason => new ApiError(422,{code:'VALIDATION_FAILED',details:{reason}}),
      });
    }
    const uploaded = alreadySubmitted ? await loadServerRecordProofs(record.id) : [];
    for (let index = 0; !alreadySubmitted && index < retained.length; index++) {
      const draft = retained[index];
      ui.mediaNotice = tx(`正在处理凭证 ${index + 1}/${retained.length}…`, `Processing proof ${index + 1}/${retained.length}…`);
      app.render();
      const blob = draft.blob || (await fetch(draft.url).then((r) => r.blob()));
      let mediaId;
      try { mediaId = draft.mediaId || (await uploadMediaDraft(session.serverId, draft, blob,{onProgress:progress=>{const label=uploadProgressLabel(progress);if(ui.mediaNotice!==label){ui.mediaNotice=label;app.render();}}})).mediaId; }
      finally { await saveProofDraft(accountId(app), session.serverId, draft); }
      uploaded.push({
        mediaId,
        type: draft.type,
        fileName: draft.fileName,
        byteCount: draft.byteCount,
        durationSeconds: draft.durationSeconds,
      });
    }
    ui.mediaNotice = tx("全部凭证已验证，正在提交打卡…", "All proof is verified. Submitting the check-in…");
    app.render();
    const submitFingerprint = JSON.stringify({mediaIds:uploaded.map(u=>u.mediaId), delay:session.swimDelayReason?.trim()||''});
    if (session.recordSubmission.submitFingerprint && session.recordSubmission.submitFingerprint !== submitFingerprint) session.recordSubmission.submitKey = crypto.randomUUID();
    session.recordSubmission.submitFingerprint = submitFingerprint;
    persist(app,session);
    const submittedRecord = alreadySubmitted ? record : await submitRecord(record.id, uploaded.map((u) => u.mediaId), record.version, session.swimDelayReason, session.recordSubmission.submitKey);
    cacheRecordProofs(record.id, uploaded);
    // The server has committed submission. Album failure must never turn this
    // into a failed check-in; persisted native work retries on the next visit.
    try {
      const album = await saveSuccessfulEvidence(originalOwnerId(app), record.id, retained);
      if (album.pending) ui.mediaNotice = tx('打卡已成功，相册保存待重试。', 'Check-in succeeded. Album saving will retry.');
    } catch { ui.mediaNotice = tx('打卡已成功，本机凭证暂未存入相册。', 'Check-in succeeded. Evidence has not yet been saved to the album.'); }
    ui.finish.submitting = false;
    const credited = authoritativeCreditedHours(submittedRecord);
    const submitted = {
      phase: "submitted",
      summary: {
        date: formatDateOnly(session.startedAt),
        startTime: formatTimeOnly(session.startedAt),
        endTime: formatTimeOnly(session.endedAt),
        duration: formatTimer(session.activeDurationMillis),
        creditedHours: credited,
        creditType: creditTypeLabel(details.creditType),
        sportType: sportLabel(details),
        proofCount: uploaded.length,
      },
    };
    await clearProofDrafts(accountId(app), session.serverId);
    persist(app, submitted);
    for (const draft of ui.drafts) if (draft.url?.startsWith("blob:")) URL.revokeObjectURL(draft.url);
    ui.drafts = [];
    app.render();
    app.reloadApiWorkspace();
  } catch (error) {
    ui.finish.submitting = false;
    if (error?.code === 'MEDIA_VERIFICATION_INCOMPLETE') {
      ui.mediaNotice = tx('视频已上传，正在处理，可以继续填写其他内容。处理完成后请再次提交。', 'Video uploaded and processing. Continue editing and submit when ready.');
    } else apiFailureDialog(app, error, tx("提交失败", "Submission failed"));
    app.render();
  }
}

// 1 Hz heartbeat updates the display; the server owns session completion.
export function checkinTick(app) {
  if (!app.state.authenticated) return;
  const session = loadSession(accountId(app));
  if (!session) return;
  if (session.phase === "active") {
    const ui=checkinState(app);
    if(shouldAutoEnd(session)&&!ui.sessionTransitioning&&Date.now()>(ui.nextAutoEndAttempt??0)){
      ui.nextAutoEndAttempt=Date.now()+15000;
      void finishSession(app,session);
    }
    const duration = sessionDurationMs(session);
    const timerEl = app._viewport?.querySelector("[data-timer-value]");
    if (timerEl) timerEl.textContent = formatTimer(duration);
    const hoursEl = app._viewport?.querySelector("[data-timer-hours]");
    if (hoursEl) hoursEl.textContent = `${estimatedCreditedHours(app,duration)}h`;
    const dashboardEl = app._viewport?.querySelector("[data-dashboard-duration]");
    if (dashboardEl) dashboardEl.textContent = formatTimer(duration);
  }
}

// ═══════════════════════════════════════════════════════════════
//  Actions
// ═══════════════════════════════════════════════════════════════

export const checkinActions = {
  "checkin.swimPhase": async (app,el) => {
    const ui=checkinState(app), draft=ui.drafts.find(d=>d.id===el.dataset.draftId);
    if(!draft || ui.finish.submitting || draft.swimLocked || !['','BEFORE','AFTER','OTHER'].includes(el.value) || (el.value==='BEFORE' && draft.capturedAfterEnd)) return;
    draft.swimPhase=el.value;
    await saveProofDraft(accountId(app),draftScope(app),draft);
    app.render();
  },
  "checkin.swimDelay": (app,el) => { const session=loadSession(accountId(app)); if(session && !checkinState(app).finish.submitting){session.swimDelayReason=el.value.trim();persist(app,session);} },
  'checkin.selectProof':async(app,el)=>{
    const ui=checkinState(app);
    if(ui.finish.submitting)return;
    const id=el?.dataset?.recordId;
    if(!(app.state.workspace.proofTodos||[]).some(item=>item.recordId===id))return;
    stopLiveCamera(ui);ui.focusProofRecordId=id;ui.selectedRecordId=null;
    app.selectTab('checkin');await restoreCheckinContinuity(app);app.render();
  },
  'checkin.leaveProof':async app=>{
    const ui=checkinState(app);if(ui.finish.submitting)return;
    stopLiveCamera(ui);ui.focusProofRecordId=null;await restoreCheckinContinuity(app);app.render();
  },
  "checkin.originals": async app => {
    try {
      const ui=checkinState(app);for(const url of ui.originalUrls||[])URL.revokeObjectURL(url);
      const photos=await listPhotoOriginals(originalOwnerId(app));ui.originalUrls=[];
      const items=photos.map(photo=>{const url=URL.createObjectURL(photo.blob);ui.originalUrls.push(url);return `<p><a href="${esc(url)}" download="${esc(photo.name)}">${esc(photo.name)}</a> <button data-action="checkin.originalDelete" data-id="${esc(photo.id)}">${tx("删除本机原图","Delete local original")}</button></p>`;}).join('');
      app.showDialog({title:tx("本机照片原图","Original photos on this device"),body:`<p>${tx("原图保留原始照片及 EXIF，不随记录提交而清除。点击文件名保存到设备。浏览器清理数据或卸载后可能丢失，请及时保存。上传副本会排除位置等信息。","Original files and EXIF remain after submission. Select a filename to save it to your device. Browser data cleanup may remove these copies. Upload copies exclude location information.")}</p>${items||tx("暂无已保存原图","No saved originals")}`,buttons:[{label:tx("关闭","Close"),action:"dialog.close"}]});
    }catch(error){apiFailureDialog(app,error,tx("无法读取本机原图","Cannot load local originals"));}
  },
  "checkin.originalDelete": async(app,el)=>{await removePhotoOriginal(originalOwnerId(app),el.dataset.id);await checkinActions["checkin.originals"](app);},
  "checkin.historyOpen": async (app) => {
    const course=findCurrentCourse(app.state.workspace); if(!course)return;
    try {
      const settings=await request(`/class-sections/${course.classSectionId}/history-settings`);
      if(!settings.enabled) {app.showDialog({title:tx("历史补卡", "Past exercise"),body:tx("教师尚未开放本课程历史补卡。", "Your teacher has not enabled past exercise entries."),buttons:[{label:tx("知道了","OK"),action:"dialog.close"}]});return;}
      const yesterday=new Date(`${settings.today}T00:00:00Z`);yesterday.setUTCDate(yesterday.getUTCDate()-1);
      const latest=[settings.latestDate,yesterday.toISOString().slice(0,10)].sort()[0];
      checkinState(app).historySettings=settings;
      app.showDialog({title:tx("补录历史运动", "Add past exercise"),body:`<p>${tx("填写实际运动日期和时长，随后上传凭证。补卡须教师审核，按所选日期计算次数。", "Enter the actual date and duration, then upload evidence. Teacher review is required.")}</p><label>${tx("日期","Date")}<input id="history-date" type="date" min="${esc(settings.earliestDate)}" max="${esc(latest)}" value="${esc(latest)}"/></label><label>${tx("开始时间（北京时间）","Start time (Beijing time)")}<input id="history-time" type="time" value="12:00"/></label><label>${tx("运动时长（分钟）","Duration (minutes)")}<input id="history-minutes" type="number" min="1" max="1440" value="60"/></label>`,buttons:[{label:tx("取消","Cancel"),action:"dialog.close"},{label:tx("添加凭证","Add evidence"),action:"checkin.historyCreate"}]});
    }catch(error){apiFailureDialog(app,error,tx("无法读取补卡范围","Cannot load past exercise settings"));}
  },
  "checkin.historyCreate": async (app) => {
    const ui=checkinState(app),course=findCurrentCourse(app.state.workspace);if(!course||ui.sessionTransitioning)return;
    const date=document.getElementById('history-date')?.value,time=document.getElementById('history-time')?.value,minutes=Number(document.getElementById('history-minutes')?.value);
    if(!date||!time||!Number.isInteger(minutes)||minutes<1)return;
    ui.sessionTransitioning=true;
    try {
      const sport=courseSportSelection(course.name),details={creditType:ui.setup.creditType,sportType:ui.setup.creditType==='course'?sport.sportType:ui.setup.generalSportType,
        customSportName:ui.setup.creditType==='course'?sport.customSportName:ui.setup.generalCustomSportName||null,description:''};
      const server=await request(`/enrollments/${course.enrollmentId}/historical-sessions`,{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},body:{startedAt:`${date}T${time}:00+08:00`,durationSeconds:minutes*60}});
      const local={...startSession(details),phase:'finished',recordOrigin:'HISTORICAL',serverId:server.id,serverVersion:server.version,enrollmentId:server.enrollmentId,
        startedAt:Date.parse(server.startedAt),endedAt:Date.parse(server.completedAt),accumulatedMs:server.actualDurationSeconds*1000,lastResumedAt:null,
        activeDurationMillis:server.actualDurationSeconds*1000,serverActualDurationSeconds:server.actualDurationSeconds};
      persist(app,local);ui.finish={submitting:false};app.state.dialog=null;
    }catch(error){apiFailureDialog(app,error,tx("无法创建历史补卡","Cannot create past exercise entry"));}finally{ui.sessionTransitioning=false;app.render();}
  },
  "checkin.historyFiles": async (app,el) => {
    if(loadSession(accountId(app))?.recordOrigin!=='HISTORICAL')return;
    for(const file of [...(el.files||[])]) await addDraftFromFile(app,file,(file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|3gp)$/i.test(file.name))?'video':'image');
    el.value='';
  },
  "checkin.cameraFlip": (app) => {
    const camera = checkinState(app).liveCamera;
    if (!camera.mode || camera.status !== 'ready') return;
    void openLiveCamera(app, camera.mode, camera.facingMode === 'user' ? 'environment' : 'user');
  },
  "checkin.noop": () => {},
  "checkin.tab": (app, el) => {
    checkinState(app).tab = el.dataset.tab;
    app.render();
  },
  "checkin.creditType": (app, el) => {
    checkinState(app).setup.creditType = el.dataset.value;
    app.render();
  },
  "checkin.sport": (app, el) => {
    const ui = checkinState(app);
    if (ui.setup.creditType !== "general") return;
    ui.setup.generalSportType = el.dataset.value;
    if (el.dataset.value !== OTHER) ui.setup.generalCustomSportName = "";
    app.render();
  },
  "checkin.customSport": (app, el) => {
    const ui = checkinState(app);
    ui.setup.generalCustomSportName = el.value.slice(0, 32);
    const counter = app._viewport?.querySelector("[data-custom-sport-counter]");
    if (counter) counter.textContent = tx(`${ui.setup.generalCustomSportName.length}/32，最多 32 个字符`, `${ui.setup.generalCustomSportName.length}/32, up to 32 characters`);
    const startBtn = app._viewport?.querySelector('[data-action="checkin.start"]');
    if (startBtn) startBtn.disabled = ui.setup.generalCustomSportName.trim() === "";
  },
  "checkin.refreshActiveSessionConflict": (app) => {
    void refreshActiveSessionConflict(app);
  },
  "checkin.activeSessionHome": (app) => {
    const ui = checkinState(app);
    ui.activeSessionConflict = null;
    app.state.dialog = null;
    app.selectTab("dashboard");
  },
  "checkin.start": (app) => {
    const ui = checkinState(app);
    const readiness = evaluateReadiness(app);
    if (!readiness.canStart) {
      app.render();
      return;
    }
    const workspace = app.state.workspace;
    const currentCourse = findCurrentCourse(workspace);
    const isCourse = ui.setup.creditType === "course";
    const courseSport = currentCourse ? courseSportSelection(currentCourse.name) : null;
    const details = {
      creditType: ui.setup.creditType,
      sportType: isCourse ? courseSport?.sportType || OTHER : ui.setup.generalSportType,
      customSportName: isCourse
        ? courseSport?.customSportName || null
        : ui.setup.generalSportType === OTHER
          ? ui.setup.generalCustomSportName.trim()
          : null,
      description: "",
    };
    const afterStart = (serverSession) => {
      const local = startSession(details);
      if (serverSession) {
        local.serverId = serverSession.id;
        local.serverVersion = serverSession.version;
        local.enrollmentId = serverSession.enrollmentId;
        local.maximumDurationSeconds = serverSession.maximumDurationSeconds??null;
      }
      persist(app, local);
      // Submission and explicit discard are the clearing points for local drafts.
      app.render();
    };
    const begin = () => {
      if (!app.isApiMode()) {
        if (app.isLocalPreview()) {
          afterStart(null);
          return;
        }
        apiFailureDialog(app, new ApiError(401, { code: "AUTH_SESSION_REQUIRED", message: "" }), tx("无法开始运动", "Cannot start"));
        return;
      }
      if (workspace.activeServerSession) {
        const expectedId = workspace.activeServerSession.id;
        getActiveSession().then(server => {
          if (server.id !== expectedId) throw new ApiError(409, {code:'SESSION_VERSION_CONFLICT',message:''});
          persist(app, restoreServerSession(server, details));
          app.render();
        }).catch(error => apiFailureDialog(app,error,tx("无法恢复运动", "Cannot restore exercise")));
        return;
      }
      const enrollmentId = currentCourse?.enrollmentId
        || workspace.courses.find((c) => c.enrollmentId)?.enrollmentId;
      if (!enrollmentId) {
        apiFailureDialog(app, new ApiError(400, { code: "NO_ENROLLMENT", message: "" }), tx("无法开始运动", "Cannot start"));
        return;
      }
      const startOnServer = () => startServerSession(enrollmentId).then(afterStart);
      startOnServer().catch((error) => {
        // The backend refuses a new session once the qualifying total is
        // reached, reusing SESSION_ALREADY_COMPLETED.
        if (isQualificationReached(error)) throw error;
        if (isActiveSessionConflict(error)) {
          // The active session may still belong to this browser, another
          // device, or a recoverable server-side workflow. Starting a new
          // session must fail closed: never cancel or replace it implicitly.
          throw error;
        }
        throw error;
      }).catch((error) => {
        if (isQualificationReached(error)) {
          app.showDialog({
            title: tx("已达到合格时长", "Qualifying hours reached"),
            body: sessionStartErrorText(error),
            buttons: [{ label: tx("我知道了", "Got it"), action: "dialog.close" }],
          });
          return;
        }
        if (isActiveSessionConflict(error)) {
          showActiveSessionConflict(app, error);
          return;
        }
        apiFailureDialog(app, error, tx("无法开始运动", "Cannot start"));
      });
    };
    if (!healthAcknowledged(app)) {
      // First-time health and safety reminder ("我知道了" only).
      app.showDialog({
        title: tx("健康安全提醒", "Health and safety reminder"),
        body: tx("请根据自身身体状况适量运动。如感不适应立即停止，必要时及时就医。", "Exercise within your limits. Stop immediately if you feel unwell and seek medical help when necessary."),
        dismissible: false,
        buttons: [{ label: tx("我知道了", "Got it"), action: "checkin.ackHealth" }],
      });
      return;
    }
    begin();
  },
  "checkin.ackHealth": (app) => {
    app.overlay.healthReminderAck = true;
    app.saveOverlay();
    app.state.dialog = null;
    checkinActions["checkin.start"](app);
  },
  "checkin.pause": (app) => {
    const session = loadSession(accountId(app));
    if (session?.phase !== "active") return;
    const apply = (serverSession) => {
      const paused = pauseSession(session);
      if (serverSession) paused.serverVersion = serverSession.version;
      persist(app, paused);
      app.render();
    };
    if (app.isApiMode() && session.serverId) {
      void transitionLiveSession(app, 'pause');
      return;
    }
    if (app.isLocalPreview()) apply(null);
  },
  "checkin.resume": (app) => {
    const session = loadSession(accountId(app));
    if (session?.phase !== "paused") return;
    const apply = (serverSession) => {
      const resumed = resumeSession(session);
      if (serverSession) resumed.serverVersion = serverSession.version;
      persist(app, resumed);
      app.render();
    };
    if (app.isApiMode() && session.serverId) {
      void transitionLiveSession(app, 'resume');
      return;
    }
    if (app.isLocalPreview()) apply(null);
  },
  "checkin.requestFinish": (app) => {
    if (checkinState(app).sessionTransitioning) return;
    const session = loadSession(accountId(app));
    if (!session) return;
    const duration = sessionDurationMs(session);
    const threshold = app.state.workspace?.creditPolicy?.minCreditThresholdMinutes;
    const short = Number.isInteger(threshold) && threshold >= 1 && threshold <= 1440 && duration < threshold * 60000;
    app.showDialog({
      title: tx("你确定要结束本次运动吗？", "End this exercise session?"),
      body: short
        ? tx(`当前预计时长未达课程 ${threshold} 分钟门槛，结束后不会形成打卡记录或送交教师审核。`, `The estimated duration is below the course threshold of ${threshold} minutes and will not create a check-in record or enter teacher review.`)
        : "",
      buttons: [
        { label: tx("取消", "Cancel"), action: "dialog.close" },
        { label: tx("确认结束", "End exercise"), action: "checkin.confirmFinish" },
      ],
    });
  },
  "checkin.confirmFinish": (app) => {
    app.state.dialog = null;
    const session = loadSession(accountId(app));
    if (!session) return;
    void finishSession(app, session, { auto: false });
  },
  "checkin.capturePhoto": (app) => { void openLiveCamera(app, "photo"); },
  "checkin.captureVideo": (app) => { void openLiveCamera(app, "video"); },
  "checkin.videoNoticeContinue": (app) => {
    app.state.dialog = null;
    app.render();
    void openLiveCamera(app, "video");
  },
  "checkin.cameraClose": (app) => {
    const ui = checkinState(app);
    stopLiveCamera(ui);
    app.render();
  },
  "checkin.cameraTakePhoto": (app) => {
    const ui = checkinState(app);
    const video = app._viewport?.querySelector("[data-live-camera-video]");
    if (!video || !video.videoWidth || !video.videoHeight || ui.liveCamera.status !== "ready") return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d", { alpha: false })?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      stopLiveCamera(ui);
      const file = new File([blob], `live_photo_${Date.now()}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
      void addDraftFromFile(app, file, "image");
    }, "image/jpeg", 0.9);
  },
  "checkin.retryVideo": async (app) => {
    for (const draft of checkinState(app).drafts.filter(d=>d.normalizationPending)) await addDraftFromFile(app,draft.blob,"video",draft.capturedDurationSeconds,draft.id,draft.nativeCapture ?? false);
  },
  "checkin.cameraStartVideo": (app) => {
    const ui = checkinState(app);
    const camera = ui.liveCamera;
    if (camera.mode !== "video" || camera.status !== "ready" || !camera.stream || !globalThis.MediaRecorder) return;
    const mimeType = preferredRecorderMimeType();
    if (!mimeType) {
      stopLiveCamera(ui);
      ui.captureError = tx("当前浏览器无法录制 MP4 视频，请更新浏览器或使用支持 MP4 录像的浏览器。", "This browser cannot record MP4 video. Update it or use a browser with MP4 recording support.");
      app.render();
      return;
    }
    const recorder = mimeType ? new MediaRecorder(camera.stream, { mimeType }) : new MediaRecorder(camera.stream);
    camera.recorder = recorder;
    camera.chunks = [];
    camera.recordedBytes = 0;
    camera.limitReason = null;
    camera.recordingStartedAt = Date.now();
    camera.pausedAt = null;
    camera.pausedDurationMs = 0;
    camera.finalDurationSeconds = null;
    camera.discardOnStop = false;
    recorder.ondataavailable = (event) => {
      if (!event.data?.size) return;
      camera.chunks.push(event.data);
      camera.recordedBytes += event.data.size;
      const limit = recordingLimit(liveCameraRecordedMs(camera), camera.recordedBytes);
      if (limit && recorder.state !== 'inactive') finishLiveVideoRecording(app, {limit});
    };
    recorder.onstop = () => {
      if (camera.timer) clearTimeout(camera.timer);
      if (camera.countdownTimer) clearInterval(camera.countdownTimer);
      camera.timer = null;
      camera.countdownTimer = null;
      const blob = new Blob(camera.chunks, { type: recorder.mimeType || "video/webm" });
      const recordedDurationSeconds = camera.finalDurationSeconds || capturedRecordingDurationSeconds(camera.recordingStartedAt || Date.now());
      const discard = camera.discardOnStop;
      const limitReason = camera.limitReason;
      camera.recorder = null;
      camera.chunks = [];
      camera.recordingStartedAt = null;
      camera.pausedAt = null;
      camera.pausedDurationMs = 0;
      camera.finalDurationSeconds = null;
      camera.discardOnStop = false;
      if (discard) {
        camera.status = "ready";
        app.render();
        requestAnimationFrame(() => attachLiveCamera(app));
        return;
      }
      camera.stream?.getTracks().forEach((track) => track.stop());
      camera.stream = null;
      camera.mode = null;
      camera.status = "idle";
      app.render();
      if (blob.size > 0) {
        const extension = blob.type.startsWith("video/mp4") ? "mp4" : "webm";
        const file = new File([blob], `live_video_${Date.now()}.${extension}`, { type: blob.type, lastModified: Date.now() });
        void addDraftFromFile(app, file, "video", recordedDurationSeconds, null, true).then(() => {
          if (limitReason) {
            ui.mediaNotice = limitReason === 'size' ? tx('200MB 限制已达到，拍摄已自动停止。', '200MB limit reached. Recording stopped automatically.') : tx('10 秒时长已达到，拍摄已自动停止。', '10-second limit reached. Recording stopped automatically.');
            app.render();
          }
        });
      }
    };
    recorder.start(250);
    camera.status = "recording";
    app.render();
    requestAnimationFrame(() => attachLiveCamera(app));
    requestAnimationFrame(() => scheduleVideoLimit(app));
  },
  "checkin.cameraPauseVideo": (app) => {
    const camera = checkinState(app).liveCamera;
    if (camera.status !== "recording" || camera.recorder?.state !== "recording" || typeof camera.recorder.pause !== "function") return;
    camera.recorder.pause();
    camera.pausedAt = Date.now();
    camera.status = "paused";
    if (camera.timer) clearTimeout(camera.timer);
    if (camera.countdownTimer) clearInterval(camera.countdownTimer);
    camera.timer = null;
    camera.countdownTimer = null;
    app.render();
    requestAnimationFrame(() => attachLiveCamera(app));
  },
  "checkin.cameraResumeVideo": (app) => {
    const camera = checkinState(app).liveCamera;
    if (camera.status !== "paused" || camera.recorder?.state !== "paused" || typeof camera.recorder.resume !== "function") return;
    camera.pausedDurationMs += Math.max(0, Date.now() - (camera.pausedAt || Date.now()));
    camera.pausedAt = null;
    camera.recorder.resume();
    camera.status = "recording";
    app.render();
    requestAnimationFrame(() => attachLiveCamera(app));
    requestAnimationFrame(() => scheduleVideoLimit(app));
  },
  "checkin.cameraRetakeVideo": (app) => {
    finishLiveVideoRecording(app, { discard: true });
  },
  "checkin.cameraStopVideo": (app) => {
    finishLiveVideoRecording(app);
  },
  "checkin.previewDraft": (app, el) => {
    const ui = checkinState(app);
    const draft = ui.drafts.find((d) => d.id === el.dataset.draftId);
    if (!draft) return;
    ui.previewDraftId = draft.id;
    app.render();
    if (draft.type === "video") {
      requestAnimationFrame(() => attachDraftVideoPreview(app));
    }
  },
  "checkin.closeDraftPreview": (app) => {
    checkinState(app).previewDraftId = null;
    app.render();
  },
  "checkin.deleteDraft": (app, el) => {
    const ui = checkinState(app);
    const draftId = el.dataset.draftId;
    const draft = ui.drafts.find((item) => item.id === draftId);
    if (!draft || ui.finish.submitting || isRetainedEvidenceLocked(draft)) return;
    ui.previewDraftId = null;
    app.showDialog({
      title: tx("删除该凭证？", "Delete this proof?"),
      body: tx("删除后不可恢复；如仍需要凭证，可以重新拍摄。", "This cannot be undone. You can capture another proof item if needed."),
      buttons: [
        { label: tx("取消", "Cancel"), action: "dialog.close" },
        { label: tx("删除", "Delete"), action: "checkin.deleteDraftConfirm", args: { "draft-id": draftId } },
      ],
    });
  },
  "checkin.deleteDraftConfirm": async (app, el) => {
    const ui = checkinState(app);
    const draft = ui.drafts.find((d) => d.id === el.dataset.draftId);
    if (!draft || ui.finish.submitting || isRetainedEvidenceLocked(draft)) return;
    try { await removeProofDraft(accountId(app), draftScope(app), draft.id); } catch { ui.captureError = tx("删除凭证保存失败，请重试。", "Cannot save proof removal. Retry."); app.render(); return; }
    if (draft?.url?.startsWith("blob:")) URL.revokeObjectURL(draft.url);
    ui.drafts = ui.drafts.filter((d) => d.id !== el.dataset.draftId);
    ui.previewDraftId = null;
    app.state.dialog = null;
    app.render();
  },
  "checkin.description": (app, el) => {
    const session = loadSession(accountId(app));
    if (!session || session.phase !== "finished") return;
    session.details.description = el.value.slice(0, MAX_DESCRIPTION);
    persist(app, session);
    const counter = app._viewport?.querySelector("[data-description-counter]");
    if (counter) counter.textContent = `${tx(`已输入 ${session.details.description.length}/${MAX_DESCRIPTION}`, `${session.details.description.length}/${MAX_DESCRIPTION} entered`)} · ${tx(`运动说明不能为空，最多 ${MAX_DESCRIPTION} 字`, `Exercise description is required and must be at most ${MAX_DESCRIPTION} characters.`)}`;
  },
  "checkin.submit": (app) => {
    const session = loadSession(accountId(app));
    if (!session || session.phase !== "finished") return;
    if (!app.isWriteAllowed()) return;
    submitCheckIn(app, session);
  },
  "checkin.submitProof": async (app) => {
    if (!app.isWriteAllowed()) return;
    const todo = selectedProofTodo(app);
    const ui = checkinState(app);
    const drafts = (ui.drafts || []).filter((draft) => draft.url);
    if (!todo?.recordId || ui.finish.submitting) return;
    if (drafts.some(d=>d.normalizationPending)) { ui.captureError=tx("请完成视频处理后再提交补证。", "Finish processing the video before submitting proof.");app.render();return; }
    if (!drafts.length) { void openLiveCamera(app,"photo"); return; }
    if (!app.isApiMode()) {
      apiFailureDialog(app, new ApiError(409, { code: "PROOF_PREVIEW_NOT_SUBMITTED" }), tx("未提交补证", "Proof not submitted"));
      return;
    }
    ui.finish.submitting = true;
    app.render();
    try {
      let intent = ui.proofSubmissionIntent;
      if (!intent || intent.recordId !== todo.recordId) {
        const [workflow, context] = await Promise.all([
          getRecordWorkflow(todo.recordId), getRecordEvidenceContext(todo.recordId),
        ]);
        if (workflow.stage !== "AWAITING_SUPPLEMENT" || !workflow.supplement ||
            workflow.supplement.paused || workflow.supplement.expired)
          throw new ApiError(409, { code: "CONFLICT_STATE_TRANSITION" });
        const mediaIds = workflow.materials.filter((item) => item.materialVersion === 1).map((item) => item.mediaId);
        for (const draft of drafts) {
          const blob = draft.blob || (await fetch(draft.url).then((response) => response.blob()));
          mediaIds.push(draft.mediaId || (await uploadMediaDraft(context.sessionId, draft, blob,{onProgress:progress=>{const label=uploadProgressLabel(progress);if(ui.mediaNotice!==label){ui.mediaNotice=label;app.render();}}})).mediaId);
        }
        intent = { recordId: todo.recordId, mediaIds: [...new Set(mediaIds)],
          expectedVersion: workflow.version, key: crypto.randomUUID() };
        ui.proofSubmissionIntent = intent;
      }
      await submitRecordSupplement(intent.recordId, intent.mediaIds, intent.expectedVersion, intent.key);
      try { await saveSuccessfulEvidence(originalOwnerId(app), intent.recordId, drafts); }
      catch { ui.mediaNotice = tx('补证已成功，相册保存待重试。', 'Supplement succeeded. Album saving will retry.'); }
      ui.proofSubmissionIntent = null;
      await clearProofDrafts(accountId(app), draftScope(app));
      ui.drafts = [];
      ui.focusProofRecordId = null;
      await app.reloadApiWorkspace();
      app.showDialog({ title: tx("补证已受理", "Supplement accepted"),
        body: tx("原记录的补证已由服务器受理，等待教师复核。", "The server accepted the supplement for the original record. Await teacher review."),
        buttons: [{ label: tx("确定", "OK"), action: "dialog.close" }] });
    } catch (error) {
      apiFailureDialog(app, error, tx("补证提交失败", "Supplement submission failed"));
    } finally {
      ui.finish.submitting = false;
      app.render();
    }
  },
  "checkin.abandon": (app) => {
    app.showDialog({
      title: tx("放弃待提交记录？", "Discard pending record?"),
      body: tx("本次运动时长和所有本地媒体草稿都会被删除。", "The exercise duration and all local media drafts will be deleted."),
      buttons: [
        { label: tx("取消", "Cancel"), action: "dialog.close" },
        { label: tx("确认放弃", "Discard"), action: "checkin.abandonConfirm" },
      ],
    });
  },
  "checkin.abandonConfirm": async (app) => {
    const ui = checkinState(app);
    const session = loadSession(accountId(app));
    if (app.isApiMode() && session?.serverId && session.phase !== "finished") {
      cancelServerSession(session.serverId, session.serverVersion, "student discarded").catch(() => {});
    }
    for (const draft of ui.drafts) if (draft.url?.startsWith("blob:")) URL.revokeObjectURL(draft.url);
    ui.drafts = [];
    await clearProofDrafts(accountId(app), draftScope(app)).catch(() => {});
    clearSession(accountId(app));
    app.state.dialog = null;
    app.render();
  },
  "checkin.viewRecords": (app) => {
    clearSession(accountId(app));
    checkinState(app).tab = "records";
    app.render();
  },
  "checkin.returnHome": (app) => {
    clearSession(accountId(app));
    checkinState(app).tab = "exercise";
    app.render();
  },
  "checkin.openRecord": (app, el) => {
    const ui = checkinState(app);
    ui.selectedRecordId = el.dataset.recordId;
    ui.recordOpenError = null;
    app.navDirection = "forward";
    app.render();
    const record = app.state.workspace.records.find((item) => item.id === ui.selectedRecordId);
    if (record) hydrateRecordDetail(app, record);
  },
  "checkin.recordBack": (app) => {
    checkinState(app).selectedRecordId = null;
    app.navDirection = "back";
    app.render();
  },
  "checkin.openProof": (app, el) => {
    const ui = checkinState(app);
    const source = el.dataset.source || "";
    if (source.startsWith("media:")) {
      // Real backend media: exchange the id for a short-lived access URL.
      createMediaAccessUrl(source.slice(6)).then(
        (access) => { globalThis.open(proxyObjectUrl(access.accessUrl), "_blank", "noopener"); },
        (error) => {
    ui.recordOpenError = toUserFacingError(error);
          app.render();
        }
      );
      ui.recordOpenError = null;
      return;
    }
    if (/^(https?:\/\/|blob:|data:)/.test(source)) {
      globalThis.open(source, "_blank", "noopener");
      ui.recordOpenError = null;
    } else {
      ui.recordOpenError = tx("该媒体文件没有可用的预览地址。", "This media file has no usable preview address.");
      app.render();
    }
  },
};

// Record detail back returns to the record list (返回规则).
export function checkinBackInterceptor(app) {
  if (app.screenKey() === "tab-checkin" && app.ui.checkin?.previewDraftId) {
    app.ui.checkin.previewDraftId = null;
    app.render();
    return true;
  }
  if (app.screenKey() === "tab-checkin" && app.ui.checkin?.selectedRecordId) {
    app.ui.checkin.selectedRecordId = null;
    app.navDirection = "back";
    app.render();
    return true;
  }
  return false;
}
