import type { Prisma } from '../../generated/prisma/client.js';
import { PUBLIC_REASONS } from './domain/review.js';

export async function notifyRecord(
  tx: Prisma.TransactionClient,
  input: {
    id: string;
    organizationId: string;
    recordId: string;
    recipientUserId: string;
    stage: string;
    reasonCode: string | null;
    publicComment: string | null;
    now: Date;
  },
) {
  const preference = await tx.userPreference.findUnique({
    where: { userId: input.recipientUserId },
  });
  const locale = preference?.locale === 'en' ? 'en' : 'zh';
  const reason =
    input.reasonCode === 'SUPPLEMENT_DEADLINE_MISSED'
      ? ['补证逾期', 'Supplementary evidence deadline missed']
      : input.reasonCode && Object.hasOwn(PUBLIC_REASONS, input.reasonCode)
        ? PUBLIC_REASONS[input.reasonCode as keyof typeof PUBLIC_REASONS]
        : null;
  const titles: Record<string, readonly [string, string]> = {
    VALID: ['运动记录有效', 'Exercise record accepted'],
    INVALID: ['运动记录无效', 'Exercise record invalid'],
    AWAITING_SUPPLEMENT: ['请补充本次运动材料', 'Supplementary evidence required'],
    PENDING_TEACHER: ['补证已受理，等待教师复核', 'Supplement received, awaiting teacher review'],
  };
  const title = titles[input.stage]?.[locale === 'en' ? 1 : 0];
  if (!title) throw new Error('UNSUPPORTED_RECORD_NOTIFICATION');
  await tx.notification.create({
    data: {
      id: input.id,
      organizationId: input.organizationId,
      recipientUserId: input.recipientUserId,
      notificationType: 'EXERCISE_RECORD_RESULT',
      reviewContent: { version: 1, stage: input.stage, reasonCode: input.reasonCode, publicComment: input.publicComment },
      title,
      body:
        [reason?.[locale === 'en' ? 1 : 0], input.publicComment].filter(Boolean).join('\n') ||
        title,
      targetType: 'EXERCISE_RECORD',
      targetId: input.recordId,
      createdAt: input.now,
    },
  });
}
