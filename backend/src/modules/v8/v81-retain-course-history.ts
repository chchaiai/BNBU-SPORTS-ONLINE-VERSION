import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';

/** Retirement ends membership without erasing any student-owned facts. */
export async function retireCourseMemberships(
  tx: Prisma.TransactionClient, principal: AuthenticatedPrincipal,
  sectionId: string, now: Date, requestId: string,
) {
  const members = await tx.enrollment.findMany({
    where: { organizationId: principal.organizationId, classSectionId: sectionId, status: 'ACTIVE' },
  });
  for (const member of members) {
    await tx.enrollment.update({ where: { id: member.id }, data: {
      status: 'REMOVED', endedAt: now, endReason: 'COURSE_RETIRED',
      updatedBy: principal.userId, updatedAt: now, version: { increment: 1 },
    } });
    await tx.enrollmentStatusEvent.create({ data: {
      id: randomUUID(), organizationId: principal.organizationId, enrollmentId: member.id,
      fromStatus: 'ACTIVE', toStatus: 'REMOVED', source: 'SYSTEM', reason: 'COURSE_RETIRED',
      actorUserId: principal.userId, actorRoleSnapshot: principal.role, requestId,
      occurredAt: now, enrollmentVersion: member.version + 1,
    } });
  }
  await tx.courseInvite.updateMany({
    where: { organizationId: principal.organizationId, classSectionId: sectionId, status: 'ACTIVE' },
    data: { status: 'REVOKED', revokedAt: now, revokedBy: principal.userId,
      revokeReason: 'COURSE_RETIRED', rowVersion: { increment: 1 } },
  });
  return members.length;
}
