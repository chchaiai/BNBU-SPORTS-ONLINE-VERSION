"use client";

import { useEffect, useRef, useState } from "react";
import { AppSelect } from "./app-select";
import { pageItems } from "./admin-domain";
import { adminCopy, adminLabel } from "./admin-i18n";
import {
  adminApiErrorText,
  saveHelpArticle,
  transitionHelpArticle,
} from "./admin-service";
import { useAdminStore } from "./admin-store";
import type { AdminLocale, HelpArticle, HelpArticleInput, HelpArticleStatus } from "./admin-types";
import { AdminBadge, AdminConfirm, AdminDialog, AdminEmpty, AdminField, AdminInlineError, AdminPagination, AdminSectionHeading, formatAdminDate, type AdminTone } from "./admin-components";
import { ErrorPanel } from "./error-panel";
import { HELP_CATEGORIES, HelpArticleMarkdown, helpCategoryLabel } from "./help-content";
import { createHelpSaveIntent, listAdminHelp, type AdminHelpArticle } from "./help-api";
import { ApiError, apiSessionUserId } from './api-client';

type RealHelpEditor = { save: (input: HelpArticleInput) => Promise<boolean>; busy: boolean; locked: boolean; error: string; initial?: HelpArticleInput; pendingStatus?: HelpArticleStatus };

type HelpFilter = "all" | HelpArticleStatus;

function statusTone(status: HelpArticleStatus): AdminTone {
  return status === "published" ? "green" : status === "draft" ? "orange" : "gray";
}

