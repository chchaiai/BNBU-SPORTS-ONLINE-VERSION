// Help centre (#31), feedback (#32), about (#33), changelog (#34)
// — help/HelpCenterScreen.kt, feedback/FeedbackScreen.kt,
//   settings/AboutScreen.kt, settings/ChangelogScreen.kt.
// Feedback uses `/api/v1/feedback`; help uses the published, current-language
// `/api/v1/student/help-articles` projection with an explicitly labelled cache fallback.

import { t, tx, currentLocale } from "../i18n.js";
import { icon } from "../icons.js";
import { esc, spinner, emptyPlaceholder, validationPanel, sectionTitle, segmented, tonalButton, fieldLabel, fieldControlAttrs, fieldSupport, userFacingErrorPanel, focusFirstInvalidField, statusMessagePanel } from "../ui.js";
import { BUILD, localStore } from "../store.js";
import { FeedbackAttachmentError, accessFeedbackAttachment, feedbackAttachmentAccept, uploadFeedbackAttachment, createFeedback, listHelpArticles, listMyFeedback, toUserFacingError, currentApiUserId, currentApiSessionEpoch, isCurrentApiSessionEpoch } from "../api.js";
import { helpCategoryRank, renderHelpMarkdown, toHelpArticleView } from "../help-content.js";

const MAX_FEEDBACK_DESCRIPTION = 2000;
const feedbackCategories = () => [
  { value: "BUG", label: tx("功能异常", "Bug") },
  { value: "SUGGESTION", label: tx("功能建议", "Suggestion") },
  { value: "ACCESSIBILITY", label: tx("无障碍问题", "Accessibility") },
  { value: "PRIVACY", label: tx("隐私问题", "Privacy") },
  { value: "OTHER", label: tx("其他", "Other") },
];

function feedbackCategoryLabel(value) {
  return feedbackCategories().find((item) => item.value === value)?.label || value;
}

function backTitleRow(action) {
  return `<button class="row pressable" data-action="${action}" style="gap:8px;padding:12px 0 4px;width:100%;color:var(--color-on-surface)">
    ${icon("chevron-left", 24)}<span class="body-large">${tx("返回", "Back")}</span>
  </button>`;
}

// ── #31 Help centre ──

function helpState(app) {
  const locale = currentLocale() === "en-US" ? "en" : "zh-CN";
  const userId = currentApiUserId(), epoch = currentApiSessionEpoch();
  if (!app.ui.help || app.ui.help.locale !== locale || app.ui.help.userId !== userId || app.ui.help.epoch !== epoch) {
    app.ui.help = { locale, userId, epoch, loading: true, error: null, articles: [], cached: false, query: "", expandedId: null };
    void startHelpLoad(app);
  }
  return app.ui.help;
}

async function startHelpLoad(app) {
  const ui = app.ui.help;
  const locale = ui.locale;
  const current = () => app.ui.help === ui && isCurrentApiSessionEpoch(ui.epoch) && currentApiUserId() === ui.userId;
  const cached = localStore.getHelpArticles(locale, ui.userId);
  if (ui.articles.length === 0 && cached.length > 0) {
    ui.articles = cached.map(toHelpArticleView);
    ui.loading = false;
    ui.cached = true;
    app.render();
  }
  try {
    const projections = await listHelpArticles();
    if (!current()) return;
    localStore.setHelpArticles(locale, projections, ui.userId);
    ui.articles = projections.map(toHelpArticleView);
    ui.error = null;
    ui.cached = false;
  } catch {
    if (!current()) return;
    if (ui.articles.length > 0) {
      ui.error = null;
      ui.cached = true;
    } else {
      ui.error = tx("帮助内容暂时无法加载，请稍后重试。", "Help content could not be loaded. Try again later.");
    }
  } finally {
    if (!current()) return;
    ui.loading = false;
    app.render();
  }
}

