import { request } from './api-client';
import type { TeacherProfileProjection } from './admin-types';

export type TeacherImportPreview = {
  rows: { rowNumber: number; employeeId: string; name: string; email: string; college: string | null; errors: string[] }[];
  canCreate: boolean;
  previewToken: string | null;
};
export type TeacherImportCreated = { batchId: string; createdCount: number; accounts: {
  userId: string; teacherProfileId: string; employeeId: string; name: string; email: string; college: string | null;
}[] };
export function previewTeacherAccounts(csv: string) {
  return request<TeacherImportPreview>('/admin/teacher-imports/preview', { method: 'POST', body: { csv } });
}
export function confirmTeacherAccounts(csv: string, previewToken: string, initialPassword: string, idempotencyKey: string) {
  return request<TeacherImportCreated>('/admin/teacher-imports/confirm', { method: 'POST',
    body: { csv, previewToken, initialPassword }, headers: { 'Idempotency-Key': idempotencyKey } });
}
export async function listTeacherAccounts() {
  const items: TeacherProfileProjection[] = [];
  const seen = new Set<string>();
  let after: string | null = null;
  do {
    const page: { items: TeacherProfileProjection[]; nextCursor: string | null } = await request(
      '/admin/teacher-accounts' + (after ? `?after=${encodeURIComponent(after)}` : ''));
    items.push(...page.items);
    after = page.nextCursor;
    if (after && seen.has(after)) throw new Error('TEACHER_ACCOUNT_CURSOR_REPEATED');
    if (after) seen.add(after);
  } while (after);
  return items.sort((a, b) => a.employeeNumber.localeCompare(b.employeeNumber));
}
