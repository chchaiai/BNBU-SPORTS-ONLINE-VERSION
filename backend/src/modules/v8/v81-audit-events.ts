import { Controller, Get, Injectable, Param, ParseUUIDPipe, Query, Req } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { AuditService, projectSafeAuditMetadata } from '../../common/audit/audit.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { ScopedCursorService } from '../../common/pagination/scoped-cursor.service.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import type { AuthenticatedPrincipal, FoundationRequest } from '../../common/http/request-context.js';
import { requireAdminAccess } from './v81-admin-access.js';

export class AuditEventQuery {
  @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 50;
  @ValidateIf((_o,v: unknown) => v !== undefined) @IsString() @MaxLength(2048) cursor?: string;
  @ValidateIf((_o,v: unknown) => v !== undefined) @IsIn(['FOUNDATION','V81']) source?: string;
  @ValidateIf((_o,v: unknown) => v !== undefined) @IsString() @MaxLength(100) @Matches(/\S/u) action?: string;
  @ValidateIf((_o,v: unknown) => v !== undefined) @IsString() @MaxLength(100) @Matches(/\S/u) outcome?: string;
  @ValidateIf((_o,v: unknown) => v !== undefined) @IsString() @MaxLength(64) @Matches(/\S/u) requestId?: string;
  @ValidateIf((_o,v: unknown) => v !== undefined) @IsUUID() actorUserId?: string;
  @ValidateIf((_o,v: unknown) => v !== undefined) @IsString() @MaxLength(100) @Matches(/\S/u) targetType?: string;
  @ValidateIf((_o,v: unknown) => v !== undefined) @IsUUID() targetId?: string;
  @ValidateIf((_o,v: unknown) => v !== undefined) @Matches(/^\d{4}-\d{2}-\d{2}$/u) startDate?: string;
  @ValidateIf((_o,v: unknown) => v !== undefined) @Matches(/^\d{4}-\d{2}-\d{2}$/u) endDate?: string;
}
type EventRow = { id: string; source: string; actor_user_id: string | null; actor_role_snapshot: string | null;
  action_type: string; target_type: string; target_id: string | null; request_id: string; outcome: string | null;
  reason_code: string | null; safe_metadata: unknown; occurred_at: Date; version: number | null };
const project = (e: EventRow) => ({ id: e.id, source: e.source, actorUserId: e.actor_user_id, actorRoleSnapshot: e.actor_role_snapshot,
  actionType: e.action_type, targetType: e.target_type, targetId: e.target_id, requestId: e.request_id, outcome: e.outcome,
  reasonCode: e.reason_code, safeMetadata: e.source === 'V81' ? { version: e.version } : projectSafeAuditMetadata(e.action_type, e.safe_metadata),
  occurredAt: e.occurred_at.toISOString() });
