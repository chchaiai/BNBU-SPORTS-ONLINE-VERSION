import { PUBLIC_REASONS } from './review.js';

export interface ReviewNotificationContent {
  version: 1;
  stage: 'VALID' | 'INVALID' | 'AWAITING_SUPPLEMENT' | 'PENDING_TEACHER';
  reasonCode: string | null;
  publicComment: string | null;
}

export function projectReviewNotificationContent(value: unknown): ReviewNotificationContent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const content = value as Record<string, unknown>;
  if (content.version !== 1 || typeof content.stage !== 'string' || !['VALID', 'INVALID', 'AWAITING_SUPPLEMENT', 'PENDING_TEACHER'].includes(content.stage) ||
      (content.reasonCode !== null && (typeof content.reasonCode !== 'string' ||
        (!Object.hasOwn(PUBLIC_REASONS, content.reasonCode) && content.reasonCode !== 'SUPPLEMENT_DEADLINE_MISSED'))) ||
      (content.publicComment !== null && typeof content.publicComment !== 'string')) return null;
  return { version: 1, stage: content.stage as ReviewNotificationContent['stage'],
    reasonCode: content.reasonCode as string | null, publicComment: content.publicComment as string | null };
}
