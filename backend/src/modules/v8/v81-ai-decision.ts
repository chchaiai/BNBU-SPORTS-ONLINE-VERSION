import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client.js';
import { recomputeCredits } from './v81-credit-store.js';
import { notifyRecord } from './v81-notifications.js';
import { appendV81SystemEvent } from './v81-system-event.js';

// The caller holds the organization lock and commits the job result atomically.
export async function applyAiDecision(tx: Prisma.TransactionClient, input: {
  organizationId: string; recordId: string; materialVersion: number; jobId: string;
  decision: 'PENDING_TEACHER'; policyVersion: string;
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
  if (state?.stage !== 'VALID' || state.material_version !== input.materialVersion) return;
  const previous = await tx.reviewRecord.findFirst({where:{recordId:record.id},orderBy:{reviewVersion:'desc'}});
  if (!previous) throw new Error('AI_REVIEW_HISTORY_MISSING');
  if (previous.teacherId || previous.result !== 'VALID' || input.materialVersion !== 1) return;
  const now = new Date();
  const reviewId = randomUUID();
  const reasonCode = null;
  const publicComment = 'AI 抽查发现需核实的材料，等待教师复核，尚未判为无效。 / AI flagged evidence for teacher review; this is not an invalid decision.';
  await tx.$executeRaw`UPDATE v81_record_workflows SET stage=${input.decision},public_reason=${reasonCode},public_comment=${publicComment},
    teacher_round_started_at=${now},version=version+1,updated_at=${now} WHERE record_id=${record.id}::uuid`;
  await appendV81SystemEvent(tx,{organizationId:input.organizationId,resourceType:'RECORD_REVIEW',resourceId:record.id,
    eventType:'AI_EXCEPTION_REVIEW',requestId:input.jobId,version:state.version+1,occurredAt:now,outcome:'SUCCEEDED',reasonCode,
    facts:{jobId:input.jobId,reviewId,materialVersion:input.materialVersion,policyVersion:input.policyVersion,decision:input.decision}});
  await tx.reviewRecord.create({data:{id:reviewId,organizationId:input.organizationId,recordId:record.id,
    reviewVersion:previous.reviewVersion+1,previousReviewId:previous.id,result:'PENDING',
    reason:'AI_EXCEPTION_REVIEW',createdAt:now}});
  await tx.exerciseRecord.update({where:{id:record.id,version:record.version},data:{status:'SUBMITTED',version:{increment:1},updatedAt:now}});
  await recomputeCredits(tx,record.enrollmentId,now);
  await notifyRecord(tx,{id:randomUUID(),organizationId:input.organizationId,recordId:record.id,
    recipientUserId:record.student.userId,stage:input.decision,reasonCode,publicComment,now});
}