@Injectable()
export class V81AuditEventsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly cursors: ScopedCursorService) {}
  private base(organizationId: string) {
    return Prisma.sql`SELECT id,'FOUNDATION'::text AS source,actor_user_id,actor_role_snapshot,action_type,target_type,target_id,request_id,
      outcome,reason_code,safe_metadata,occurred_at,NULL::integer AS version FROM audit_logs WHERE organization_id=${organizationId}::uuid
      UNION ALL SELECT id,'V81'::text,actor_id,actor_role_snapshot,resource_type||'.'||event_type,resource_type,resource_id,request_id,
      event_outcome,event_reason_code,NULL::jsonb,occurred_at,version FROM v81_events WHERE organization_id=${organizationId}::uuid`;
  }
  async list(p: AuthenticatedPrincipal, q: AuditEventQuery, requestId: string) {
    for (const date of [q.startDate,q.endDate]) if (date !== undefined) {
      const parsed = new Date(date + 'T00:00:00Z');
      if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== date || date.startsWith('0000'))
        throw new ApplicationError('VALIDATION_FAILED',422);
    }
    if (q.startDate && q.endDate && q.startDate > q.endDate) throw new ApplicationError('VALIDATION_FAILED',422);
    const filters = { scope: 'UNIFIED_AUDIT', source: q.source ?? null, action: q.action ?? null, outcome: q.outcome ?? null,
      requestId: q.requestId ?? null, actorUserId: q.actorUserId ?? null, targetType: q.targetType ?? null, targetId: q.targetId ?? null,
      startDate: q.startDate ?? null, endDate: q.endDate ?? null };
    const binding = { resource: 'AUDIT_LOG' as const, organizationId: p.organizationId, principalId: p.userId, role: p.role,
      filters, sort: '-occurredAt,-id,-source', limit: q.limit };
    const position = this.cursors.decode(q.cursor,binding);
    const [time,source] = position ? position.value.split('|') : [];
    return this.prisma.$transaction(async tx => {
      await requireAdminAccess(tx,p,'AUDIT_QUERY');
      const org = await tx.organization.findUniqueOrThrow({ where: { id: p.organizationId } });
      const rows = await tx.$queryRaw<EventRow[]>(Prisma.sql`WITH e AS (${this.base(p.organizationId)}) SELECT * FROM e WHERE
        (${q.source ?? null}::text IS NULL OR source=${q.source ?? null}) AND (${q.action ?? null}::text IS NULL OR action_type=${q.action ?? null})
        AND (${q.outcome ?? null}::text IS NULL OR outcome=${q.outcome ?? null}) AND (${q.requestId ?? null}::text IS NULL OR request_id=${q.requestId ?? null})
        AND (${q.actorUserId ?? null}::uuid IS NULL OR actor_user_id=${q.actorUserId ?? null}::uuid)
        AND (${q.targetType ?? null}::text IS NULL OR target_type=${q.targetType ?? null}) AND (${q.targetId ?? null}::uuid IS NULL OR target_id=${q.targetId ?? null}::uuid)
        AND (${q.startDate ?? null}::date IS NULL OR occurred_at>=(${q.startDate ?? null}::date::timestamp AT TIME ZONE ${org.timezone}))
        AND (${q.endDate ?? null}::date IS NULL OR occurred_at<(((${q.endDate ?? null}::date)+1)::timestamp AT TIME ZONE ${org.timezone}))
        AND (${time ?? null}::timestamptz IS NULL OR occurred_at<${time ?? null}::timestamptz OR (occurred_at=${time ?? null}::timestamptz AND
          (id<${position?.id ?? null}::uuid OR (id=${position?.id ?? null}::uuid AND source<${source ?? null}))))
        ORDER BY occurred_at DESC,id DESC,source DESC LIMIT ${q.limit + 1}`);
      const page = rows.slice(0,q.limit), last = page.at(-1);
      await this.audit.append(tx,{ organizationId:p.organizationId,actorUserId:p.userId,actorRoleSnapshot:p.role,permissionId:'AUDIT-LOG-LIST',
        actionType:'AUDIT_LOG_READ',targetType:'AUDIT_LOG_COLLECTION',targetId:null,requestId,outcome:'SUCCEEDED',safeMetadata:{readKind:'LIST',resultCount:page.length} });
      return { items:page.map(project),timezone:org.timezone,nextCursor: rows.length>q.limit && last
        ? this.cursors.encode(binding,{id:last.id,value:last.occurred_at.toISOString()+'|'+last.source}) : null };
    },{isolationLevel:'RepeatableRead'});
  }
  async get(p: AuthenticatedPrincipal,source: string,id: string,requestId:string) {
    if (!['FOUNDATION','V81'].includes(source)) throw new ApplicationError('VALIDATION_FAILED',422);
    return this.prisma.$transaction(async tx => {
      await requireAdminAccess(tx,p,'AUDIT_QUERY');
      const rows = await tx.$queryRaw<EventRow[]>(Prisma.sql`WITH e AS (${this.base(p.organizationId)}) SELECT * FROM e WHERE source=${source} AND id=${id}::uuid`);
      if (!rows[0]) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND',404);
      await this.audit.append(tx,{organizationId:p.organizationId,actorUserId:p.userId,actorRoleSnapshot:p.role,permissionId:'AUDIT-LOG-READ',
        actionType:'AUDIT_LOG_READ',targetType:'AUDIT_LOG',targetId:id,requestId,outcome:'SUCCEEDED',safeMetadata:{readKind:'GET',resultCount:1}});
      return project(rows[0]);
    },{isolationLevel:'RepeatableRead'});
  }
}
@Controller('admin/audit-events')
export class V81AuditEventsController {
  constructor(private readonly service:V81AuditEventsService) {}
  @Get() @OperationPolicy('listV81AuditEvents')
  list(@CurrentPrincipal() p:AuthenticatedPrincipal,@Query() q:AuditEventQuery,@Req() r:FoundationRequest) { return this.service.list(p,q,r.requestId); }
  @Get(':source/:eventId') @OperationPolicy('getV81AuditEvent')
  get(@CurrentPrincipal() p:AuthenticatedPrincipal,@Param('source') source:string,
    @Param('eventId',new ParseUUIDPipe({exceptionFactory:()=>new ApplicationError('VALIDATION_FAILED',422)})) id:string,
    @Req() r:FoundationRequest) { return this.service.get(p,source,id,r.requestId); }
}
