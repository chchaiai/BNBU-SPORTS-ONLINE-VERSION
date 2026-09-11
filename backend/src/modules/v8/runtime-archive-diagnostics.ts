import type { PrismaService } from '../../common/database/prisma.service.js';
import type { safeHttpRuntimeRecord } from '../../common/logging/runtime-log-source.js';

type HttpRecord = NonNullable<ReturnType<typeof safeHttpRuntimeRecord>>;
type AuditRow = { id: string; source: string; action_type: string; target_type: string; target_id: string | null;
  actor_user_id: string | null; actor_role_snapshot: string | null; request_id: string; outcome: string | null;
  reason_code: string | null; occurred_at: Date; version: number | null };

/** Date-scoped diagnostic projections. Never select raw audit metadata or business facts. */
export async function runtimeArchiveDiagnostics(prisma: PrismaService, organizationId: string,
  startDate: string, endDate: string, timezone: string, records: readonly HttpRecord[]) {
  const rows = await prisma.$queryRaw<AuditRow[]>`WITH events AS (
    SELECT id,'FOUNDATION'::text AS source,action_type,target_type,target_id,actor_user_id,actor_role_snapshot,
      request_id,outcome,reason_code,occurred_at,NULL::integer AS version FROM audit_logs
      WHERE organization_id=${organizationId}::uuid
    UNION ALL SELECT id,'V81'::text,resource_type||'.'||event_type,resource_type,resource_id,actor_id,actor_role_snapshot,
      request_id,event_outcome,event_reason_code,occurred_at,version FROM v81_events WHERE organization_id=${organizationId}::uuid
    ) SELECT * FROM events WHERE occurred_at>=(${startDate}::date::timestamp AT TIME ZONE ${timezone})
      AND occurred_at<((${endDate}::date+1)::timestamp AT TIME ZONE ${timezone})
      ORDER BY occurred_at,id,source LIMIT 100001`;
  if (rows.length > 100000) throw new Error('RUNTIME_ARCHIVE_AUDIT_TOO_LARGE');
  const auditEvents = rows.map(r => ({ id: r.id, source: r.source, actionType: r.action_type, targetType: r.target_type,
    targetId: r.target_id, actorUserId: r.actor_user_id, actorRoleSnapshot: r.actor_role_snapshot, requestId: r.request_id,
    outcome: r.outcome, reasonCode: r.reason_code, occurredAt: r.occurred_at.toISOString(),
    safeMetadata: r.source === 'V81' ? { version: r.version } : {} }));
  const correlation = new Map<string, { requestId: string; httpRecordIndexes: number[]; auditEvents: { id: string; source: string }[] }>();
  const entry = (id: string) => {
    let value = correlation.get(id);
    if (!value) { value = { requestId: id, httpRecordIndexes: [], auditEvents: [] }; correlation.set(id, value); }
    return value;
  };
  records.forEach((r, index) => entry(r.requestId).httpRecordIndexes.push(index));
  auditEvents.forEach(r => entry(r.requestId).auditEvents.push({ id: r.id, source: r.source }));
  const durations = records.map(r => r.durationMs).sort((a, b) => a - b);
  const health = { source: 'SCOPED_HTTP_OBSERVATIONS', startDate, endDate, timezone,
    requestCount: records.length, serverErrorCount: records.filter(r => r.statusCode >= 500).length,
    clientErrorCount: records.filter(r => r.statusCode >= 400 && r.statusCode < 500).length,
    durationP95Ms: durations.length ? durations[Math.ceil(durations.length * 0.95) - 1] : null,
    firstObservedAt: records.length ? records[0]!.time : null, lastObservedAt: records.length ? records.at(-1)!.time : null,
    availability: records.length ? 'OBSERVATIONS_AVAILABLE' : 'NO_OBSERVATIONS',
    infrastructureHealth: 'UNAVAILABLE', retentionCompleteness: 'UNVERIFIED' };
  return { auditEvents, health, requests: [...correlation.values()].sort((a, b) => a.requestId.localeCompare(b.requestId)) };
}
