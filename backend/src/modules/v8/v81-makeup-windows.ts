import { requireUnsettledCourse } from './v81-settlement-write-guard.js';
import { Body, Controller, Get, Headers, Injectable, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { PrismaService } from '../../common/database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import type { AuthenticatedPrincipal, FoundationRequest } from '../../common/http/request-context.js';
import { Clock } from '../../common/time/clock.js';
import { IdGenerator } from '../../common/time/id-generator.js';
import { OrganizationTimeService } from '../../common/time/organization-time.service.js';
import { validateMakeupWindow } from './domain/makeup-window.js';

export class MakeupWindowInput {
  @IsUUID() enrollmentId!: string;
  @IsInt() @Min(1) @Max(2147483647) expectedRuleVersion!: number;
  @IsISO8601({ strict: true }) @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/u) startsAt!: string;
  @IsISO8601({ strict: true }) @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/u) endsAt!: string;
}
export class MakeupRevocationInput {
  @IsInt() @Min(1) @Max(2147483647) expectedVersion!: number;
  @IsString() @MinLength(1) @MaxLength(1000) @Matches(/\S/u) reason!: string;
}
export class MakeupWindowQuery {
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @ValidateIf((_o, v: unknown) => v !== undefined) @IsUUID() beforeId?: string;
}
type Window = { id: string; class_section_id: string; enrollment_id: string; rule_version: number;
  starts_at: Date; ends_at: Date; created_at: Date; revoked_at: Date | null; reason: string | null };
const project = (w: Window, now: Date) => ({ id: w.id, classSectionId: w.class_section_id, enrollmentId: w.enrollment_id,
  ruleVersion: w.rule_version, startsAt: w.starts_at.toISOString(), endsAt: w.ends_at.toISOString(), acceptedAt: w.created_at.toISOString(),
  version: w.revoked_at ? 2 : 1, windowState: w.revoked_at ? 'REVOKED' : now < w.starts_at ? 'SCHEDULED' : now >= w.ends_at ? 'ENDED' : 'OPEN',
  revocation: w.revoked_at ? { revokedAt: w.revoked_at.toISOString(), reason: w.reason! } : null });
