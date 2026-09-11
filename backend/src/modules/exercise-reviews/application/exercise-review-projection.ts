import type { ReviewRecord } from '../../../generated/prisma/client.js';

export interface ExerciseReviewProjection {
  id: string;
  organizationId: string;
  recordId: string;
  teacherId: string | null;
  reviewVersion: number;
  previousReviewId: string | null;
  result: string;
  creditedDurationOverrideSeconds: null;
  reasonCode: string | null;
  reason: string | null;
  publicComment: string | null;
  internalNote: string | null;
  reviewedAt: string | null;
}

export function projectExerciseReview(review: ReviewRecord): ExerciseReviewProjection {
  return {
    id: review.id,
    organizationId: review.organizationId,
    recordId: review.recordId,
    teacherId: review.teacherId,
    reviewVersion: review.reviewVersion,
    previousReviewId: review.previousReviewId,
    result: review.result,
    creditedDurationOverrideSeconds: null,
    reasonCode: review.reasonCode,
    reason: review.reason,
    publicComment: review.publicComment,
    internalNote: null,
    reviewedAt: review.reviewedAt?.toISOString() ?? null,
  };
}
