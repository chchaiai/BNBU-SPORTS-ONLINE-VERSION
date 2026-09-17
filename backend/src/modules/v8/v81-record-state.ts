import type { Prisma } from '../../generated/prisma/client.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { appendMaterialVersion } from './v81-materials.js';
import { randomUUID } from 'node:crypto';
import { recomputeCredits } from './v81-credit-store.js';
import { appendV81SystemEvent } from './v81-system-event.js';

export async function requiredCourseThreshold(
  transaction: Prisma.TransactionClient,
  classSectionId: string,
  recordId?: string,
): Promise<number> {
  if (recordId) {
    const snapshot = await transaction.$queryRaw<{ minimum_minutes: number }[]>`
      SELECT s.minimum_minutes FROM v81_record_rule_snapshots s
      JOIN exercise_records r ON r.id=s.record_id
      WHERE r.id=${recordId}::uuid AND r.class_section_id=${classSectionId}::uuid`;
    if (snapshot[0]) return snapshot[0].minimum_minutes;
  }
  const rows = await transaction.$queryRaw<{ minimum_minutes: number }[]>`
    SELECT minimum_minutes FROM v81_course_rules WHERE class_section_id = ${classSectionId}::uuid AND published_at IS NOT NULL
  `;
  if (!rows[0])
    throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409, {
      reason: 'V81_PUBLISHED_RULES_REQUIRED',
    });
  return rows[0].minimum_minutes;
}

export async function initializeRecordWorkflow(
  transaction: Prisma.TransactionClient,
  input: {
    recordId: string;
    organizationId: string;
    now: Date;
    mediaIds: readonly string[];
    swimDelayReason?: string;
  },
): Promise<void> {
  const { forceTeacher } = await appendMaterialVersion(transaction, { ...input, materialVersion: 1 });
  const stage = forceTeacher ? 'PENDING_TEACHER' : 'VALID';
  await transaction.$executeRaw`
    INSERT INTO v81_record_workflows(record_id, organization_id, stage, teacher_round_started_at, updated_at)
    VALUES (${input.recordId}::uuid, ${input.organizationId}::uuid, ${stage}, ${stage === 'PENDING_TEACHER' ? input.now : null}, ${input.now})
  `;
  if (forceTeacher) return;
  const record = await transaction.exerciseRecord.findUniqueOrThrow({where:{id:input.recordId}});
  const previous = await transaction.reviewRecord.findFirstOrThrow({where:{recordId:input.recordId},orderBy:{reviewVersion:'desc'}});
  await transaction.reviewRecord.create({data:{id:randomUUID(),organizationId:input.organizationId,recordId:input.recordId,
    reviewVersion:previous.reviewVersion+1,previousReviewId:previous.id,result:'VALID',
    publicComment:'提交默认有效；AI 抽查异常交教师复核。 / Valid on submission; AI exceptions require teacher review.',
    reviewedAt:input.now,createdAt:input.now}});
  await transaction.exerciseRecord.update({where:{id:record.id,version:record.version},data:{status:'REVIEWED',version:{increment:1},updatedAt:input.now}});
  await appendV81SystemEvent(transaction,{organizationId:input.organizationId,resourceType:'RECORD_REVIEW',resourceId:input.recordId,
    eventType:'DEFAULT_VALID_ON_SUBMISSION',requestId:randomUUID(),version:1,occurredAt:input.now,outcome:'SUCCEEDED',facts:{materialVersion:1}});
  await recomputeCredits(transaction,record.enrollmentId,input.now);
}