export function renderHelpCenter(app) {
  const ui = helpState(app);
  const query = ui.query.trim().toLowerCase();
  const filtered = ui.articles.filter((a) => !query || a.title.toLowerCase().includes(query) || a.content.toLowerCase().includes(query) || a.category.toLowerCase().includes(query));
  const byCategory = new Map();
  for (const article of filtered) {
    const category = article.category || tx("其他", "Other");
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(article);
  }

  let body;
  if (ui.loading) {
    body = `<div class="row" style="justify-content:center;padding:32px 0">${spinner(32)}</div>`;
  } else if (ui.error) {
    body = `${emptyPlaceholder(tx("帮助内容加载失败", "Help content failed to load"), ui.error)}
      <button class="text-btn compact pressable" data-action="help.retry" style="padding:8px 0;align-self:flex-start">${tx("点击重试", "Try again")}</button>`;
  } else if (filtered.length === 0) {
    body = emptyPlaceholder(
      ui.articles.length === 0 ? tx("暂无帮助内容", "No help content") : tx("未找到相关帮助", "No matching help"),
      ui.articles.length === 0 ? tx("管理员尚未发布帮助内容。", "No help content has been published yet.") : tx("请尝试其他关键词。", "Try another keyword.")
    );
  } else {
    body = [...byCategory.entries()].sort((a, b) => helpCategoryRank(a[1][0]?.categoryCode) - helpCategoryRank(b[1][0]?.categoryCode))
      .map(([category, articles]) => `
        <div class="title-large text-on-surface">${esc(category)}</div>
        ${articles.map((article) => `<div class="swiss-panel help-article-card">
          <button class="help-article-toggle pressable" data-action="help.toggleArticle" data-article-id="${esc(article.id)}" aria-expanded="${ui.expandedId === article.id}">
            <span class="title-medium text-on-surface grow">${esc(article.title)}</span>
            <span class="text-muted" style="display:inline-flex">${icon(ui.expandedId === article.id ? "expand-less" : "expand-more", 22)}</span>
          </button>
          ${ui.expandedId === article.id ? renderHelpMarkdown(article.content) : ""}
        </div>`).join("")}`)
      .join("");
  }

  return `<div class="screen" style="background:transparent">
    <div class="screen-scroll" data-scroll-key="help">
      <div class="col" style="gap:16px">
        ${backTitleRow("support.back")}
        <div class="headline-small text-on-surface">${tx("帮助中心", "Help centre")}</div>
        <label class="sr-only" for="help-search-input">${tx("搜索帮助内容", "Search help content")}</label>
        <div class="help-search">
          <span class="text-muted" style="display:inline-flex">${icon("search", 20)}</span>
          <input ${fieldControlAttrs({ id: "help-search-input", helper: tx("按标题、分类或正文搜索", "Search titles, categories, or content") })} type="search" value="${esc(ui.query)}" placeholder="${tx("搜索帮助内容...", "Search help...")}" data-input="help.search" />
        </div>
        ${fieldSupport({ id: "help-search-input", helper: tx("按标题、分类或正文搜索", "Search titles, categories, or content") })}
        ${ui.cached ? `<div class="body-small text-muted">${tx("当前正在显示最近缓存的帮助内容。", "Showing the most recently cached help content.")}</div>` : ""}
        ${body}
        <div style="height:24px"></div>
      </div>
    </div>
  </div>`;
}

// ── #32 Feedback ──

function feedbackState(app) {
  const owner = `${currentApiUserId()}:${currentApiSessionEpoch()}`;
  if (!app.ui.feedback || app.ui.feedback.owner !== owner) {
    app.ui.feedback = {
      owner, attachments: [], uploading: false, preview: null,
      tab: "new",
      selectedCategory: "BUG",
      dropdownOpen: false,
      description: "",
      tickets: [],
      loadingTickets: false,
      submitting: false,
      error: null,
      invalidField: null,
      success: null,
    };
  }
  return app.ui.feedback;
}

