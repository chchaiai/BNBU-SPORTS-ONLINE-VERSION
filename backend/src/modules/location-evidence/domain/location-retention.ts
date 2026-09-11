import { ApplicationError } from '../../../common/errors/application-error.js';

const MILLISECONDS_PER_DAY = 86_400_000;

export interface LocationRetentionCandidate {
  trackId: string;
  rawExpiresAt: Date | null;
  rawDeletedAt: Date | null;
  coarseExpiresAt: Date | null;
  coarseDeletedAt: Date | null;
}

export interface DueLocationRetention {
  trackId: string;
  expiresAt: Date;
}

export function locationRetentionDeadline(anchor: Date, retentionDays: number): Date {
  if (
    !Number.isFinite(anchor.getTime()) ||
    !Number.isSafeInteger(retentionDays) ||
    retentionDays < 0
  ) {
    throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
      invariant: 'LOCATION_RETENTION_INPUT_INVALID',
    });
  }
  const duration = retentionDays * MILLISECONDS_PER_DAY;
  const deadline = anchor.getTime() + duration;
  if (!Number.isSafeInteger(duration) || !Number.isFinite(deadline)) {
    throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
      invariant: 'LOCATION_RETENTION_DEADLINE_INVALID',
    });
  }
  return new Date(deadline);
}

function selectDue(
  candidates: readonly LocationRetentionCandidate[],
  now: Date,
  limit: number,
  dataClass: 'RAW' | 'COARSE',
): readonly DueLocationRetention[] {
  if (!Number.isFinite(now.getTime()) || !Number.isSafeInteger(limit) || limit < 1) {
    throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
      invariant: 'LOCATION_RETENTION_SELECTION_INVALID',
    });
  }
  return candidates
    .flatMap((candidate): DueLocationRetention[] => {
      const expiresAt = dataClass === 'RAW' ? candidate.rawExpiresAt : candidate.coarseExpiresAt;
      const deletedAt = dataClass === 'RAW' ? candidate.rawDeletedAt : candidate.coarseDeletedAt;
      if (
        candidate.trackId.length === 0 ||
        expiresAt === null ||
        !Number.isFinite(expiresAt.getTime()) ||
        deletedAt !== null ||
        expiresAt.getTime() > now.getTime()
      ) {
        return [];
      }
      return [{ trackId: candidate.trackId, expiresAt }];
    })
    .sort(
      (left, right) =>
        left.expiresAt.getTime() - right.expiresAt.getTime() ||
        left.trackId.localeCompare(right.trackId),
    )
    .slice(0, limit);
}

export function selectDueRawLocationRetention(
  candidates: readonly LocationRetentionCandidate[],
  now: Date,
  limit: number,
): readonly DueLocationRetention[] {
  return selectDue(candidates, now, limit, 'RAW');
}

export function selectDueCoarseLocationRetention(
  candidates: readonly LocationRetentionCandidate[],
  now: Date,
  limit: number,
): readonly DueLocationRetention[] {
  return selectDue(candidates, now, limit, 'COARSE');
}
