import type { ExerciseRecord, Prisma, ReviewRecord } from '../../../generated/prisma/client.js';

type Transaction = Prisma.TransactionClient;
export interface ValidScoreSource {
  record: ExerciseRecord;
  review: ReviewRecord;
}

/**
 * Loads the single latest VALID review for every reviewed record in an enrollment.
 * Both score calculation and new-session admission use this source so the 20-hour
 * qualification boundary cannot drift between modules.
 */
export async function loadValidScoreSources(
  transaction: Transaction,
  enrollmentId: string,
): Promise<ValidScoreSource[]> {
  const records = await transaction.exerciseRecord.findMany({
    where: { enrollmentId, status: 'REVIEWED' },
    include: { reviews: { orderBy: { reviewVersion: 'desc' as const }, take: 1 } },
    orderBy: { id: 'asc' as const },
  });
  return records.flatMap((record) => {
    const review = record.reviews[0];
    return review?.result === 'VALID' ? [{ record, review }] : [];
  });
}

export function totalValidCreditedSeconds(
  sources: readonly { record: { creditedDurationSeconds: bigint } }[],
): bigint {
  return sources.reduce((total, item) => total + item.record.creditedDurationSeconds, 0n);
}