export function feedbackStatusLabel(status) {
  const labels = {
    OPEN: ["待受理", "Pending"], IN_PROGRESS: ["受理中", "In progress"],
    WAITING_TECH: ["待技术团队处理", "Awaiting technical team"], RESOLVED: ["处理完成", "Resolved"],
    CLOSED: ["已关闭", "Closed"],
  };
  return labels[status] ? tx(...labels[status]) : tx("状态暂不可用", "Status unavailable");
}

export function renderFeedback(app) {
  const ui = feedbackState(app);
  const serviceUnavailable = !app.isApiMode();
  const writeEnabled = app.isWriteAllowed() && !serviceUnavailable;
  const formEnabled = writeEnabled && !ui.submitting && !ui.uploading && !ui.submissionIntent;

  let body;
  if (ui.tab === "new") {
    body = `
      ${!writeEnabled ? validationPanel(serviceUnavailable
        ? tx("当前没有可用的后端登录会话，暂时无法提交反馈。", "There is no active backend session, so feedback cannot be submitted.")
        : tx("系统当前处于维护模式，暂时无法提交反馈。", "The system is under maintenance; feedback submission is unavailable.")) : ""}
      <div class="swiss-panel"><div class="col" style="gap:12px">
        <span class="title-medium text-on-surface">${tx("问题内容", "Problem details")}</span>
        <span class="body-small text-muted">${tx("请选择问题类型并描述你遇到的情况。", "Choose a category and describe what happened.")}</span>
        <div class="col" style="position:relative">
          ${fieldLabel({ id: "feedback-category", label: tx("问题类型", "Category"), required: true })}
          <button id="feedback-category" class="text-field row pressable" type="button" role="combobox" aria-haspopup="listbox" aria-expanded="${ui.dropdownOpen}" aria-required="true" data-action="feedback.toggleDropdown" ${formEnabled ? "" : "disabled"} style="justify-content:space-between;text-align:left">
            <span>${esc(feedbackCategoryLabel(ui.selectedCategory))}</span>
            <span class="text-muted" style="display:inline-flex">${icon(ui.dropdownOpen ? "expand-less" : "expand-more", 20)}</span>
          </button>
          ${ui.dropdownOpen ? `<div class="feedback-dropdown" role="listbox" aria-label="${tx("问题类型", "Category")}">${feedbackCategories()
            .map((category) => `<button class="feedback-dropdown-item pressable" type="button" role="option" aria-selected="${category.value === ui.selectedCategory}" data-action="feedback.selectCategory" data-value="${esc(category.value)}">${esc(category.label)}</button>`)
            .join("")}</div>` : ""}
        </div>
        <div class="col">
          ${fieldLabel({ id: "feedback-description", label: tx("问题描述", "Description"), required: true })}
          <textarea ${fieldControlAttrs({ id: "feedback-description", error: ui.invalidField === "description" ? tx("请填写问题描述。", "Describe the problem.") : null, helper: tx("请包含操作步骤、期望结果和实际情况", "Include steps, expected result, and actual result"), required: true })} class="text-field" rows="5" maxlength="${MAX_FEEDBACK_DESCRIPTION}" placeholder="${tx("例如：操作步骤、预期结果和实际情况", "Include the steps, expected result, and actual result")}" data-input="feedback.description" ${formEnabled ? "" : "disabled"}>${esc(ui.description)}</textarea>
          ${fieldSupport({ id: "feedback-description", error: ui.invalidField === "description" ? tx("请填写问题描述。", "Describe the problem.") : null, helper: `${ui.description.length}/${MAX_FEEDBACK_DESCRIPTION} · ${tx("请包含操作步骤、期望结果和实际情况", "Include steps, expected result, and actual result")}` }).replace("class=\"field-supporting\"", 'class="field-supporting" data-feedback-counter')}
        </div>
        <section class="feedback-upload-area" aria-label="${tx("添加反馈附件", "Add attachments")}">
          <div class="feedback-upload-heading"><span class="title-small">${tx("添加附件", "Attachments")} <small>${tx("选填", "Optional")}</small></span><span>${ui.attachments.length} / 5</span></div>
          <p class="feedback-upload-caption">${tx("上传截图或录屏，帮助我们更快了解问题", "A screenshot or recording helps us understand the problem")}</p>
          <div class="feedback-upload-options">${[
            ["image", "photo", tx("图片", "Image"), "10 MB"],
            ["video", "videocam", tx("视频", "Video"), "50 MB"],
            ["file", "upload-file", tx("文件", "File"), "20 MB"],
          ].map(([kind, iconName, label, limit]) => `<button type="button" class="feedback-upload-option pressable" data-action="feedback.pick" data-kind="${kind}" ${formEnabled && ui.attachments.length < 5 ? "" : "disabled"}><span class="feedback-upload-option-icon ${kind}">${icon(iconName, 23)}</span><b>${label}</b><small>≤ ${limit}</small></button>`).join("")}</div>
          <input id="feedback-files" aria-label="${tx("反馈附件", "Feedback attachments")}" type="file" accept="${feedbackAttachmentAccept}" multiple data-change="feedback.files" ${formEnabled && ui.attachments.length < 5 ? "" : "disabled"} hidden/>
          ${ui.uploading ? `<div class="feedback-upload-working" role="status">${spinner(16)}<span>${esc(ui.uploadLabel || tx("正在上传并检查附件…", "Uploading and checking…"))}</span><i></i></div>` : ""}
          <div class="feedback-upload-items">${ui.attachments.map(item => `<div class="feedback-upload-item"><div class="feedback-upload-thumb ${item.mimeType.startsWith("video/") ? "video" : ""}">${item.thumbnail ? `<img src="${esc(item.thumbnail)}" alt=""/>` : icon(item.mimeType.startsWith("video/") ? "videocam" : "upload-file", 23)}</div><div class="feedback-upload-file"><b>${esc(item.fileName)}</b><small>${item.size < 1048576 ? Math.max(1, Math.round(item.size/1024)) + " KB" : (item.size/1048576).toFixed(1) + " MB"}<span>${icon("check", 12)}${tx("已上传", "Uploaded")}</span></small></div><button type="button" class="feedback-upload-remove pressable" aria-label="${tx("移除", "Remove")} ${esc(item.fileName)}" data-action="feedback.removeAttachment" data-id="${esc(item.id)}" ${formEnabled ? "" : "disabled"}>${icon("close", 17)}</button></div>`).join("")}</div>
          <p class="feedback-upload-privacy">${icon("lock", 13)}<span>${tx("附件仅你和管理员可见", "Only you and administrators can view attachments")}</span></p>
          <details class="feedback-upload-formats"><summary>${tx("支持哪些文件？", "Supported formats")}</summary>JPG · PNG · WebP · MP4 · MOV · WebM · PDF · Word · Excel · PPT · ZIP · TXT · CSV</details>
        </section>
      </div></div>
      ${ui.success ? statusMessagePanel(ui.success, "feedback.dismissSuccess") : ""}
      <button class="primary-btn pressable${ui.submitting ? " is-loading" : ""}" data-action="feedback.submit" ${writeEnabled && !ui.submitting && !ui.uploading ? "" : "disabled"}>
        ${ui.submitting ? spinner(18, "on-primary") : icon("send", 20)}<span>${tx("提交问题", "Submit report")}</span>
      </button>`;
  } else {
    body = `
      ${ui.loadingTickets
        ? `<div class="row" style="justify-content:center">${spinner(28)}</div>`
          : ui.tickets.length === 0
            ? emptyPlaceholder(tx("暂无已提交问题", "No reports yet"), tx("提交问题后，可在这里查看处理状态。", "After submitting a report, you can track its status here."))
            : ui.tickets.map((ticket) => `<div class="swiss-panel col" style="gap:8px">
                <div class="row"><span class="title-medium grow">${esc(feedbackCategoryLabel(ticket.category))}</span><span class="label-medium text-primary">${esc(feedbackStatusLabel(ticket.status))}</span></div>
                <div class="body-medium text-on-surface">${esc(ticket.content)}</div>
                ${(ticket.attachments || []).map(item => `<button class="text-btn compact" style="text-align:left;overflow-wrap:anywhere" data-action="feedback.openAttachment" data-id="${esc(item.id)}">${esc(item.fileName)} · ${(item.size/1024/1024).toFixed(1)} MB ↗</button>`).join("")}
                ${(ticket.publicReplies?.length ? ticket.publicReplies : ticket.publicReply ? [{ publicReply: ticket.publicReply }] : []).map(reply => `<div class="body-small text-muted">${tx("公开回复：", "Public reply: ")}${esc(reply.publicReply)}</div>`).join("")}
                <div class="body-small text-muted">${esc(ticket.createdAt || "")}</div>
              </div>`).join("")}
      ${tonalButton({ label: tx("刷新处理状态", "Refresh status"), iconName: "refresh", action: "feedback.refreshTickets", disabled: ui.loadingTickets || serviceUnavailable })}`;
  }

  return `<div class="screen" style="background:transparent">
    <div class="screen-scroll" data-scroll-key="feedback">
      <div class="col" style="gap:16px">
        ${backTitleRow("support.back")}
        ${sectionTitle(tx("问题反馈", "Report a problem"))}
        ${segmented({
          items: [
            { value: "new", label: tx("提交问题", "New report") },
            { value: "tickets", label: tx("我的反馈", "My reports") },
          ],
          selected: ui.tab,
          action: "feedback.tab",
        })}
        ${ui.error ? userFacingErrorPanel(ui.error, { compact: true }) : ""}
        ${body}
        ${ui.preview ? `<div class="swiss-panel col" style="gap:12px">${ui.preview.mimeType.startsWith("image/") ? `<img src="${esc(ui.preview.url)}" alt="${esc(ui.preview.fileName)}" style="max-width:100%;max-height:60vh;object-fit:contain"/>` : ui.preview.mimeType.startsWith("video/") ? `<video controls playsinline src="${esc(ui.preview.url)}" style="max-width:100%;max-height:60vh"></video>` : ""}<a href="${esc(ui.preview.url)}" target="_blank" rel="noopener noreferrer">${tx("打开 / 下载附件", "Open / download attachment")}：${esc(ui.preview.fileName)}</a><button class="text-btn" data-action="feedback.closeAttachment">${tx("收起", "Close")}</button></div>` : ""}
        <div style="height:24px"></div>
      </div>
    </div>
  </div>`;
}

