import { Prisma } from '../../../generated/prisma/client.js';

export const SCORE_THRESHOLD_SECONDS = 72_000n;

export interface ScoreCalculation {
  totalValidCreditedSeconds: bigint;
  scoringSeconds: bigint;
  excessSeconds: bigint;
  qualificationStatus: 'NOT_QUALIFIED' | 'QUALIFIED';
  rawScore: Prisma.Decimal;
  finalScore: Prisma.Decimal;
}

export function calculateScore(totalValidCreditedSeconds: bigint): ScoreCalculation {
  if (totalValidCreditedSeconds < 0n) throw new RangeError('score seconds must be non-negative');
  const scoringSeconds =
    totalValidCreditedSeconds > SCORE_THRESHOLD_SECONDS
      ? SCORE_THRESHOLD_SECONDS
      : totalValidCreditedSeconds;
  const excessSeconds =
    totalValidCreditedSeconds > SCORE_THRESHOLD_SECONDS
      ? totalValidCreditedSeconds - SCORE_THRESHOLD_SECONDS
      : 0n;
  const qualificationStatus =
    totalValidCreditedSeconds >= SCORE_THRESHOLD_SECONDS ? 'QUALIFIED' : 'NOT_QUALIFIED';
  const rawScore = new Prisma.Decimal(scoringSeconds.toString())
    .times(100)
    .div(SCORE_THRESHOLD_SECONDS.toString());
  let finalScore = rawScore.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  if (qualificationStatus === 'NOT_QUALIFIED' && finalScore.equals(100)) {
    finalScore = new Prisma.Decimal('99.99');
  }
  return {
    totalValidCreditedSeconds,
    scoringSeconds,
    excessSeconds,
    qualificationStatus,
    rawScore,
    finalScore,
  };
}

export function applyApprovedAdjustments(
  base: Prisma.Decimal,
  adjustments: readonly { adjustmentType: string; adjustmentValue: Prisma.Decimal }[],
): Prisma.Decimal {
  let result = base;
  for (const adjustment of adjustments) {
    result =
      adjustment.adjustmentType === 'FINAL_SCORE_DELTA'
        ? result.plus(adjustment.adjustmentValue)
        : adjustment.adjustmentValue;
    if (result.lessThan(0) || result.greaterThan(100)) {
      throw new RangeError('adjusted score outside 0.00-100.00');
    }
  }
  return result.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
