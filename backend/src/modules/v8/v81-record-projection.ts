import { displaySportName } from './domain/sport-display.js';
import { Prisma } from '../../generated/prisma/client.js';
import { readAiReviews, type AiReviewProjection } from './v81-ai-review-store.js';
import {
  projectExerciseRecord,
  type ExerciseRecordWithReview,
} from '../exercise-records/application/exercise-record-projection.js';

export async function projectV81Records(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  records: readonly ExerciseRecordWithReview[],
  includeAi = false,
) {
  if (!records.length) return [];
  const ai = includeAi ? await readAiReviews(tx, records.map(record => record.id)) : new Map<string,AiReviewProjection>();
  const rows = await tx.$queryRaw<
    {
      record_id: string;
      stage: string;
      material_version: number;
      public_reason: string | null;
      public_comment: string | null;
      eligible_minutes: number;
      credited_minutes: number;
      reason: string | null;
      version: number;
    }[]
  >`
    SELECT w.record_id,w.stage,w.material_version,w.public_reason,w.public_comment,w.version,
      coalesce(p.eligible_minutes,0) AS eligible_minutes,coalesce(p.credited_minutes,0) AS credited_minutes,p.reason
    FROM v81_record_workflows w LEFT JOIN v81_credit_projections p ON p.record_id=w.record_id
    WHERE w.record_id::text IN (${Prisma.join(records.map((record) => record.id))})`;
  const sources = await tx.$queryRaw<{session_id:string}[]>`SELECT session_id FROM v81_history_session_sources
    WHERE session_id::text IN (${Prisma.join(records.map(record=>record.sessionId))})`;
  const historical = new Set(sources.map(row=>row.session_id));
  const states = new Map(rows.map((row) => [row.record_id, row]));
  const courses = await tx.$queryRaw<{id:string;display_name:string}[]>`SELECT id,display_name FROM class_sections WHERE id::text IN (${Prisma.join([...new Set(records.map(record=>record.classSectionId))])})`;
  return records.map((record) => {
    const original = {...projectExerciseRecord(record),sportName:displaySportName(record.sportName,record.creditType,courses.find(c=>c.id===record.classSectionId)?.display_name??''),recordOrigin:historical.has(record.sessionId)?'HISTORICAL':'LIVE'},
      state = states.get(record.id);
    if (!state) return historical.has(record.sessionId)
      ? { ...original, creditedDurationSeconds: 0 }
      : original;
    return {
      ...original,
      ...(includeAi ? { aiReview: ai.get(record.id) ?? null } : {}),
      creditedDurationSeconds: state.stage === 'VALID' ? state.credited_minutes * 60 : 0,
      eligibleMinutes: state.eligible_minutes,
      creditReason: state.reason,
      workflowStage: state.stage,
      workflowVersion: state.version,
      materialVersion: state.material_version,
      currentReview: {
        result:
          state.stage === 'VALID' ? 'VALID' : state.stage === 'INVALID' ? 'INVALID' : 'PENDING',
        reasonCode: state.public_reason,
        publicComment: state.public_comment,
      },
    };
  });
}
