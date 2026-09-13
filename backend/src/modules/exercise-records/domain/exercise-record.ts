import { ApplicationError } from '../../../common/errors/application-error.js';

export const EXERCISE_RECORD_STATUSES = ['DRAFT', 'SUBMITTED', 'REVIEWED', 'CANCELLED'] as const;
export type ExerciseRecordStatus = (typeof EXERCISE_RECORD_STATUSES)[number];

export const CREDIT_TYPES = ['COURSE_RELATED', 'GENERAL'] as const;
export type CreditType = (typeof CREDIT_TYPES)[number];

export function creditedDuration(actualDurationSeconds: bigint, minimumMinutes = 30, maximumMinutes = 60): bigint {
  if (actualDurationSeconds < 0n || !Number.isInteger(minimumMinutes) || minimumMinutes < 1 || minimumMinutes > 1440) {
    throw new ApplicationError('EXERCISE_RECORD_DURATION_NOT_CREDITABLE', 422);
  }
  if (!Number.isInteger(maximumMinutes) || maximumMinutes < 1 || maximumMinutes > 1440)
    throw new ApplicationError('EXERCISE_RECORD_DURATION_NOT_CREDITABLE', 422);
  const minutes = actualDurationSeconds / 60n;
  if (minutes < BigInt(minimumMinutes)) return 0n;
  return (minutes > BigInt(maximumMinutes) ? BigInt(maximumMinutes) : minutes) * 60n;
}

export function assertCreditableDuration(actualDurationSeconds: bigint, minimumMinutes = 30, maximumMinutes = 60): bigint {
  const credit = creditedDuration(actualDurationSeconds, minimumMinutes, maximumMinutes);
  if (credit === 0n) throw new ApplicationError('EXERCISE_RECORD_DURATION_NOT_CREDITABLE', 422);
  return credit;
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