@Injectable()
export class V81MakeupWindowsService {
  constructor(private readonly prisma: PrismaService, private readonly idempotency: IdempotencyService,
    private readonly clock: Clock, private readonly ids: IdGenerator, private readonly time: OrganizationTimeService) {}
  private async course(tx: Prisma.TransactionClient, principal: AuthenticatedPrincipal, id: string) {
    if (principal.role !== 'TEACHER') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    const section = await tx.classSection.findFirst({ where: { id, organizationId: principal.organizationId,
      teacher: { userId: principal.userId } }, include: { semester: true, organization: true } });
    if (!section) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    return section;
  }
  private async normal(tx: Prisma.TransactionClient, principal: AuthenticatedPrincipal) {
    await tx.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
    if ((await tx.systemPolicy.findUnique({ where: { organizationId: principal.organizationId } }))?.systemMode !== 'NORMAL')
      throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
  }
  private async window(tx: Prisma.TransactionClient, id: string) {
    return (await tx.$queryRaw<Window[]>`SELECT w.*,r.created_at AS revoked_at,r.reason FROM v81_makeup_windows w
      LEFT JOIN v81_makeup_revocations r ON r.window_id=w.id WHERE w.id=${id}::uuid`)[0];
  }
  async list(principal: AuthenticatedPrincipal, classId: string, query: MakeupWindowQuery) {
    return this.prisma.$transaction(async tx => {
      await this.course(tx, principal, classId);
      const rows = await tx.$queryRaw<Window[]>`SELECT w.*,r.created_at AS revoked_at,r.reason FROM v81_makeup_windows w
        LEFT JOIN v81_makeup_revocations r ON r.window_id=w.id WHERE w.class_section_id=${classId}::uuid
          AND w.organization_id=${principal.organizationId}::uuid AND (${query.beforeId ?? null}::uuid IS NULL OR w.id<${query.beforeId ?? null}::uuid)
        ORDER BY w.id DESC LIMIT ${query.limit + 1}`;
      const page = rows.slice(0, query.limit), now = this.clock.now();
      return { classSectionId: classId, evaluatedAt: now.toISOString(), nextBeforeId: rows.length > query.limit ? page.at(-1)!.id : null,
        items: page.map(row => project(row, now)) };
    }, { isolationLevel: 'RepeatableRead' });
  }
  async create(principal: AuthenticatedPrincipal, classId: string, input: MakeupWindowInput, requestId: string, key?: string) {
    await this.prisma.$transaction(tx => this.course(tx, principal, classId));
    return this.idempotency.execute({ organizationId: principal.organizationId, principalId: principal.userId,
      authSessionId: principal.sessionId, operationId: 'createV81MakeupWindow', scope: `${principal.organizationId}:${classId}`,
      request: input, requestId, key }, async tx => {
      await this.normal(tx, principal);
      await tx.$queryRaw`SELECT id FROM class_sections WHERE id=${classId}::uuid FOR UPDATE`;
      const section = await this.course(tx, principal, classId);
      await requireUnsettledCourse(tx, principal.organizationId, classId);
      if (section.status !== 'ACTIVE' || section.semester.status !== 'CURRENT') throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
      await tx.$queryRaw`SELECT id FROM enrollments WHERE id=${input.enrollmentId}::uuid FOR UPDATE`;
      const member = await tx.enrollment.findFirst({ where: { id: input.enrollmentId, classSectionId: classId, organizationId: principal.organizationId }, include: { student: { include: { user: true } } } });
      if (!member) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      if (member.status !== 'ACTIVE' || member.student.status !== 'ACTIVE' || member.student.deletedAt || member.student.user.status !== 'ACTIVE' || member.student.user.deletedAt)
        throw new ApplicationError('ENROLLMENT_NOT_ACTIVE', 409);
      const rule = (await tx.$queryRaw<{ version: number; regular_deadline: Date; closing_deadline: Date; published_at: Date | null }[]>`
        SELECT version,regular_deadline,closing_deadline,published_at FROM v81_course_rules WHERE class_section_id=${classId}::uuid`)[0];
      if (!rule?.published_at) throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409, { reason: 'PUBLISHED_RULE_REQUIRED' });
      if (rule.version !== input.expectedRuleVersion) throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
      const now = this.clock.now(), startsAt = new Date(input.startsAt), endsAt = new Date(input.endsAt);
      try { validateMakeupWindow({ now, startsAt, endsAt, regularDeadline: rule.regular_deadline, closingDeadline: rule.closing_deadline }); }
      catch (error) { throw new ApplicationError('VALIDATION_FAILED', 422, { reason: error instanceof Error ? error.message : 'MAKEUP_TIME_INVALID' }); }
      if (this.time.businessDate(startsAt, section.organization.timezone) < section.semester.startDate.toISOString().slice(0, 10) ||
        this.time.businessDate(new Date(endsAt.getTime() - 1), section.organization.timezone) > section.semester.endDate.toISOString().slice(0, 10))
        throw new ApplicationError('VALIDATION_FAILED', 422, { reason: 'MAKEUP_OUTSIDE_SEMESTER' });
      const id = this.ids.next();
      await tx.$executeRaw`INSERT INTO v81_makeup_windows(id,organization_id,class_section_id,enrollment_id,rule_version,starts_at,ends_at,actor_id,request_id,created_at)
        VALUES(${id}::uuid,${principal.organizationId}::uuid,${classId}::uuid,${member.id}::uuid,${rule.version},${startsAt},${endsAt},${principal.userId}::uuid,${requestId},${now})`;
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${this.ids.next()}::uuid,${principal.organizationId}::uuid,'MAKEUP_WINDOW',${id}::uuid,'CREATED',${principal.userId}::uuid,${requestId},1,
          ${JSON.stringify({ enrollmentId: member.id, ruleVersion: rule.version, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() })}::jsonb,${now},'SUCCEEDED')`;
      const created = (await this.window(tx, id))!;
      await this.notify(tx, principal.organizationId, member.student.userId, created, section.organization.timezone, now);
      return this.idempotency.success(project(created, now));
    });
  }
  async revoke(principal: AuthenticatedPrincipal, id: string, input: MakeupRevocationInput, requestId: string, key?: string) {
    if (principal.role !== 'TEACHER') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    return this.idempotency.execute({ organizationId: principal.organizationId, principalId: principal.userId,
      authSessionId: principal.sessionId, operationId: 'revokeV81MakeupWindow', scope: `${principal.organizationId}:${id}`,
      request: input, requestId, key }, async tx => {
      await this.normal(tx, principal);
      const existing = await this.window(tx, id);
      if (!existing) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      const section = await this.course(tx, principal, existing.class_section_id);
      if (section.semester.status === 'ARCHIVED') throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
      await tx.$queryRaw`SELECT id FROM v81_makeup_windows WHERE id=${id}::uuid FOR UPDATE`;
      const current = (await this.window(tx, id))!;
      if (input.expectedVersion !== (current.revoked_at ? 2 : 1)) throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
      if (current.revoked_at) throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
      const now = this.clock.now(), reason = input.reason.trim();
      await tx.$executeRaw`INSERT INTO v81_makeup_revocations(window_id,actor_id,reason,request_id,created_at)
        VALUES(${id}::uuid,${principal.userId}::uuid,${reason},${requestId},${now})`;
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${this.ids.next()}::uuid,${principal.organizationId}::uuid,'MAKEUP_WINDOW',${id}::uuid,'REVOKED',${principal.userId}::uuid,${requestId},2,
          ${JSON.stringify({ reason })}::jsonb,${now},'SUCCEEDED')`;
      const revoked = (await this.window(tx, id))!;
      const member = await tx.enrollment.findUniqueOrThrow({ where: { id: current.enrollment_id }, include: { student: true } });
      await this.notify(tx, principal.organizationId, member.student.userId, revoked, section.organization.timezone, now);
      return this.idempotency.success(project(revoked, now));
    });
  }
  private async notify(tx: Prisma.TransactionClient, organizationId: string, userId: string, window: Window, timezone: string, now: Date) {
    const english = (await tx.userPreference.findUnique({ where: { userId } }))?.locale === 'en';
    const format = new Intl.DateTimeFormat(english ? 'en-GB' : 'zh-CN', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    await tx.notification.create({ data: { id: this.ids.next(), organizationId, recipientUserId: userId,
      notificationType: window.revoked_at ? 'MAKEUP_WINDOW_REVOKED' : 'MAKEUP_WINDOW_GRANTED',
      title: window.revoked_at ? (english ? 'Makeup window revoked' : '补练窗口已撤销') : (english ? 'Makeup window granted' : '补练窗口已授权'),
      body: `${format.format(window.starts_at)} — ${format.format(window.ends_at)} (${timezone})${window.reason ? ` · ${window.reason}` : ''}`,
      targetType: 'ENROLLMENT', targetId: window.enrollment_id, createdAt: now } });
  }
  async own(principal: AuthenticatedPrincipal, enrollmentId: string, query: MakeupWindowQuery) {
    if (principal.role !== 'STUDENT') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    return this.prisma.$transaction(async tx => {
      const member = await tx.enrollment.findFirst({ where: { id: enrollmentId, organizationId: principal.organizationId,
        student: { userId: principal.userId } } });
      if (!member) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      const rows = await tx.$queryRaw<Window[]>`SELECT w.*,r.created_at AS revoked_at,r.reason FROM v81_makeup_windows w
        LEFT JOIN v81_makeup_revocations r ON r.window_id=w.id WHERE w.enrollment_id=${enrollmentId}::uuid
          AND w.organization_id=${principal.organizationId}::uuid AND (${query.beforeId ?? null}::uuid IS NULL OR w.id<${query.beforeId ?? null}::uuid)
        ORDER BY w.id DESC LIMIT ${query.limit + 1}`;
      const page = rows.slice(0, query.limit), now = this.clock.now();
      return { enrollmentId, classSectionId: member.classSectionId, evaluatedAt: now.toISOString(),
        nextBeforeId: rows.length > query.limit ? page.at(-1)!.id : null, items: page.map(row => project(row, now)) };
    }, { isolationLevel: 'RepeatableRead' });
  }
}
const uuid = new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) });
@Controller()
export class V81MakeupWindowsController {
  constructor(private readonly service: V81MakeupWindowsService) {}
  @Get('enrollments/:enrollmentId/makeup-windows') @OperationPolicy('listV81OwnMakeupWindows')
  own(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('enrollmentId', uuid) id: string, @Query() query: MakeupWindowQuery) { return this.service.own(principal, id, query); }
  @Get('class-sections/:classSectionId/makeup-windows') @OperationPolicy('listV81MakeupWindows')
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('classSectionId', uuid) id: string, @Query() query: MakeupWindowQuery) { return this.service.list(principal, id, query); }
  @Post('class-sections/:classSectionId/makeup-windows') @OperationPolicy('createV81MakeupWindow')
  create(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('classSectionId', uuid) id: string, @Body() input: MakeupWindowInput,
    @Req() req: FoundationRequest, @Headers('idempotency-key') key?: string) { return this.service.create(principal, id, input, req.requestId, key); }
  @Post('makeup-windows/:windowId/revocation') @OperationPolicy('revokeV81MakeupWindow')
  revoke(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('windowId', uuid) id: string, @Body() input: MakeupRevocationInput,
    @Req() req: FoundationRequest, @Headers('idempotency-key') key?: string) { return this.service.revoke(principal, id, input, req.requestId, key); }
}
