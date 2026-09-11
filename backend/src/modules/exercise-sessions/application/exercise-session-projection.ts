import type { ExerciseSession } from '../../../generated/prisma/client.js';
import { cappedRunningDuration, projectedPausedDuration } from '../domain/exercise-session.js';

export interface ExerciseSessionProjection {
  id: string;
  organizationId: string;
  semesterId: string;
  studentId: string;
  enrollmentId: string;
  classSectionId: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  actualDurationSeconds: number;
  pausedDurationSeconds: number;
  businessDate: string;
  lastHeartbeatAt: string | null;
  endReason: string | null;
  version: number;
}

export function projectExerciseSession(
  session: ExerciseSession,
  now: Date,
): ExerciseSessionProjection {
  const intervalStartedAt = session.currentIntervalStartedAt;
  const actualDurationSeconds =
    session.status === 'IN_PROGRESS' && intervalStartedAt !== null
      ? cappedRunningDuration(session.actualDurationSeconds, intervalStartedAt, now)
          .actualDurationSeconds
      : Number(session.actualDurationSeconds);
  const pausedDurationSeconds =
    session.status === 'PAUSED' && intervalStartedAt !== null
      ? projectedPausedDuration(session.pausedDurationSeconds, intervalStartedAt, now)
      : Number(session.pausedDurationSeconds);
  return {
    id: session.id,
    organizationId: session.organizationId,
    semesterId: session.semesterId,
    studentId: session.studentId,
    enrollmentId: session.enrollmentId,
    classSectionId: session.classSectionId,
    status: session.status,
    startedAt: session.startedAt.toISOString(),
    endedAt:
      session.completedAt?.toISOString() ??
      session.cancelledAt?.toISOString() ??
      session.expiredAt?.toISOString() ??
      null,
    actualDurationSeconds,
    pausedDurationSeconds,
    businessDate: session.businessDate.toISOString().slice(0, 10),
    lastHeartbeatAt: session.lastHeartbeatAt?.toISOString() ?? null,
    endReason: session.endReason,
    version: session.version,
  };
}
