import { ApplicationError } from '../../../common/errors/application-error.js';

export const EXERCISE_SESSION_STATUSES = [
  'IN_PROGRESS',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
] as const;
export type ExerciseSessionStatus = (typeof EXERCISE_SESSION_STATUSES)[number];

// Numeric representation limit only. V8.1 has no two-hour business cap.
export const SESSION_DURATION_CAP_SECONDS = Number.MAX_SAFE_INTEGER;

export function wholeSeconds(startedAt: Date, endedAt: Date): number {
  if (endedAt.getTime() < startedAt.getTime()) {
    throw new ApplicationError('SESSION_TIMELINE_INVALID', 409);
  }
  return Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000);
}

export function cappedRunningDuration(
  persistedSeconds: bigint,
  intervalStartedAt: Date,
  now: Date,
): { actualDurationSeconds: number; reachedCap: boolean; capAt: Date } {
  const persisted = Number(persistedSeconds);
  if (
    !Number.isSafeInteger(persisted) ||
    persisted < 0 ||
    persisted > SESSION_DURATION_CAP_SECONDS
  ) {
    throw new ApplicationError('SESSION_TIMELINE_INVALID', 409);
  }
  const elapsed = wholeSeconds(intervalStartedAt, now);
  if (!Number.isSafeInteger(persisted + elapsed)) throw new ApplicationError('SESSION_TIMELINE_INVALID', 409);
  return {
    actualDurationSeconds: persisted + elapsed,
    reachedCap: false,
    capAt: now,
  };
}

export function projectedPausedDuration(
  persistedSeconds: bigint,
  intervalStartedAt: Date,
  now: Date,
): number {
  const persisted = Number(persistedSeconds);
  if (!Number.isSafeInteger(persisted) || persisted < 0) {
    throw new ApplicationError('SESSION_TIMELINE_INVALID', 409);
  }
  return persisted + wholeSeconds(intervalStartedAt, now);
}

export function assertTransition(from: string, to: ExerciseSessionStatus): void {
  const allowed =
    (from === 'IN_PROGRESS' && ['PAUSED', 'COMPLETED', 'CANCELLED'].includes(to)) ||
    (from === 'PAUSED' && ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(to));
  if (!allowed) {
    if (from === 'COMPLETED') throw new ApplicationError('SESSION_ALREADY_COMPLETED', 409);
    throw new ApplicationError('SESSION_TRANSITION_NOT_ALLOWED', 409);
  }
}
