import { ApplicationError } from '../../common/errors/application-error.js';
import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';
import type { Prisma } from '../../generated/prisma/client.js';

export const ADMIN_PERMISSIONS = [
  'COURSE_VIEW',
  'SEMESTER_MANAGE',
  'USER_ACCOUNTS',
  'STUDENT_FEEDBACK',
  'GLOBAL_RULES',
  'SYSTEM_MODE',
  'HELP_CENTER',
  'AUDIT_QUERY',
] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export async function requireAdminAccess(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  principal: AuthenticatedPrincipal,
  permission: AdminPermission | 'SUPER' | 'ANY',
) {
  if (principal.role !== 'ADMIN')
    throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
  const rows = await tx.$queryRaw<
    { kind: string; permissions: unknown; must_change_password: boolean }[]
  >`
    SELECT a.kind,a.permissions,a.must_change_password FROM v81_admin_access a
    JOIN users u ON u.id=a.user_id AND u.organization_id=a.organization_id
    WHERE a.user_id=${principal.userId}::uuid AND a.organization_id=${principal.organizationId}::uuid
      AND u.status='ACTIVE' AND u.deleted_at IS NULL`;
  const access = rows[0];
  if (
    !access ||
    access.must_change_password ||
    (access.kind !== 'SUPER' &&
      (permission === 'SUPER' ||
        !Array.isArray(access.permissions) ||
        (permission === 'ANY'
          ? access.permissions.length === 0
          : !access.permissions.includes(permission))))
  ) {
    throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403, {
      reason: access?.must_change_password
        ? 'FIRST_PASSWORD_CHANGE_REQUIRED'
        : 'ADMIN_PERMISSION_REQUIRED',
    });
  }
  return access;
}
