import { ApplicationError } from '../../../common/errors/application-error.js';

export const EXERCISE_RECORD_STATUSES = ['DRAFT', 'SUBMITTED', 'REVIEWED', 'CANCELLED'] as const;
export type ExerciseRecordStatus = (typeof EXERCISE_RECORD_STATUSES)[number];

export const CREDIT_TYPES = ['COURSE_RELATED', 'GENERAL'] as const;
export type CreditType = (typeof CREDIT_TYPES)[number];

export function creditedDuration(actualDurationSeconds: bigint, minimumMinutes = 30): bigint {
  if (actualDurationSeconds < 0n || ![30, 45, 60].includes(minimumMinutes)) {
    throw new ApplicationError('EXERCISE_RECORD_DURATION_NOT_CREDITABLE', 422);
  }
  const minutes = actualDurationSeconds / 60n;
  if (minutes < BigInt(minimumMinutes)) return 0n;
  return (minutes > 60n ? 60n : minutes) * 60n;
}

export function assertCreditableDuration(actualDurationSeconds: bigint, minimumMinutes = 30): bigint {
  // A genuine subthreshold session can be recorded; it contributes zero minutes.
  return creditedDuration(actualDurationSeconds, minimumMinutes);
}

export function normalizeRecordContent(input: {
  creditType: CreditType;
  sportType: string;
  sportName?: string | null;
  description?: string | null;
}): {
  creditType: CreditType;
  sportType: string;
  sportName: string | null;
  description: string | null;
} {
  const sportType = input.sportType.trim();
  const normalizedSportName = input.sportName?.trim();
  const sportName =
    normalizedSportName === undefined || normalizedSportName === '' ? null : normalizedSportName;
  const normalizedDescription = input.description?.trim();
  const description =
    normalizedDescription === undefined || normalizedDescription === ''
      ? null
      : normalizedDescription;
  if (
    !/^[A-Z][A-Z0-9_]*$/.test(sportType) ||
    (input.creditType === 'GENERAL' && description === null)
  ) {
    throw new ApplicationError('VALIDATION_FAILED', 422);
  }
  if ((sportType === 'OTHER') !== (sportName !== null)) {
    throw new ApplicationError('VALIDATION_FAILED', 422);
  }
  return { creditType: input.creditType, sportType, sportName, description };
}
