import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { AI_AUTO_POLICY } from './domain/ai-review.js';
import { enqueueAiReview } from './v81-ai-review-store.js';
import { appendV81SystemEvent } from './v81-system-event.js';

/** Bounded, idempotent intake of unfinished historical reviews; no provider calls. */
export async function backfillPendingAiReviews(prisma: PrismaClient): Promise<number> {
  const candidates = await prisma.$queryRaw<{record_id:string;organization_id:string}[]>`
    SELECT w.record_id,w.organization_id FROM v81_record_workflows w
    JOIN system_policies p ON p.organization_id=w.organization_id
    LEFT JOIN v81_material_versions m ON m.record_id=w.record_id AND m.material_version=w.material_version
    LEFT JOIN v81_ai_review_jobs j ON j.record_id=w.record_id AND j.material_version=w.material_version
    WHERE p.system_mode='NORMAL' AND w.stage IN ('PENDING_TEACHER','PENDING_AI','TECHNICAL')
      AND (m.record_id IS NOT NULL OR w.stage<>'PENDING_TEACHER')
      AND (j.id IS NULL OR (j.policy_version<>${AI_AUTO_POLICY} AND (j.status<>'RUNNING' OR j.lease_until<=now())))
    ORDER BY m.accepted_at,w.record_id LIMIT 25`;
  let count=0;
  for (const candidate of candidates) {
    count += await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${candidate.organization_id}::uuid FOR NO KEY UPDATE`;
      const policy=await tx.systemPolicy.findUnique({where:{organizationId:candidate.organization_id}});
      if (policy?.systemMode!=='NORMAL') return 0;
      const states=await tx.$queryRaw<{stage:string;material_version:number;version:number;has_material:boolean}[]>`
        SELECT stage,material_version,version,EXISTS(SELECT 1 FROM v81_material_versions m
          WHERE m.record_id=w.record_id AND m.material_version=w.material_version) AS has_material
        FROM v81_record_workflows w WHERE record_id=${candidate.record_id}::uuid FOR UPDATE`;
      const state=states[0];
      if (!state || !['PENDING_TEACHER','PENDING_AI','TECHNICAL'].includes(state.stage)) return 0;
      const jobs=await tx.$queryRaw<{id:string;policy_version:string;status:string;lease_until:Date|null;recommendation:string|null;assessment:unknown;flags:unknown}[]>`
        SELECT id,policy_version,status,lease_until,recommendation,assessment,flags FROM v81_ai_review_jobs
        WHERE record_id=${candidate.record_id}::uuid AND material_version=${state.material_version} FOR UPDATE`;
      const job=jobs[0],now=new Date();
      if (job?.policy_version===AI_AUTO_POLICY || (job?.status==='RUNNING' && job.lease_until && job.lease_until>now)) return 0;
      if (job) {
        await appendV81SystemEvent(tx,{organizationId:candidate.organization_id,resourceType:'AI_REVIEW_JOB',resourceId:job.id,
          eventType:'HISTORICAL_REVIEW_ENQUEUED',requestId:randomUUID(),version:1,occurredAt:now,outcome:'SUCCEEDED',
          facts:{previousPolicy:job.policy_version,previousStatus:job.status,previousRecommendation:job.recommendation,
            previousAssessment:job.assessment,previousFlags:job.flags,materialVersion:state.material_version}});
        await tx.$executeRaw`UPDATE v81_ai_review_jobs SET policy_version=${AI_AUTO_POLICY},status='QUEUED',attempts=0,
          lease_owner=NULL,lease_until=NULL,recommendation=NULL,assessment=NULL,flags='[]'::jsonb,error_code=NULL,
          next_attempt_at=${now},completed_at=NULL,updated_at=${now} WHERE id=${job.id}::uuid`;
      } else if (state.has_material) await enqueueAiReview(tx,{recordId:candidate.record_id,organizationId:candidate.organization_id,materialVersion:state.material_version,now});
      if (state.stage!=='PENDING_TEACHER') {
        await tx.$executeRaw`UPDATE v81_record_workflows SET stage='PENDING_TEACHER',teacher_round_started_at=${now},version=version+1,updated_at=${now}
          WHERE record_id=${candidate.record_id}::uuid`;
        await appendV81SystemEvent(tx,{organizationId:candidate.organization_id,resourceType:'RECORD_REVIEW',resourceId:candidate.record_id,
          eventType:'AI_HISTORY_TEACHER_FALLBACK',requestId:randomUUID(),version:state.version+1,occurredAt:now,outcome:'SUCCEEDED',
          facts:{previousStage:state.stage,materialVersion:state.material_version}});
      }
      return 1;
    });
  }
  return count;
}