// ── #33 About / #34 Changelog ──

export function renderAbout(app) {
  return `<div class="screen" style="background:transparent">
    <div class="screen-scroll" data-scroll-key="about">
      <div class="col" style="gap:16px">
        ${backTitleRow("support.back")}
        <div class="headline-small text-on-surface">${t("profile_about")}</div>
        <div class="swiss-panel">
          <div class="title-large text-on-surface">${t("app_name")}</div>
          <div style="height:8px"></div>
          <div class="body-medium text-muted">${t("profile_version")} ${BUILD.VERSION_NAME}</div>
        </div>
        <button class="swiss-panel pressable" data-action="support.openChangelog" style="text-align:left">
          <div class="row" style="gap:12px">
            <span class="text-primary" style="display:inline-flex">${icon("refresh", 20)}</span>
            <span class="title-medium text-on-surface grow">${t("profile_changelog")}</span>
            <span class="text-muted" style="display:inline-flex">${icon("chevron-right", 20)}</span>
          </div>
        </button>
      </div>
    </div>
  </div>`;
}

export function renderChangelog(app) {
  const items = [t("changelog_feature_core"), t("changelog_feature_support"), t("changelog_feature_offline")];
  return `<div class="screen" style="background:transparent">
    <div class="screen-scroll" data-scroll-key="changelog">
      <div class="col" style="gap:16px">
        ${backTitleRow("support.changelogBack")}
        <div class="headline-small text-on-surface">${t("changelog_title")}</div>
        <div class="swiss-panel">
          <div class="title-large text-on-surface">${BUILD.VERSION_NAME}</div>
          <div style="height:4px"></div>
          <div class="label-large text-primary">${t("changelog_initial_release")}</div>
          <div style="height:14px"></div>
          ${items.map((text) => `<div class="row" style="align-items:flex-start;margin-bottom:10px">
            <span class="body-medium text-primary">•</span>
            <span style="width:8px"></span>
            <span class="body-medium text-muted grow">${esc(text)}</span>
          </div>`).join("")}
        </div>
        <div style="height:24px"></div>
      </div>
    </div>
  </div>`;
}

