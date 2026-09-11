import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client.js';

/** Call only after the corresponding system action has completed in this transaction. */
export async function appendV81SystemEvent(tx: Prisma.TransactionClient, input: {
  organizationId: string; resourceType: string; resourceId: string; eventType: string;
  requestId: string; version: number; occurredAt: Date; outcome: 'SUCCEEDED' | 'FAILED';
  reasonCode?: string | null; facts: Record<string, unknown>;
}) {
  await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,
    is_system_actor,event_outcome,event_reason_code,request_id,version,facts,occurred_at)
    VALUES(${randomUUID()}::uuid,${input.organizationId}::uuid,${input.resourceType},${input.resourceId}::uuid,${input.eventType},NULL,
      true,${input.outcome},${input.reasonCode ?? null},${input.requestId},${input.version},${JSON.stringify(input.facts)}::jsonb,${input.occurredAt})`;
}
