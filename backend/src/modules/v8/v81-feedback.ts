import { permitsSystemMode } from '../system-mode/system-mode-access.js';
import { Body, Controller, Get, Headers, Injectable, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { IsIn, IsInt, IsString, Matches, MaxLength, Min, Max, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import type { AuthenticatedPrincipal, FoundationRequest } from '../../common/http/request-context.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import { Clock } from '../../common/time/clock.js';
import { IdGenerator } from '../../common/time/id-generator.js';
import { requireAdminAccess } from './v81-admin-access.js';

export class HandleFeedbackInput {
  @IsIn(['IN_PROGRESS', 'WAITING_TECH', 'RESOLVED', 'CLOSED']) status!: string;
  @IsString() @Matches(/\S/u) @MaxLength(2000) publicReply!: string;
  @IsInt() @Min(1) expectedVersion!: number;
}

export class FeedbackListQuery {
  @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsString() @MaxLength(200) search?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsIn(['BUG', 'SUGGESTION', 'ACCESSIBILITY', 'PRIVACY', 'OTHER']) category?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsIn(['OPEN', 'IN_PROGRESS', 'WAITING_TECH', 'RESOLVED', 'CLOSED']) status?: string;
}
type FeedbackReadRow = {
  id: string; category: string; content: string; status: string; publicReply: string | null;
  version: number; createdAt: Date; updatedAt: Date;
  requesterRole: string; requesterName: string | null; requesterNumber: string | null; requesterEmail: string | null;
};
const feedbackReadColumns = Prisma.sql`f.id,f.category,f.content,f.status,f.public_reply AS "publicReply",
  f.version,f.created_at AS "createdAt",f.updated_at AS "updatedAt",
  subject.role_at_creation AS "requesterRole",COALESCE(p.full_name,t.full_name) AS "requesterName",COALESCE(p.student_number,t.employee_number) AS "requesterNumber",u.primary_email AS "requesterEmail"`;
const feedbackReadRelations = Prisma.sql`FROM feedback f
  JOIN v81_user_subjects subject ON subject.id=f.created_by_user_id AND subject.organization_id=f.organization_id
    AND subject.role_at_creation IN ('STUDENT','TEACHER')
  LEFT JOIN users u ON u.id=f.created_by_user_id AND u.organization_id=f.organization_id AND u.deleted_at IS NULL
  LEFT JOIN student_profiles p ON p.user_id=u.id AND p.organization_id=f.organization_id
  LEFT JOIN teacher_profiles t ON t.user_id=u.id AND t.organization_id=f.organization_id`;
const projectFeedback = (row: FeedbackReadRow) => ({ id: row.id, category: row.category, content: row.content,
  status: row.status, version: row.version, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  requester: { role: row.requesterRole, name: row.requesterName, studentNumber: row.requesterNumber, email: row.requesterEmail } });

@Injectable()
export class V81FeedbackService {
  constructor(private readonly prisma: PrismaService, private readonly idempotency: IdempotencyService,
    private readonly clock: Clock, private readonly ids: IdGenerator) {}

  async list(principal: AuthenticatedPrincipal, query: FeedbackListQuery) {
    await requireAdminAccess(this.prisma, principal, 'STUDENT_FEEDBACK');
    const search = query.search?.trim();
    const pattern = search ? `%${search.replace(/[\\%_]/g, '\\$&')}%` : null;
    const scope = Prisma.sql`f.organization_id=${principal.organizationId}::uuid`;
    const filter = Prisma.sql`${scope}
      AND (${query.category ?? null}::text IS NULL OR f.category=${query.category ?? null})
      AND (${query.status ?? null}::text IS NULL OR f.status=${query.status ?? null})
      AND (${pattern}::text IS NULL OR f.id::text=${search?.toLowerCase() ?? null}
        OR f.content ILIKE ${pattern} OR f.category ILIKE ${pattern}
        OR u.primary_email ILIKE ${pattern} OR p.full_name ILIKE ${pattern} OR p.student_number ILIKE ${pattern} OR t.full_name ILIKE ${pattern} OR t.employee_number ILIKE ${pattern})`;
    return this.prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<FeedbackReadRow[]>`SELECT ${feedbackReadColumns} ${feedbackReadRelations}
        WHERE ${filter} ORDER BY f.created_at DESC,f.id DESC OFFSET ${(query.page - 1) * 6} LIMIT 6`;
      const [total] = await tx.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count ${feedbackReadRelations} WHERE ${filter}`;
      const groups = await tx.$queryRaw<{ status: string; count: number }[]>`SELECT f.status,count(*)::int AS count
        ${feedbackReadRelations} WHERE ${scope} GROUP BY f.status`;
      const count = (status: string) => groups.find(group => group.status === status)?.count ?? 0;
      return { items: rows.map(projectFeedback), page: query.page, pageSize: 6, total: total!.count,
        summary: { total: groups.reduce((sum, group) => sum + group.count, 0),
          pending: count('OPEN') + count('IN_PROGRESS') + count('WAITING_TECH'), waitingTech: count('WAITING_TECH'), resolved: count('RESOLVED') } };
    }, { isolationLevel: 'RepeatableRead' });
  }

  async detail(principal: AuthenticatedPrincipal, id: string) {
    await requireAdminAccess(this.prisma, principal, 'STUDENT_FEEDBACK');
    return this.prisma.$transaction(async tx => {
      const [row] = await tx.$queryRaw<FeedbackReadRow[]>`SELECT ${feedbackReadColumns} ${feedbackReadRelations}
        WHERE f.id=${id}::uuid AND f.organization_id=${principal.organizationId}::uuid`;
      if (!row) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      const history = await tx.$queryRaw<{ id: string; actorUserId: string; actorName: string | null;
        publicReply: string; previousStatus: string; nextStatus: string; occurredAt: Date; eventVersion: number }[]>`
        SELECT e.id,e.actor_user_id AS "actorUserId",p.full_name AS "actorName",e.public_reply AS "publicReply",
          e.previous_status AS "previousStatus",e.next_status AS "nextStatus",e.occurred_at AS "occurredAt",e.event_version AS "eventVersion"
        FROM feedback_events e LEFT JOIN users u ON u.id=e.actor_user_id AND u.organization_id=e.organization_id AND u.deleted_at IS NULL
        LEFT JOIN admin_profiles p ON p.user_id=u.id AND p.organization_id=e.organization_id
        WHERE e.feedback_id=${id}::uuid AND e.organization_id=${principal.organizationId}::uuid AND e.event_type='HANDLED'
        ORDER BY e.event_version`;
      return { ...projectFeedback(row), publicReply: row.publicReply,
        history: history.map(event => ({ ...event, occurredAt: event.occurredAt.toISOString() })) };
    }, { isolationLevel: 'RepeatableRead' });
  }

  async studentHistory(principal: AuthenticatedPrincipal, id: string) {
    if (!['STUDENT','TEACHER'].includes(principal.role)) throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    const feedback = await this.prisma.feedback.findFirst({ where: { id, organizationId: principal.organizationId,
      createdByUserId: principal.userId }, include: { events: { where: { eventType: 'HANDLED' },
        orderBy: { eventVersion: 'asc' }, select: { id: true, publicReply: true, nextStatus: true, occurredAt: true, eventVersion: true } } } });
    if (!feedback) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    return { feedbackId: id, status: feedback.status, version: feedback.version,
      items: feedback.events.map(event => ({ id: event.id, publicReply: event.publicReply,
        status: event.nextStatus, occurredAt: event.occurredAt.toISOString(), version: event.eventVersion })) };
  }

  async handle(principal: AuthenticatedPrincipal, id: string, input: HandleFeedbackInput,
    requestId: string, key: string | undefined) {
    await requireAdminAccess(this.prisma, principal, 'STUDENT_FEEDBACK');
    const reply = input.publicReply.trim();
    if (!reply || !['IN_PROGRESS', 'WAITING_TECH', 'RESOLVED', 'CLOSED'].includes(input.status))
      throw new ApplicationError('VALIDATION_FAILED', 422);
    return this.idempotency.execute({ organizationId: principal.organizationId, principalId: principal.userId,
      authSessionId: principal.sessionId, operationId: 'handleV81Feedback', scope: `${principal.organizationId}:${id}`,
      request: input, requestId, key }, async tx => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
      await requireAdminAccess(tx, principal, 'STUDENT_FEEDBACK');
      const policy = await tx.systemPolicy.findUnique({ where: { organizationId: principal.organizationId } });
      if (!permitsSystemMode(policy?.systemMode, principal.role)) throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
      const row = await tx.feedback.findFirst({ where: { id, organizationId: principal.organizationId } });
      if (!row) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      if (row.version !== input.expectedVersion) throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
      const now = this.clock.now(), version = row.version + 1;
      const changed = await tx.feedback.updateMany({ where: { id, version: input.expectedVersion },
        data: { status: input.status, publicReply: reply, updatedAt: now, version } });
      if (changed.count !== 1) throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
      await tx.feedbackEvent.create({ data: { id: this.ids.next(), organizationId: principal.organizationId,
        feedbackId: id, eventType: 'HANDLED', actorUserId: principal.userId, authSessionId: principal.sessionId,
        requestId, eventVersion: version, occurredAt: now, previousStatus: row.status, nextStatus: input.status,
        publicReply: reply } });
      const preference = await tx.userPreference.findUnique({ where: { userId: row.createdByUserId } });
      await tx.notification.create({ data: { id: this.ids.next(), organizationId: principal.organizationId,
        recipientUserId: row.createdByUserId, notificationType: 'FEEDBACK_UPDATED',
        title: preference?.locale === 'en' ? 'Feedback updated' : '反馈处理已更新',
        body: reply, targetType: 'FEEDBACK', targetId: id, createdAt: now } });
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${this.ids.next()}::uuid,${principal.organizationId}::uuid,'FEEDBACK',${id}::uuid,'HANDLED',
          ${principal.userId}::uuid,${requestId},${version},
          ${JSON.stringify({ previousStatus: row.status, nextStatus: input.status, feedbackEventVersion: version })}::jsonb,${now},'SUCCEEDED')`;
      return this.idempotency.success({ id, status: input.status, publicReply: reply, version, updatedAt: now.toISOString() });
    });
  }
}

const feedbackUuid = new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) });
@Controller('student/feedback')
export class V81StudentFeedbackController {
  constructor(private readonly service: V81FeedbackService) {}
  @Get(':feedbackId/history') @OperationPolicy('getV81StudentFeedbackHistory')
  history(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('feedbackId', feedbackUuid) id: string) {
    return this.service.studentHistory(principal, id);
  }
}

@Controller('admin/feedback')
export class V81FeedbackController {
  constructor(private readonly service: V81FeedbackService) {}
  @Get() @OperationPolicy('listV81Feedback')
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Query() query: FeedbackListQuery) { return this.service.list(principal, query); }
  @Get(':feedbackId') @OperationPolicy('getV81FeedbackDetail')
  detail(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('feedbackId', feedbackUuid) id: string) {
    return this.service.detail(principal, id);
  }
  @Post(':feedbackId/handling') @OperationPolicy('handleV81Feedback')
  handle(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('feedbackId', feedbackUuid) id: string,
    @Body() input: HandleFeedbackInput, @Headers('idempotency-key') key: string | undefined, @Req() req: FoundationRequest) {
    return this.service.handle(principal, id, input, req.requestId, key);
  }
}

