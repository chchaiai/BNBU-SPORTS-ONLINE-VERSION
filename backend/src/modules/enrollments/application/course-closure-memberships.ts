import type { Prisma } from '../../../generated/prisma/client.js';
import type { AuditService } from '../../../common/audit/audit.service.js';
import type { OutboxService } from '../../../common/outbox/outbox.service.js';
import type { IdGenerator } from '../../../common/time/id-generator.js';

export const COURSE_CLOSURE_REASON = 'COURSE_CLOSED';

/** Only course-closure removal preserves a session already admitted before closure. */
export function permitsExistingCourseSession(
  enrollment: { status: string; endReason?: string | null; endedAt?: Date | null },
  section: { status: string; closedAt: Date | null },
  startedAt: Date,
): boolean {
  return (
    enrollment.status === 'ACTIVE' ||
    (enrollment.status === 'REMOVED' &&
      enrollment.endReason === COURSE_CLOSURE_REASON &&
      section.status === 'CLOSED' &&
      section.closedAt !== null &&
      enrollment.endedAt?.getTime() === section.closedAt.getTime() &&
      startedAt <= section.closedAt)
  );
}

/** Runs inside the same organization-locked transaction as course closure. */
export async function endCourseMemberships(
  tx: Prisma.TransactionClient,
  section: { id: string; organizationId: string; closedAt: Date | null },
  actorUserId: string,
  requestId: string,
  keyReference: string | null,
  ids: IdGenerator,
  audit: AuditService,
  outbox: OutboxService,
): Promise<number> {
  if (!section.closedAt) throw new Error('Course closure timestamp required');
  const members = await tx.enrollment.findMany({
    where: { organizationId: section.organizationId, classSectionId: section.id, status: 'ACTIVE' },
  });
  for (const member of members) {
    const changed = await tx.enrollment.updateMany({
      where: { id: member.id, status: 'ACTIVE', version: member.version },
      data: {
        status: 'REMOVED',
        endedAt: section.closedAt,
        endReason: COURSE_CLOSURE_REASON,
        updatedBy: actorUserId,
        updatedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1) throw new Error('Concurrent course membership transition');
    await tx.enrollmentStatusEvent.create({
      data: {
        id: ids.next(),
        organizationId: member.organizationId,
        enrollmentId: member.id,
        fromStatus: 'ACTIVE',
        toStatus: 'REMOVED',
        source: 'SYSTEM',
        reason: COURSE_CLOSURE_REASON,
        actorUserId,
        actorRoleSnapshot: 'TEACHER',
        requestId,
        idempotencyKeyReference: keyReference,
        occurredAt: new Date(),
        enrollmentVersion: member.version + 1,
      },
    });
    await audit.append(tx, {
      organizationId: member.organizationId,
      actorUserId,
      actorRoleSnapshot: 'TEACHER',
      permissionId: 'CLASS-SECTION-CLOSE',
      actionType: 'ENROLLMENT_STATUS_CHANGED',
      targetType: 'ENROLLMENT',
      targetId: member.id,
      requestId,
      idempotencyKeyReference: keyReference,
      outcome: 'SUCCEEDED',
      safeMetadata: {
        classSectionId: section.id,
        previousStatus: 'ACTIVE',
        nextStatus: 'REMOVED',
        reasonCode: COURSE_CLOSURE_REASON,
      },
    });
    await outbox.append(tx, {
      organizationId: member.organizationId,
      aggregateType: 'ENROLLMENT',
      aggregateId: member.id,
      eventType: 'ENROLLMENT_REMOVED_V1',
      eventVersion: member.version + 1,
      payload: { enrollmentId: member.id, classSectionId: section.id, requestId },
    });
  }
  return members.length;
}
