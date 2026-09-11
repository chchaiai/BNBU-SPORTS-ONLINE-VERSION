import { request } from './api-client';

export type AdminHelpArticle = { id: string; version: number; status: 'draft' | 'published' | 'archived';
  titleZh: string; titleEn: string; bodyZh: string; bodyEn: string; keywords: string[];
  category: string; sortWeight: number; updatedAt: string };
export type AdminHelpInput = Omit<AdminHelpArticle, 'id' | 'version' | 'updatedAt'> & { expectedVersion: number };

export async function listAdminHelp() {
  const items: AdminHelpArticle[] = [];
  for (let page = 1; ; page++) {
    const result = await request<{ items: AdminHelpArticle[]; page: number; pageSize: number; total: number }>(`/admin/help-articles?page=${page}`);
    if (result.page !== page || result.pageSize !== 5) throw new Error('HELP_PAGINATION_INVALID');
    items.push(...result.items);
    if (page * result.pageSize >= result.total) return items;
    if (!result.items.length || page >= 100000) throw new Error('HELP_PAGINATION_INCOMPLETE');
  }
}

export function getAdminHelp(id: string) {
  return request<AdminHelpArticle>(`/admin/help-articles/${encodeURIComponent(id)}`);
}

// Retain one intent until its outcome is known, including retries after a lost response.
export function createHelpSaveIntent(id: string | null, input: AdminHelpInput, key = globalThis.crypto.randomUUID()) {
  const body = structuredClone(input);
  Object.freeze(body.keywords); Object.freeze(body);
  const path = '/admin/help-articles' + (id ? '/' + encodeURIComponent(id) : '');
  let running: Promise<AdminHelpArticle> | null = null;
  return { key, body, run(): Promise<AdminHelpArticle> {
    if (running) return running;
    running = request<AdminHelpArticle>(path, { method: 'POST', body,
      headers: { 'Idempotency-Key': key } }).finally(() => { running = null; });
    return running;
  } };
}

export async function listPublishedAdminHelp(locale: 'zh-CN' | 'en') {
  const items: AdminHelpArticle[] = [];
  for (let page = 1; ; page++) {
    const result = await request<{ items: AdminHelpArticle[]; page: number; pageSize: number; total: number }>(
      `/admin/help-articles?status=published&page=${page}`);
    if (result.page !== page || result.pageSize !== 5) throw new Error('HELP_PAGINATION_INVALID');
    items.push(...result.items);
    if (page * result.pageSize >= result.total) break;
    if (!result.items.length || page >= 100000) throw new Error('HELP_PAGINATION_INCOMPLETE');
  }
  return items.map(article => ({ id: article.id, category: article.category,
    title: locale === 'en' ? article.titleEn : article.titleZh,
    bodyMarkdown: locale === 'en' ? article.bodyEn : article.bodyZh, updatedAt: article.updatedAt }));
}
