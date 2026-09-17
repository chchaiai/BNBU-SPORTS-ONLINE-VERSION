import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import type { AiFlag, AiRecommendation } from './domain/ai-review.js';
import { AI_AUTO_POLICY } from './domain/ai-review.js';

export interface AiReviewProjection {
  status: string;
  materialVersion: number;
  recommendation: AiRecommendation | null;
  flags: AiFlag[];
  completedAt: string | null;
  errorCode: string | null;
  policyVersion: string;
}

export async function enqueueAiReview(tx: Prisma.TransactionClient, input: { recordId: string; organizationId: string; materialVersion: number; now: Date }): Promise<void> {
  await tx.$executeRaw`INSERT INTO v81_ai_review_jobs(id,organization_id,record_id,material_version,created_at,updated_at,next_attempt_at,policy_version)
    VALUES(${randomUUID()}::uuid,${input.organizationId}::uuid,${input.recordId}::uuid,${input.materialVersion},${input.now},${input.now},${input.now},${AI_AUTO_POLICY})
    ON CONFLICT(record_id,material_version) DO NOTHING`;
}

export async function readAiReviews(tx: Pick<Prisma.TransactionClient, '$queryRaw'>, recordIds: readonly string[]): Promise<Map<string, AiReviewProjection>> {
  if (!recordIds.length) return new Map();
  const rows = await tx.$queryRaw<{record_id: string; status: string; material_version: number; recommendation: AiRecommendation | null; flags: AiFlag[]; completed_at: Date | null; error_code: string | null; policy_version: string}[]>`
    SELECT j.record_id,j.status,j.material_version,j.recommendation,j.flags,j.completed_at,j.error_code,j.policy_version
    FROM v81_ai_review_jobs j JOIN v81_record_workflows w ON w.record_id=j.record_id AND w.material_version=j.material_version
    WHERE j.record_id::text IN (${Prisma.join(recordIds)})`;
  return new Map(rows.map(row => [row.record_id, { status: row.status, materialVersion: row.material_version,
    recommendation: row.recommendation, flags: row.flags, completedAt: row.completed_at?.toISOString() ?? null,
    errorCode: row.error_code, policyVersion: row.policy_version }]));
}