function ArticleDialog({ locale, article, close, real }: { locale: AdminLocale; article?: HelpArticle; close: () => void; real?: RealHelpEditor }) {
  const { busyKey, error, clearError, run } = useAdminStore();
  const initial: HelpArticleInput = real?.initial ?? (article ? {
    id: article.id,
    titleZh: article.titleZh,
    titleEn: article.titleEn,
    bodyZh: article.bodyZh,
    bodyEn: article.bodyEn,
    keywords: article.keywords,
    category: article.category,
    status: article.status,
    sortWeight: article.sortWeight,
    expectedUpdatedAt: article.updatedAt,
  } : { titleZh: "", titleEn: "", bodyZh: "", bodyEn: "", keywords: [], category: "login", status: "draft", sortWeight: 0 });
  const [form, setForm] = useState<HelpArticleInput>(initial);
  const [keywordText, setKeywordText] = useState(initial.keywords.join(", "));
  const [previewLocale, setPreviewLocale] = useState<AdminLocale>(locale);
  const key = `help.save.${article?.id ?? "new"}`;
  const dirty = JSON.stringify(form) !== JSON.stringify(initial) || keywordText !== initial.keywords.join(", ");
  useEffect(() => () => clearError(), [clearError]);
  const update = <K extends keyof HelpArticleInput>(field: K, value: HelpArticleInput[K]) => setForm((current) => ({ ...current, [field]: value }));
  const submit = async (status: HelpArticleStatus) => {
    if (real) {
      if (await real.save({ ...form, status, keywords: keywordText.split(/[,，]/).map(item => item.trim()).filter(Boolean) })) close();
      return;
    }
    const result = await run(key, () => saveHelpArticle({ ...form, status, keywords: keywordText.split(/[,，]/).map((item) => item.trim()).filter(Boolean) }), adminCopy(locale, "article_saved"));
    if (result) close();
  };
  const disabled = (status: HelpArticleStatus) => real?.busy || busyKey === key || Boolean(real?.pendingStatus && real.pendingStatus !== status);
  return (
    <AdminDialog locale={locale} title={adminCopy(locale, article ? "edit_article" : "create_article")} description={adminCopy(locale, "help_audience")} close={close} dirty={dirty} wide footer={<>
      <button className="secondary-button" type="button" disabled={real?.locked} onClick={close}>{adminCopy(locale, "cancel")}</button>
      {!article && <button className="secondary-button" type="button" disabled={disabled('draft')} onClick={() => void submit("draft")}>{adminCopy(locale, "save_draft")}</button>}
      {article && <button className="secondary-button" type="button" disabled={disabled(article.status)} onClick={() => void submit(article.status)}>{busyKey === key ? adminCopy(locale, "processing") : adminCopy(locale, "save")}</button>}
      {(!article || article.status === "draft" || article.status === "archived") && <button className="primary-button" type="button" disabled={disabled('published')} onClick={() => void submit("published")}>{busyKey === key ? adminCopy(locale, "processing") : adminCopy(locale, article?.status === "archived" ? "republish" : "save_publish")}</button>}
    </>}>
      <div className="admin-article-editor">
        <div className="admin-form-grid two-columns admin-article-editor-form">
          <AdminField locale={locale} label={adminCopy(locale, "title_chinese")} required errorCode={error?.fieldErrors.titleZh}><input disabled={real?.locked} value={form.titleZh} onChange={(event) => update("titleZh", event.target.value)} /></AdminField>
          <AdminField locale={locale} label={adminCopy(locale, "title_english")} required errorCode={error?.fieldErrors.titleEn}><input disabled={real?.locked} value={form.titleEn} onChange={(event) => update("titleEn", event.target.value)} /></AdminField>
          <AdminField locale={locale} label={adminCopy(locale, "body_chinese")} required errorCode={error?.fieldErrors.bodyZh}><textarea disabled={real?.locked} className="admin-article-body" value={form.bodyZh} onChange={(event) => update("bodyZh", event.target.value)} /></AdminField>
          <AdminField locale={locale} label={adminCopy(locale, "body_english")} required errorCode={error?.fieldErrors.bodyEn}><textarea disabled={real?.locked} className="admin-article-body" value={form.bodyEn} onChange={(event) => update("bodyEn", event.target.value)} /></AdminField>
          <AdminField locale={locale} label={adminCopy(locale, "keywords")} required errorCode={error?.fieldErrors.keywords}><input disabled={real?.locked} value={keywordText} onChange={(event) => setKeywordText(event.target.value)} /></AdminField>
          <AdminField locale={locale} label={adminCopy(locale, "category")} required errorCode={error?.fieldErrors.category}><AppSelect disabled={real?.locked} label={adminCopy(locale, "category")} value={form.category} options={HELP_CATEGORIES.map((value) => ({ value, label: helpCategoryLabel(locale, value) }))} onChange={(value) => value && update("category", String(value))} /></AdminField>
          <AdminField locale={locale} label={adminCopy(locale, "sort_weight")} required errorCode={error?.fieldErrors.sortWeight}><input disabled={real?.locked} type="number" value={form.sortWeight} onChange={(event) => update("sortWeight", Number(event.target.value))} /></AdminField>
        </div>
        <section className="admin-article-preview">
          <div><h3>{adminCopy(locale, "preview")}</h3><div className="admin-view-tabs compact"><button type="button" className={previewLocale === "zh" ? "selected" : ""} onClick={() => setPreviewLocale("zh")}>中文</button><button type="button" className={previewLocale === "en" ? "selected" : ""} onClick={() => setPreviewLocale("en")}>English</button></div></div>
          <article><h2>{previewLocale === "en" ? form.titleEn : form.titleZh}</h2><HelpArticleMarkdown markdown={previewLocale === "en" ? form.bodyEn : form.bodyZh} /></article>
        </section>
      </div>
      {real ? <AdminInlineError message={real.error} /> : error?.userFacingError
        ? <ErrorPanel error={error.userFacingError} locale={locale} />
        : <AdminInlineError message={error?.message} />}
    </AdminDialog>
  );
}

