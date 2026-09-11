import { request } from './api-client';

export type SemesterSummary = { id: string; version: number; displayName: string;
  status: 'UPCOMING' | 'CURRENT' | 'ARCHIVED'; startDate: string; endDate: string };
export type SemesterRow = SemesterSummary & { academicYear: string; termCode: 'FIRST' | 'SECOND' | 'SUMMER';
  courseCount: number; studentCount: number; updatedAt: string };
export type SemesterConfiguration = Pick<SemesterRow, 'academicYear' | 'termCode' | 'displayName' | 'startDate' | 'endDate'>;
export type SettlementBlocker = { code: string; status: 'CLEAR' | 'BLOCKED' | 'UNAVAILABLE'; count: number | null };
export type SemesterSwitchCheck = { target: SemesterSummary; current: SemesterSummary | null; ready: boolean;
  checks: SettlementBlocker[]; totalCourseCount: number; checkedAt: string; businessDate: string; timezone: string;
  courses: { classSectionId: string; ready: boolean; checkedAt: string; checks: SettlementBlocker[] }[]; nextCursor: string | null };
export type SemesterSwitchResult = { switchedAt: string; current: SemesterSummary; archived: SemesterSummary | null };

export async function listSemesters(): Promise<SemesterRow[]> {
  const items: SemesterRow[] = [], seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const page: { items: SemesterRow[]; nextCursor: string | null } = await request('/admin/semesters?limit=100' +
      (cursor ? '&after=' + encodeURIComponent(cursor) : ''));
    items.push(...page.items); cursor = page.nextCursor;
    if (cursor && seen.has(cursor)) throw new Error('SEMESTER_PAGINATION_REPEATED');
    if (cursor) seen.add(cursor);
  } while (cursor);
  return items;
}
export function saveSemester(id: string | null, input: SemesterConfiguration & { expectedVersion?: number }, key: string) {
  return request<SemesterRow>('/admin/semesters' + (id ? '/' + encodeURIComponent(id) : ''),
    { method: 'POST', body: input, headers: { 'Idempotency-Key': key } });
}
export function getSemesterSwitchCheck(id: string, after?: string) {
  return request<SemesterSwitchCheck>(`/admin/semesters/${encodeURIComponent(id)}/switch-check?limit=100` +
    (after ? '&after=' + encodeURIComponent(after) : ''));
}
// Create once from the preview the user confirmed. Retain this object for uncertain retries.
export function createSemesterSwitchIntent(check: SemesterSwitchCheck, key = globalThis.crypto.randomUUID()) {
  const id = check.target.id;
  const body = Object.freeze({ expectedVersion: check.target.version, currentSemesterId: check.current?.id ?? null,
    currentSemesterVersion: check.current?.version ?? null });
  let running: Promise<SemesterSwitchResult> | null = null;
  return { key, body, run(): Promise<SemesterSwitchResult> {
    if (running) return running;
    running = request<SemesterSwitchResult>(`/admin/semesters/${encodeURIComponent(id)}/switch`,
      { method: 'POST', body, headers: { 'Idempotency-Key': key } }).finally(() => { running = null; });
    return running;
  } };
}
