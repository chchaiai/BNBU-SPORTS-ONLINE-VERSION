import {requireHistoricalSubmissionWindow} from './v81-history-backfill.js';
import { permitsExistingCourseSession } from '../enrollments/application/course-closure-memberships.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { supplementClock } from './domain/deadlines.js';

/** Rechecked on each upload phase. A cached client permission cannot authorize a write. */
export async function exerciseUploadWindow(
  tx: Prisma.TransactionClient,
  sessionId: string,
  now: Date,
  _mediaId?: string,
): Promise<{supplement:boolean;frozenMediaIds:string[]}> {
  void _mediaId; // Retained for callers from earlier releases.
  const session = await tx.exerciseSession.findUnique({
    where: { id: sessionId },
    include: { enrollment: true, exerciseRecord: true, classSection: true },
  });
  if (!session || !['IN_PROGRESS', 'PAUSED', 'COMPLETED'].includes(session.status))
    throw new ApplicationError('MEDIA_BIND_TARGET_INVALID', 422);
  const record = session.exerciseRecord;
  if (!record || record.status === 'DRAFT') {
    await requireHistoricalSubmissionWindow(tx,sessionId,now);
    if (!permitsExistingCourseSession(session.enrollment, session.classSection, session.startedAt))
      throw new ApplicationError('ENROLLMENT_NOT_ACTIVE', 409);
    return { supplement: false, frozenMediaIds: [] as string[] };
  }
  const rows = await tx.$queryRaw<
    {
      stage: string;
      supplement_started_at: Date | null;
      supplement_hours: 24 | 72 | null;
      material_version: number;
    }[]
  >`
    SELECT stage,supplement_started_at,supplement_hours,material_version FROM v81_record_workflows WHERE record_id=${record.id}::uuid`;
  const state = rows[0];
  if (
    state?.stage !== 'AWAITING_SUPPLEMENT' ||
    state.material_version !== 1 ||
    !state.supplement_started_at ||
    !state.supplement_hours
  ) {
    throw new ApplicationError('MEDIA_BIND_TARGET_INVALID', 422);
  }
  const policy = await tx.systemPolicy.findUnique({
    where: { organizationId: session.organizationId },
  });
  if (policy?.systemMode !== 'NORMAL') throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
  const semester = await tx.semester.findUniqueOrThrow({ where: { id: session.semesterId } });
  if (semester.status === 'ARCHIVED') throw new ApplicationError('MEDIA_BIND_TARGET_INVALID', 422);
  const interruptions = await tx.$queryRaw<{ startedAt: Date; endedAt: Date | null }[]>`
    SELECT started_at AS "startedAt",ended_at AS "endedAt" FROM v81_interruptions
    WHERE organization_id=${session.organizationId}::uuid AND (class_section_id IS NULL OR class_section_id=${session.classSectionId}::uuid)
    AND started_at<=${now} AND (ended_at IS NULL OR ended_at>${state.supplement_started_at})`;
  const clock = supplementClock(
    state.supplement_started_at,
    state.supplement_hours,
    interruptions,
    now,
  );
  if (clock.paused || clock.expired) throw new ApplicationError('COURSE_DEADLINE_PASSED', 409);
  const items = await tx.$queryRaw<
    { media_id: string }[]
  >`SELECT media_id FROM v81_material_items WHERE record_id=${record.id}::uuid AND material_version=1`;
  return { supplement: true, frozenMediaIds: items.map((item) => item.media_id) };
}
