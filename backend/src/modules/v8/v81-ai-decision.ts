import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client.js';
import { recomputeCredits } from './v81-credit-store.js';
import { notifyRecord } from './v81-notifications.js';
import { appendV81SystemEvent } from './v81-system-event.js';

// The caller holds the organization lock and commits the job result atomically.
export async function applyAiDecision(tx: Prisma.TransactionClient, input: {
  organizationId: string; recordId: string; materialVersion: number; jobId: string;
  decision: 'VALID' | 'INVALID'; policyVersion: string;
}): Promise<void> {
  const record = await tx.exerciseRecord.findFirst({where:{id:input.recordId,organizationId:input.organizationId},include:{student:true,semester:true}});
  if (!record || record.semester.status === 'ARCHIVED') return;
  const excluded = await tx.$queryRaw<{found:boolean}[]>`SELECT (
    EXISTS(SELECT 1 FROM v81_history_session_sources WHERE session_id=${record.sessionId}::uuid) OR
    EXISTS(SELECT 1 FROM v81_swim_intakes WHERE record_id=${record.id}::uuid AND delay_reason IS NOT NULL) OR
    EXISTS(SELECT 1 FROM v81_settlement_report_revisions WHERE class_section_id=${record.classSectionId}::uuid)
  ) AS found`;
  if (excluded[0]?.found) return;
  const rows = await tx.$queryRaw<{stage:string;material_version:number;version:number}[]>`
    SELECT stage,material_version,version FROM v81_record_workflows WHERE record_id=${record.id}::uuid FOR UPDATE`;
  const state = rows[0];
  if (state?.stage !== 'PENDING_TEACHER' || state.material_version !== input.materialVersion) return;
  const previous = await tx.reviewRecord.findFirst({where:{recordId:record.id},orderBy:{reviewVersion:'desc'}});
  if (!previous) throw new Error('AI_REVIEW_HISTORY_MISSING');
  const now = new Date();
  const reviewId = randomUUID();
  const reasonCode = input.decision === 'INVALID' ? 'SESSION_MISMATCH' : null;
  const publicComment = input.decision === 'INVALID'
    ? 'AI 自动判定：材料未满足本次运动审核要求。如有异议，请联系任课教师复核。 / AI decision: evidence does not meet this exercise review requirement. Contact your teacher for review.'
    : 'AI 自动审核通过，教师可复核修改。 / Automatically approved by AI; your teacher can review and correct this result.';
  await tx.$executeRaw`UPDATE v81_record_workflows SET stage=${input.decision},public_reason=${reasonCode},public_comment=${publicComment},
    teacher_round_started_at=NULL,version=version+1,updated_at=${now} WHERE record_id=${record.id}::uuid`;
  await appendV81SystemEvent(tx,{organizationId:input.organizationId,resourceType:'RECORD_REVIEW',resourceId:record.id,
    eventType:'AI_AUTO_DECISION',requestId:input.jobId,version:state.version+1,occurredAt:now,outcome:'SUCCEEDED',reasonCode,
    facts:{jobId:input.jobId,reviewId,materialVersion:input.materialVersion,policyVersion:input.policyVersion,decision:input.decision}});
  await tx.reviewRecord.create({data:{id:reviewId,organizationId:input.organizationId,recordId:record.id,
    reviewVersion:previous.reviewVersion+1,previousReviewId:previous.id,result:input.decision,
    reasonCode,publicComment,reviewedAt:now,createdAt:now}});
  await tx.exerciseRecord.update({where:{id:record.id,version:record.version},data:{status:'REVIEWED',version:{increment:1},updatedAt:now}});
  await recomputeCredits(tx,record.enrollmentId,now);
  await notifyRecord(tx,{id:randomUUID(),organizationId:input.organizationId,recordId:record.id,
    recipientUserId:record.student.userId,stage:input.decision,reasonCode,publicComment,now});
}
