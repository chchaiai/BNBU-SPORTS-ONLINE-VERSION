import type { Prisma } from '../../generated/prisma/client.js';
import { swimTransferClock } from './domain/swim-intake.js';

export async function readSwimTransfer(tx: Pick<Prisma.TransactionClient, '$queryRaw'>, recordId: string, now: Date) {
  const rows = await tx.$queryRaw<{
    organization_id: string; class_section_id: string; accepted_at: Date; session_ended_at: Date;
    transfer_deadline: Date; intake_kind: string; delay_reason: string | null;
  }[]>`SELECT i.*,r.class_section_id FROM v81_swim_intakes i JOIN exercise_records r ON r.id=i.record_id
    WHERE i.record_id=${recordId}::uuid`;
  const row = rows[0];
  if (!row) return null;
  const items = await tx.$queryRaw<{
    media_id: string; phase: 'BEFORE' | 'AFTER' | 'OTHER'; position: number;
    upload_status: string; confirmed_at: Date | null;
  }[]>`SELECT i.media_id,i.phase,i.position,m.upload_status,u.confirmed_at
    FROM v81_swim_intake_items i JOIN media_evidence m ON m.id=i.media_id
    LEFT JOIN media_upload_sessions u ON u.media_id=m.id WHERE i.record_id=${recordId}::uuid ORDER BY i.position`;
  const complete = items.length > 0 && items.every((item) => item.confirmed_at !== null);
  const completedAt = complete ? new Date(Math.max(row.accepted_at.getTime(), ...items.map((item) => item.confirmed_at!.getTime()))) : null;
  const observedAt = completedAt ?? now;
  const intervals = await tx.$queryRaw<{ startedAt: Date; endedAt: Date | null }[]>`
    SELECT started_at AS "startedAt",ended_at AS "endedAt" FROM v81_interruptions
    WHERE organization_id=${row.organization_id}::uuid AND (class_section_id IS NULL OR class_section_id=${row.class_section_id}::uuid)
    AND started_at<=${observedAt} AND (ended_at IS NULL OR ended_at>${row.accepted_at})`;
  const clock = swimTransferClock(row.accepted_at, observedAt, intervals);
  return {
    recordId, acceptedAt: row.accepted_at, sessionEndedAt: row.session_ended_at,
    originalTransferDeadline: row.transfer_deadline, transferDeadline: clock.deadline,
    intakeKind: row.intake_kind, delayReason: row.delay_reason,
    completedAt, paused: !complete && clock.paused, remainingMs: complete ? 0 : clock.remainingMs,
    transferLate: clock.expired, readyForReview: complete && items.every((item) => item.upload_status === 'AVAILABLE'),
    items: items.map((item) => ({ mediaId: item.media_id, phase: item.phase, uploadStatus: item.upload_status })),
  };
}