function DemoAdminHelp({ locale }: { locale: AdminLocale }) {
  const { state, busyKey, run, mode } = useAdminStore();
  const [realRows, setRealRows] = useState<AdminHelpArticle[]>([]);
  const [realError, setRealError] = useState('');
  const [realBusy, setRealBusy] = useState(false);
  const [unresolved, setUnresolved] = useState(false);
  const pending = useRef<ReturnType<typeof createHelpSaveIntent> | null>(null);
  const inFlight = useRef(false);
  const restored = useRef(false);
  const pendingStorage = useRef<string | null>(null);
  const [recoveredInput, setRecoveredInput] = useState<HelpArticleInput>();
  const storageKey = () => {
    const userId = apiSessionUserId();
    if (!userId) throw new Error('HELP_LOGIN_REQUIRED');
    return 'bnbu-help-pending-v1:' + userId;
  };
  const load = () => listAdminHelp().then(setRealRows);
  useEffect(() => { if (mode === 'real') void load().then(() => {
    if (restored.current) return;
    restored.current = true;
    const raw = sessionStorage.getItem(storageKey());
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!saved || !/^[0-9a-f-]{36}$/i.test(saved.key) || !saved.body || !saved.input ||
      !['draft', 'published', 'archived'].includes(saved.body.status) || !Array.isArray(saved.body.keywords) ||
      !saved.body.keywords.every((value: unknown) => typeof value === 'string') ||
      !['titleZh', 'titleEn', 'bodyZh', 'bodyEn', 'category'].every(field => typeof saved.body[field] === 'string') ||
      !Number.isInteger(saved.body.expectedVersion) || saved.body.expectedVersion < 0 || !Number.isFinite(saved.body.sortWeight) ||
      (saved.id !== null && !/^[0-9a-f-]{36}$/i.test(saved.id))) throw new Error('HELP_PENDING_INVALID');
    pending.current = createHelpSaveIntent(saved.id, saved.body, saved.key);
    pendingStorage.current = raw;
    setRecoveredInput(saved.input);
    setEditing(saved.editing); setTransition(saved.transition); setUnresolved(true);
    setRealError(locale === 'zh' ? '已恢复未确认的提交，请按原内容重试。' : 'An unconfirmed submission was restored. Retry the original content.');
  }).catch(failure => setRealError(adminApiErrorText(failure, locale))); }, [mode, locale]);
  const realSave = async (input: HelpArticleInput) => {
    if (inFlight.current) return false;
    inFlight.current = true; setRealBusy(true); setRealError('');
    let committed = false;
    try {
      if (!pending.current) {
        const row = input.id ? realRows.find(item => item.id === input.id) : undefined;
        if (input.id && (!row || row.updatedAt !== input.expectedUpdatedAt)) throw new ApiError(409, { code: 'CONFLICT_VERSION_MISMATCH' });
        pending.current = createHelpSaveIntent(input.id ?? null, {
          titleZh: input.titleZh, titleEn: input.titleEn, bodyZh: input.bodyZh, bodyEn: input.bodyEn,
          keywords: input.keywords, category: input.category, sortWeight: input.sortWeight,
          status: input.status, expectedVersion: row?.version ?? 0,
        });
        pendingStorage.current = JSON.stringify({ id: input.id ?? null, body: pending.current.body,
          key: pending.current.key, input, editing, transition });
      }
      if (!pendingStorage.current) throw new Error('HELP_PENDING_MISSING');
      sessionStorage.setItem(storageKey(), pendingStorage.current);
      await pending.current.run(); committed = true; await load();
      sessionStorage.removeItem(storageKey());
      pending.current = null; pendingStorage.current = null; setRecoveredInput(undefined); setUnresolved(false); return true;
    } catch (failure) {
      const uncertain = Boolean(pending.current) && (committed || !(failure instanceof ApiError) || failure.status >= 500 || failure.status === 0 || failure.code === 'CONFLICT_REQUEST_IN_PROGRESS');
      setUnresolved(uncertain);
      if (!uncertain) {
        pending.current = null; pendingStorage.current = null; setRecoveredInput(undefined);
        sessionStorage.removeItem(storageKey());
        if (failure instanceof ApiError && failure.status === 409) {
          try { await load(); } catch { /* Keep the original conflict visible; reopening after refresh remains available. */ }
        }
      }
      setRealError(uncertain ? (locale === 'zh' ? '提交结果尚未确认，请按原内容重试。' : 'The submission is unconfirmed. Retry the original content.') : adminApiErrorText(failure, locale));
      return false;
    } finally { inFlight.current = false; setRealBusy(false); }
  };
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<HelpFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<HelpArticle | "new" | null>(null);
  const [transition, setTransition] = useState<{ article: HelpArticle; nextStatus: "published" | "archived" } | null>(null);
  if (!state) return null;
  const query = search.trim().toLowerCase();
  const articles = mode === 'real' ? realRows : state.helpArticles;
  const filtered = articles.filter((article) => (statusFilter === "all" || article.status === statusFilter)
    && (categoryFilter === "all" || article.category === categoryFilter)
    && (!query || [article.titleZh, article.titleEn, ...article.keywords].some((value) => value.toLowerCase().includes(query))))
    .sort((left, right) => right.sortWeight - left.sortWeight || right.updatedAt.localeCompare(left.updatedAt));
  const paged = pageItems(filtered, page, 5);
  const published = articles.filter((article) => article.status === "published").length;
  const drafts = articles.filter((article) => article.status === "draft").length;
  const archived = articles.filter((article) => article.status === "archived").length;
  const transitionKey = transition ? `help.transition.${transition.article.id}` : "";
  const confirmTransition = async () => {
    if (!transition) return;
    if (mode === 'real') {
      if (await realSave({ ...transition.article, status: transition.nextStatus, expectedUpdatedAt: transition.article.updatedAt })) setTransition(null);
      return;
    }
    const result = await run(transitionKey, () => transitionHelpArticle(transition.article.id, transition.nextStatus), adminCopy(locale, transition.nextStatus === "published" ? "article_published" : "article_archived"));
    if (result) setTransition(null);
  };
  return (
    <div className="admin-page-stack admin-help-page admin-help-demo">
      <section className="admin-summary-grid three admin-help-summary" aria-label={locale === "zh" ? "帮助文章概况" : "Help article overview"}>
        <button className={statusFilter === "published" ? "is-active" : ""} type="button" aria-pressed={statusFilter === "published"} onClick={() => { setStatusFilter("published"); setPage(1); }}><span>{adminLabel(locale, "helpStatus", "published")}</span><b>{published}</b><small>{adminCopy(locale, "help_audience")}</small></button>
        <button className={statusFilter === "draft" ? "is-active" : ""} type="button" aria-pressed={statusFilter === "draft"} onClick={() => { setStatusFilter("draft"); setPage(1); }}><span>{adminLabel(locale, "helpStatus", "draft")}</span><b>{drafts}</b><small>{adminCopy(locale, "content_incomplete")}</small></button>
        <button className={statusFilter === "archived" ? "is-active" : ""} type="button" aria-pressed={statusFilter === "archived"} onClick={() => { setStatusFilter("archived"); setPage(1); }}><span>{adminLabel(locale, "helpStatus", "archived")}</span><b>{archived}</b><small>{adminCopy(locale, "republish")}</small></button>
      </section>
      <section className="admin-surface admin-table-surface admin-help-surface">
        {mode === 'real' && <AdminInlineError message={realError} />}
        <AdminSectionHeading title={adminCopy(locale, "help_articles")} description={adminCopy(locale, "help_audience")} action={<button className="primary-button" type="button" onClick={() => setEditing("new")}>{adminCopy(locale, "create_article")}</button>} />
        <div className="admin-filter-row admin-help-filters">
          <label className="admin-search"><span aria-hidden="true">⌕</span><input type="search" aria-label={adminCopy(locale, "help_search")} value={search} placeholder={adminCopy(locale, "help_search")} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
          <AppSelect label={adminCopy(locale, "article_status_filter")} value={statusFilter} options={[{ value: "all", label: adminCopy(locale, "all") }, ...(["published", "draft", "archived"] as HelpArticleStatus[]).map((value) => ({ value, label: adminLabel(locale, "helpStatus", value) }))]} onChange={(value) => { if (value) { setStatusFilter(value as HelpFilter); setPage(1); } }} />
          <AppSelect label={adminCopy(locale, "category_filter")} value={categoryFilter} options={[{ value: "all", label: adminCopy(locale, "all") }, ...HELP_CATEGORIES.map((value) => ({ value, label: helpCategoryLabel(locale, value) }))]} onChange={(value) => { if (value) { setCategoryFilter(String(value)); setPage(1); } }} />
          {(search || statusFilter !== "all" || categoryFilter !== "all") && <button className="text-button" type="button" onClick={() => { setSearch(""); setStatusFilter("all"); setCategoryFilter("all"); setPage(1); }}>{adminCopy(locale, "clear_filters")}</button>}
        </div>
        {paged.items.length === 0 ? <AdminEmpty locale={locale} filtered /> : <div className="admin-article-list admin-help-article-list">{paged.items.map((article) => <article className="admin-help-article" key={article.id}><div><span><AdminBadge tone={statusTone(article.status)}>{adminLabel(locale, "helpStatus", article.status)}</AdminBadge><small>{helpCategoryLabel(locale, article.category)} · {formatAdminDate(locale, article.updatedAt, true)}</small></span><h3>{locale === "en" ? article.titleEn : article.titleZh}</h3><HelpArticleMarkdown markdown={locale === "en" ? article.bodyEn : article.bodyZh} /><div>{article.keywords.map((keyword) => <i key={keyword}>{keyword}</i>)}</div></div><aside className="admin-help-actions"><button className="secondary-button" type="button" onClick={() => setEditing(article)}>{adminCopy(locale, "edit")}</button>{article.status === "draft" && <button className="primary-button" type="button" onClick={() => setTransition({ article, nextStatus: "published" })}>{adminCopy(locale, "publish")}</button>}{article.status === "published" && <button className="danger-button" type="button" onClick={() => setTransition({ article, nextStatus: "archived" })}>{adminCopy(locale, "take_offline")}</button>}{article.status === "archived" && <button className="primary-button" type="button" onClick={() => setTransition({ article, nextStatus: "published" })}>{adminCopy(locale, "republish")}</button>}</aside></article>)}</div>}
        <AdminPagination locale={locale} page={paged.page} totalPages={paged.totalPages} total={paged.total} onPage={setPage} />
      </section>
      {editing && <ArticleDialog locale={locale} article={editing === "new" ? undefined : editing} close={() => { if (!inFlight.current && !pending.current) setEditing(null); }} real={mode === 'real' ? { save: realSave, busy: realBusy, locked: unresolved || realBusy, error: realError, initial: recoveredInput, pendingStatus: pending.current?.body.status } : undefined} />}
      {transition && <AdminConfirm locale={locale} title={adminCopy(locale, transition.nextStatus === "published" ? "publish" : "take_offline")} description={transition.nextStatus === "published" ? adminCopy(locale, "help_audience") : adminCopy(locale, "article_archive_confirm")} close={() => { if (!inFlight.current && !pending.current) setTransition(null); }} confirm={() => void confirmTransition()} confirmLabel={adminCopy(locale, transition.nextStatus === "published" ? "publish" : "take_offline")} busy={realBusy || busyKey === transitionKey} danger={transition.nextStatus === "archived"}><div className="admin-confirm-object">{mode === 'real' && <AdminInlineError message={realError} />}<b>{locale === "en" ? transition.article.titleEn : transition.article.titleZh}</b><span>{adminLabel(locale, "helpStatus", transition.article.status)} → {adminLabel(locale, "helpStatus", transition.nextStatus)}</span></div></AdminConfirm>}
    </div>
  );
}

export function AdminHelp({ locale }: { locale: AdminLocale }) {
  return <DemoAdminHelp locale={locale} />;
}
