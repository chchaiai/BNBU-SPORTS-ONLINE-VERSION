import { request } from './api-client';
import type { AdminLocale, AdminRoute } from './admin-types';

export const subadminPermissions = {
  checkins: 'COURSE_VIEW', courses: 'COURSE_VIEW', semesters: 'SEMESTER_MANAGE', accounts: 'USER_ACCOUNTS',
  support: 'STUDENT_FEEDBACK', rules: 'GLOBAL_RULES', system: 'SYSTEM_MODE',
  help: 'HELP_CENTER', audit: 'AUDIT_QUERY',
} as const;
type Permission = typeof subadminPermissions[keyof typeof subadminPermissions];
export const subadminPermissionCodes: Partial<Record<AdminRoute, string>> = subadminPermissions;
export type SubadminAccount = {
  id: string; account: string; name: string; email: string; department: string | null;
  permissions: Permission[]; status: 'ACTIVE' | 'DISABLED'; version: number; updatedAt: string;
};
export type IdentityChallenge = {
  id: string; email: string; status: 'ACTIVE' | 'VERIFIED'; version: number; expiresAt: string;
};
export function listSubadmins(after?: string): Promise<{ items: SubadminAccount[]; nextCursor: string | null }> {
  return request(`/admin/subadmins${after ? `?after=${encodeURIComponent(after)}` : ''}`);
}
export function setSubadminStatus(input: {
  id: string; expectedVersion: number; status: 'ACTIVE' | 'DISABLED'; handoverCompleted?: boolean;
}, key: string): Promise<Pick<SubadminAccount, 'id' | 'status' | 'version' | 'updatedAt'>> {
  const { id, ...body } = input;
  return request(`/admin/subadmins/${encodeURIComponent(id)}/status`, {
    method: 'POST', body, headers: { 'Idempotency-Key': key },
  });
}
export function toSubadminRoutes(permissions: readonly Permission[]): AdminRoute[] {
  return (Object.keys(subadminPermissions) as (keyof typeof subadminPermissions)[])
    .filter(route => permissions.includes(subadminPermissions[route]));
}
export function toSubadminPermissions(routes: readonly AdminRoute[]): Permission[] {
  return [...new Set((Object.keys(subadminPermissions) as (keyof typeof subadminPermissions)[])
    .filter(route => routes.includes(route)).map(route => subadminPermissions[route]))];
}
export async function listSubadminAccounts(): Promise<SubadminAccount[]> {
  const accounts: SubadminAccount[] = [], seen = new Set<string>();
  let after: string | null = null;
  do {
    const page: { items: SubadminAccount[]; nextCursor: string | null } = await request(
      '/admin/subadmins' + (after ? `?after=${encodeURIComponent(after)}` : ''));
    accounts.push(...page.items);
    after = page.nextCursor;
    if (after && seen.has(after)) throw new Error('SUBADMIN_CURSOR_REPEATED');
    if (after) seen.add(after);
  } while (after);
  return accounts;
}
export function requestSubadminIdentity(email: string, locale: AdminLocale, key: string) {
  return request<IdentityChallenge>('/admin/subadmin-identity-challenges', {
    method: 'POST', body: { email, locale: locale === 'en' ? 'en' : 'zh-CN' }, headers: { 'Idempotency-Key': key },
  });
}
export function verifySubadminIdentity(challenge: IdentityChallenge, code: string, key: string) {
  return request<IdentityChallenge>(`/admin/subadmin-identity-challenges/${encodeURIComponent(challenge.id)}/verify`, {
    method: 'POST', body: { code, expectedVersion: challenge.version }, headers: { 'Idempotency-Key': key },
  });
}
export function createSubadminAccount(input: {
  identityChallengeId?: string; email?: string; identityVerifiedByAdmin?: boolean; account: string; name: string; department: string;
  permissions: AdminRoute[]; initialPassword: string; confirmPassword: string;
}, key: string) {
  return request<SubadminAccount>('/admin/subadmins', { method: 'POST',
    body: { ...input, permissions: toSubadminPermissions(input.permissions) }, headers: { 'Idempotency-Key': key },
  });
}
export function updateSubadminAccount(id: string, input: {
  expectedVersion: number; name: string; email: string; department: string;
  permissions: AdminRoute[]; identityChallengeId?: string;
}, key: string) {
  return request<SubadminAccount>(`/admin/subadmins/${encodeURIComponent(id)}/profile`, { method: 'POST',
    body: { ...input, permissions: toSubadminPermissions(input.permissions) }, headers: { 'Idempotency-Key': key } });
}
export function deleteSubadminAccount(id: string, expectedVersion: number, key: string) {
  return request<{id:string;deleted:true;deletedAt:string;version:number}>(`/admin/subadmins/${encodeURIComponent(id)}/delete`, {
    method:'POST', body:{expectedVersion,handoverCompleted:true}, headers:{'Idempotency-Key':key} });
}
