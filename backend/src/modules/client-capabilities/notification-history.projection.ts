import type { Prisma } from '../../generated/prisma/client.js';
import { recoverLegacyReviewContent } from '../v8/domain/notification-history.js';
import type { NotificationRow } from './client-messaging.projection.js';

// Input rows must already be authorized for the recipient by the caller.
// Recover display facts from immutable history without modifying notifications.
export async function enrichNotificationHistory(
  db: Pick<Prisma.TransactionClient, '$queryRaw'>,
  rows: NotificationRow[],
): Promise<NotificationRow[]> {
  const legacy = rows.filter(n => n.reviewContent == null && n.notificationType === 'EXERCISE_RECORD_RESULT' && n.targetType === 'EXERCISE_RECORD' && n.targetId);
  if (legacy.length === 0) return rows;
  const selection = legacy.map(n => {
    const issued = n.id[14] === '7' ? parseInt(n.id.replaceAll('-', '').slice(0, 12), 16) : n.createdAt.getTime();
    return { id: n.id, organization: n.organizationId, record: n.targetId,
      created: n.createdAt.toISOString(), bound: new Date(Math.max(issued, n.createdAt.getTime())).toISOString() };
  });
  const facts = await db.$queryRaw<Array<{ id: string; content: unknown }>>`
    WITH selected AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(selection)}::jsonb)
      AS s(id uuid, organization uuid, record uuid, created timestamptz, bound timestamptz)
    )
    SELECT s.id, jsonb_build_object('version',1,'stage',r.result,'reasonCode',r.reason_code,'publicComment',r.public_comment) AS content
    FROM selected s JOIN review_records r ON r.organization_id=s.organization AND r.record_id=s.record AND r.created_at<=s.created
    UNION ALL
    SELECT s.id, jsonb_build_object('version',1,'stage',stage.value,'reasonCode',e.facts->'reasonCode','publicComment',e.facts->'publicComment') AS content
    FROM selected s JOIN v81_events e ON e.organization_id=s.organization AND e.resource_id=s.record
      AND e.resource_type='RECORD_REVIEW' AND e.occurred_at<=s.bound AND e.id<s.id
      AND e.event_type IN ('RETURN_FOR_SUPPLEMENT','FACT_CORRECTED') AND e.facts->>'action'='RETURN_FOR_SUPPLEMENT'
    CROSS JOIN (VALUES ('AWAITING_SUPPLEMENT'),('PENDING_TEACHER')) AS stage(value)
  `;
  const candidates = new Map<string, unknown[]>();
  for (const fact of facts) {
    const values = candidates.get(fact.id) ?? [];
    values.push(fact.content);
    candidates.set(fact.id, values);
  }
  const ids = new Set(legacy.map(n => n.id));
  return rows.map(n => ids.has(n.id) ? { ...n, reviewContent: recoverLegacyReviewContent(n, candidates.get(n.id) ?? []) } : n);
}
