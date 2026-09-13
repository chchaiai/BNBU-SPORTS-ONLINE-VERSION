import { PUBLIC_REASONS } from './review.js';
import { projectReviewNotificationContent, type ReviewNotificationContent } from './notification-content.js';
const titles = {
  VALID: ['运动记录有效', 'Exercise record accepted'],
  INVALID: ['运动记录无效', 'Exercise record invalid'],
  AWAITING_SUPPLEMENT: ['请补充本次运动材料', 'Supplementary evidence required'],
  PENDING_TEACHER: ['补证已受理，等待教师复核', 'Supplement received, awaiting teacher review'],
} as const;

// Candidates must come from immutable history for this exact organization/record.
// Do not supply current workflow state or parse teacher text into a reason code.
export function recoverLegacyReviewContent(
  notice: { notificationType: string; title: string; body: string }, candidates: unknown[],
): ReviewNotificationContent | null {
  if (notice.notificationType !== 'EXERCISE_RECORD_RESULT') return null;
  const matches = new Map<string, ReviewNotificationContent>();
  for (const value of candidates) {
    const content = projectReviewNotificationContent(value);
    if (!content) continue;
    const reason = content.reasonCode === 'SUPPLEMENT_DEADLINE_MISSED'
      ? ['补证逾期', 'Supplementary evidence deadline missed']
      : content.reasonCode ? PUBLIC_REASONS[content.reasonCode as keyof typeof PUBLIC_REASONS] : null;
    for (const language of [0, 1] as const) {
      const title = titles[content.stage][language];
      const body = [reason?.[language], content.publicComment].filter(Boolean).join('\n') || title;
      if (notice.title === title && notice.body === body) matches.set(JSON.stringify(content), content);
    }
  }
  return matches.size === 1 ? [...matches.values()][0]! : null;
}