async function loadFeedbackTickets(app) {
  const ui = feedbackState(app);
  if (!app.isApiMode()) return;
  ui.loadingTickets = true;
  ui.error = null;
  app.render();
  try {
    ui.tickets = await listMyFeedback();
  } catch (error) {
    ui.error = toUserFacingError(error);
  } finally {
    ui.loadingTickets = false;
    app.render();
  }
}

export const supportActions = {
  "support.back": (app) => app.handleBack(),
  "support.openChangelog": (app) => app.openSub("changelog"),
  "support.changelogBack": (app) => {
    app.navDirection = "back";
    app.openSub("about");
  },
  // — Help —
  "help.retry": (app) => {
    const ui = helpState(app);
    ui.loading = true;
    ui.error = null;
    app.render();
    void startHelpLoad(app);
  },
  "help.search": (app, el) => {
    const ui = helpState(app);
    ui.query = el.value;
    if (!ui.loading && !ui.error) app.render();
  },
  "help.toggleArticle": (app, el) => {
    const ui = helpState(app);
    ui.expandedId = ui.expandedId === el.dataset.articleId ? null : el.dataset.articleId;
    app.render();
  },
  // — Feedback —
  "feedback.pick": (app, el) => {
    const ui = feedbackState(app); if (ui.uploading || ui.submitting || ui.submissionIntent) return;
    const input = app._viewport?.querySelector("#feedback-files"); if (!input) return;
    input.accept = el.dataset.kind === "image" ? ".jpg,.jpeg,.png,.webp" : el.dataset.kind === "video" ? ".mp4,.mov,.webm" : feedbackAttachmentAccept;
    input.click();
  },
  "feedback.files": async (app, el) => {
    const ui = feedbackState(app), files = Array.from(el.files || []), epoch = currentApiSessionEpoch();
    el.value = "";
    if (ui.uploading || ui.submitting || ui.submissionIntent || !app.isWriteAllowed() || !app.isApiMode()) return;
    ui.uploading = true; ui.error = null; app.render();
    try {
      if (files.length + ui.attachments.length > 5) throw new FeedbackAttachmentError(tx("每条反馈最多上传 5 个附件。", "Up to 5 attachments per report."));
      for (const [index, file] of files.entries()) { ui.uploadLabel = `${tx("正在上传", "Uploading")} ${index+1}/${files.length} · ${file.name}`; app.render(); const item = await uploadFeedbackAttachment(file); if (!isCurrentApiSessionEpoch(epoch)) return; ui.attachments.push(item); app.render(); }
    } catch (error) { if(isCurrentApiSessionEpoch(epoch)) ui.error = error instanceof FeedbackAttachmentError ? {...toUserFacingError(error, {log:false}), title:tx("请检查附件", "Check the attachment"), message:error.message, action:tx("调整附件后重试。", "Adjust attachments and try again.")} : toUserFacingError(error); }
    finally { ui.uploading = false; if(isCurrentApiSessionEpoch(epoch)) app.render(); }
  },
  "feedback.removeAttachment": (app, el) => { const ui = feedbackState(app); if (ui.uploading || ui.submitting || ui.submissionIntent) return; ui.attachments = ui.attachments.filter(item => item.id !== el.dataset.id); app.render(); },
  "feedback.openAttachment": async (app, el) => {
    const ui = feedbackState(app), epoch=currentApiSessionEpoch();
    const item = ui.tickets.flatMap(ticket => ticket.attachments || []).find(file => file.id === el.dataset.id); if (!item) return;
    try { const result = await accessFeedbackAttachment(item.id); if (!isCurrentApiSessionEpoch(epoch)) return; ui.preview = {...item,url:result.url}; }
    catch(error) { if(isCurrentApiSessionEpoch(epoch)) ui.error = error instanceof FeedbackAttachmentError ? {...toUserFacingError(error, {log:false}), title:tx("请检查附件", "Check the attachment"), message:error.message, action:tx("调整附件后重试。", "Adjust attachments and try again.")} : toUserFacingError(error); }
    if(isCurrentApiSessionEpoch(epoch)) { app.render(); app._viewport?.querySelector('video, img[alt]')?.scrollIntoView({block:'nearest'}); }
  },
  "feedback.closeAttachment": app => {feedbackState(app).preview=null;app.render();},
  "feedback.tab": async (app, el) => {
    const ui = feedbackState(app);
    ui.tab = el.dataset.value;
    ui.error = null;
    app.render();
    if (ui.tab === "tickets") await loadFeedbackTickets(app);
  },
  "feedback.toggleDropdown": (app) => {
    const ui = feedbackState(app);
    ui.dropdownOpen = !ui.dropdownOpen;
    app.render();
  },
  "feedback.selectCategory": (app, el) => {
    const ui = feedbackState(app);
    ui.selectedCategory = el.dataset.value;
    ui.dropdownOpen = false;
    app.render();
  },
  "feedback.description": (app, el) => {
    const ui = feedbackState(app);
    ui.description = el.value.slice(0, MAX_FEEDBACK_DESCRIPTION);
    if (ui.invalidField === "description") ui.invalidField = null;
    const counter = app._viewport?.querySelector("[data-feedback-counter]");
    if (counter) counter.textContent = `${ui.description.length}/${MAX_FEEDBACK_DESCRIPTION} · ${tx("请包含操作步骤、期望结果和实际情况", "Include steps, expected result, and actual result")}`;
  },
  "feedback.dismissSuccess": (app) => {
    feedbackState(app).success = null;
    app.render();
  },
  "feedback.submit": async (app) => {
    const ui = feedbackState(app);
    if (ui.uploading || ui.submitting || !app.isWriteAllowed() || !app.isApiMode()) return;
    const content = ui.description.trim();
    if (!content) {
      ui.invalidField = "description";
      ui.error = null;
      app.render();
      focusFirstInvalidField(app._viewport, ["#feedback-description"]);
      return;
    }
    ui.submitting = true;
    ui.invalidField = null;
    ui.error = null;
    app.render();
    try {
      const intent = ui.submissionIntent || {
        input: { category: ui.selectedCategory, content, attachmentIds: ui.attachments.map(item => item.id) }, key: crypto.randomUUID(),
      };
      ui.submissionIntent = intent;
      const created = await createFeedback(intent.input, intent.key);
      ui.submissionIntent = null;
      ui.tickets = [created, ...ui.tickets.filter(ticket => ticket.id !== created.id)];
      ui.description = "";
      ui.attachments = [];
      ui.success = tx("反馈已提交，可在“我的反馈”中查看后端处理状态。", "Feedback submitted. Track its backend status under My reports.");
    } catch (error) {
      if ([401, 403, 404, 422].includes(error?.status)) ui.submissionIntent = null;
      ui.error = toUserFacingError(error);
      if (ui.error.fieldErrors?.some((item) => item.field === "content")) {
        ui.invalidField = "description";
      }
    } finally {
      ui.submitting = false;
      app.render();
      if (ui.invalidField) focusFirstInvalidField(app._viewport, ["#feedback-description"]);
    }
  },
  "feedback.refreshTickets": (app) => loadFeedbackTickets(app),
};
