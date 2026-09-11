import { Body, Controller, Get, Headers, Injectable, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../../common/database/prisma.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { Clock } from '../../common/time/clock.js';
import { IdGenerator } from '../../common/time/id-generator.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import type { AuthenticatedPrincipal, FoundationRequest } from '../../common/http/request-context.js';
import { requireAdminAccess } from './v81-admin-access.js';
import { V81SettlementCheckService } from './v81-settlement-check.js';
import { OrganizationTimeService } from '../../common/time/organization-time.service.js';
import type { Prisma } from '../../generated/prisma/client.js';

export class V81SemesterSwitchInput {
  @IsInt() @Min(1) @Max(2147483646) expectedVersion!: number;
  @ValidateIf((_object, value) => value !== null) @IsUUID() currentSemesterId!: string | null;
  @ValidateIf((_object, value) => value !== null) @IsInt() @Min(1) @Max(2147483646) currentSemesterVersion!: number | null;
}

export class V81SemesterInput {
  @IsString() @Matches(/^\d{4}-\d{4}$/u) academicYear!: string;
  @IsIn(['FIRST', 'SECOND', 'SUMMER']) termCode!: string;
  @IsString() @MaxLength(100) displayName!: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/u) startDate!: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/u) endDate!: string;
}
export class V81SemesterUpdateInput extends V81SemesterInput {
  @IsInt() @Min(1) @Max(2147483646) expectedVersion!: number;
}
export class V81SemesterListQuery {
  @IsOptional() @IsUUID() after?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
function semesterConfiguration(input: V81SemesterInput) {
  const years = input.academicYear.split('-').map(Number);
  const validDate = (value: string) => {
    const timestamp = Date.parse(value + 'T00:00:00.000Z');
    return Number(value.slice(0, 4)) > 0 && Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
  };
  if (years[1] !== years[0]! + 1 || !input.displayName.trim() || !validDate(input.startDate) ||
    !validDate(input.endDate) || input.endDate < input.startDate)
    throw new ApplicationError('VALIDATION_FAILED', 422);
  return { academicYear: input.academicYear, termCode: input.termCode, displayName: input.displayName.trim(),
    startDate: new Date(input.startDate + 'T00:00:00.000Z'), endDate: new Date(input.endDate + 'T00:00:00.000Z') };
}
@Injectable()
export class V81SemestersService {
  constructor(private readonly prisma: PrismaService, private readonly idempotency: IdempotencyService,
    private readonly clock: Clock, private readonly ids: IdGenerator,
    private readonly settlement: V81SettlementCheckService, private readonly time: OrganizationTimeService) {}
  async switchCheck(principal: AuthenticatedPrincipal, id: string, query: V81SemesterListQuery) {
    return this.prisma.$transaction(tx => this.switchCheckInTransaction(tx, principal, id, query),
      { isolationLevel: 'RepeatableRead', timeout: 30000 });
  }
  private async switchCheckInTransaction(tx: Prisma.TransactionClient, principal: AuthenticatedPrincipal,
    id: string, query: V81SemesterListQuery) {
      await requireAdminAccess(tx, principal, 'SEMESTER_MANAGE');
      const target = await tx.semester.findFirst({ where: { id, organizationId: principal.organizationId } });
      if (!target) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      const organization = await tx.organization.findUniqueOrThrow({ where: { id: principal.organizationId } });
      const current = await tx.semester.findFirst({ where: { organizationId: principal.organizationId, status: 'CURRENT' } });
      const checkedAt = this.clock.now(), businessDate = this.time.businessDate(checkedAt, organization.timezone);
      const rows = current ? await tx.classSection.findMany({ where: { semesterId: current.id,
        organizationId: principal.organizationId }, orderBy: { id: 'asc' }, select: { id: true } }) : [];
      const totalCourseCount = rows.length, results = [];
      // Readiness covers the whole semester, including courses outside the requested page.
      for (const course of rows) results.push(await this.settlement.checkInTransaction(tx, principal.organizationId, course.id));
      const remaining = results.filter(course => !query.after || course.classSectionId > query.after);
      const courses = remaining.slice(0, query.limit);
      const missingReports = results.filter(course => course.checks.some(check =>
        check.code === 'CONFIRMED_COMPOSITE_ROSTER' && check.status !== 'CLEAR')).length;
      const unfinished = results.filter(course => course.checks.some(check =>
        check.code !== 'CONFIRMED_COMPOSITE_ROSTER' && check.status !== 'CLEAR'));
      const unavailable = unfinished.some(course => course.checks.some(check => check.status === 'UNAVAILABLE'));
      const checks: { code: string; status: 'CLEAR' | 'BLOCKED' | 'UNAVAILABLE'; count: number | null }[] = [
        { code: 'TARGET_UPCOMING', status: target.status === 'UPCOMING' ? 'CLEAR' : 'BLOCKED', count: target.status === 'UPCOMING' ? 0 : 1 },
        { code: 'TARGET_START_DATE', status: businessDate >= target.startDate.toISOString().slice(0, 10) ? 'CLEAR' : 'BLOCKED',
          count: businessDate >= target.startDate.toISOString().slice(0, 10) ? 0 : 1 },
        { code: 'FORMAL_COURSE_SETTLEMENT', status: missingReports ? 'BLOCKED' : 'CLEAR', count: missingReports },
        { code: 'COURSE_UNFINISHED_WORK', status: unavailable ? 'UNAVAILABLE' : unfinished.length ? 'BLOCKED' : 'CLEAR', count: unfinished.length },
      ];
      const summary = (s: typeof target) => ({ id: s.id, version: s.version, displayName: s.displayName, status: s.status,
        startDate: s.startDate.toISOString().slice(0, 10), endDate: s.endDate.toISOString().slice(0, 10) });
      return { checkedAt: checkedAt.toISOString(), businessDate, timezone: organization.timezone, target: summary(target),
        current: current ? summary(current) : null, ready: checks.every(c => c.status === 'CLEAR'), checks, totalCourseCount,
        courses, nextCursor: remaining.length > query.limit ? courses.at(-1)!.classSectionId : null };
  }
  async switchCurrent(principal: AuthenticatedPrincipal, id: string, input: V81SemesterSwitchInput,
    facts: { requestId: string; idempotencyKey: string | undefined }) {
    await requireAdminAccess(this.prisma, principal, 'SEMESTER_MANAGE');
    if ((input.currentSemesterId === null) !== (input.currentSemesterVersion === null))
      throw new ApplicationError('VALIDATION_FAILED', 422);
    return this.idempotency.execute({ organizationId: principal.organizationId, principalId: principal.userId,
      authSessionId: principal.sessionId, operationId: 'switchV81Semester', scope: id,
      key: facts.idempotencyKey, requestId: facts.requestId, request: input }, async tx => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
      await requireAdminAccess(tx, principal, 'SEMESTER_MANAGE');
      const policy = await tx.systemPolicy.findUnique({ where: { organizationId: principal.organizationId } });
      if (policy?.systemMode !== 'NORMAL') throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
      const check = await this.switchCheckInTransaction(tx, principal, id, { limit: 1 });
      if (check.target.version !== input.expectedVersion || (check.current?.id ?? null) !== input.currentSemesterId ||
        (check.current?.version ?? null) !== input.currentSemesterVersion)
        throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
      if (!check.ready) throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
      const now = this.clock.now();
      if (check.current) await tx.semester.update({ where: { id: check.current.id }, data: {
        status: 'ARCHIVED', version: { increment: 1 }, updatedAt: now } });
      await tx.semester.update({ where: { id }, data: { status: 'CURRENT', version: { increment: 1 }, updatedAt: now } });
      const result = { switchedAt: now.toISOString(),
        current: { ...check.target, status: 'CURRENT', version: check.target.version + 1 },
        archived: check.current ? { ...check.current, status: 'ARCHIVED', version: check.current.version + 1 } : null };
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${this.ids.next()}::uuid,${principal.organizationId}::uuid,'SEMESTER',${id}::uuid,'CURRENT_SWITCHED',
          ${principal.userId}::uuid,${facts.requestId},${result.current.version},
          ${JSON.stringify({ before: { current: check.current, target: check.target }, after: result, checks: check.checks })}::jsonb,${now},'SUCCEEDED')`;
      return this.idempotency.success(result);
    });
  }
  async list(principal: AuthenticatedPrincipal, query: V81SemesterListQuery) {
    return this.prisma.$transaction(async tx => {
      await requireAdminAccess(tx, principal, 'SEMESTER_MANAGE');
      const rows = await tx.semester.findMany({ where: { organizationId: principal.organizationId,
        ...(query.after ? { id: { gt: query.after } } : {}) }, orderBy: { id: 'asc' }, take: query.limit + 1 });
      const pageRows = rows.slice(0, query.limit), pageIds = pageRows.map(row => row.id);
      const counts = pageIds.length ? await tx.$queryRaw<{ id: string; course_count: bigint; student_count: bigint }[]>`
        SELECT s.id,
          (SELECT count(*) FROM class_sections c WHERE c.semester_id=s.id AND c.organization_id=s.organization_id) AS course_count,
          (SELECT count(DISTINCT e.student_id) FROM enrollments e WHERE e.semester_id=s.id AND e.organization_id=s.organization_id) AS student_count
        FROM semesters s WHERE s.organization_id=${principal.organizationId}::uuid AND s.id=ANY(${pageIds}::uuid[])` : [];
      const totals = new Map(counts.map(row => [row.id, row]));
      const items = pageRows.map(row => ({ ...row, isCurrent: row.status === 'CURRENT',
        courseCount: Number(totals.get(row.id)!.course_count), studentCount: Number(totals.get(row.id)!.student_count),
        startDate: row.startDate.toISOString().slice(0, 10), endDate: row.endDate.toISOString().slice(0, 10),
        createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }));
      return { items, nextCursor: rows.length > query.limit ? items.at(-1)!.id : null };
    }, { isolationLevel: 'RepeatableRead' });
  }
  async save(principal: AuthenticatedPrincipal, id: string | null, input: V81SemesterInput | V81SemesterUpdateInput,
    facts: { requestId: string; idempotencyKey: string | undefined }) {
    await requireAdminAccess(this.prisma, principal, 'SEMESTER_MANAGE');
    const configuration = semesterConfiguration(input);
    return this.idempotency.execute({ organizationId: principal.organizationId, principalId: principal.userId,
      authSessionId: principal.sessionId, operationId: id ? 'updateV81Semester' : 'createV81Semester',
      scope: id ?? principal.organizationId, key: facts.idempotencyKey, requestId: facts.requestId, request: input }, async tx => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
      await requireAdminAccess(tx, principal, 'SEMESTER_MANAGE');
      const policy = await tx.systemPolicy.findUnique({ where: { organizationId: principal.organizationId } });
      if (policy?.systemMode !== 'NORMAL') throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
      const previous = id ? await tx.semester.findFirst({ where: { id, organizationId: principal.organizationId } }) : null;
      if (id && !previous) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      if (previous && (previous.status !== 'UPCOMING')) throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
      if (previous && (!('expectedVersion' in input) || previous.version !== input.expectedVersion))
        throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
      const duplicate = await tx.semester.findFirst({ where: { organizationId: principal.organizationId,
        academicYear: input.academicYear, termCode: input.termCode, ...(id ? { id: { not: id } } : {}) } });
      if (duplicate) throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
      const now = this.clock.now();
      const semester = previous ? await tx.semester.update({ where: { id: previous.id }, data: {
        ...configuration, updatedAt: now, version: { increment: 1 } } }) : await tx.semester.create({ data: {
        ...configuration, id: this.ids.next(), organizationId: principal.organizationId, status: 'UPCOMING',
        createdBy: principal.userId, createdAt: now, updatedAt: now } });
      const project = (row: typeof semester) => ({ ...row, startDate: row.startDate.toISOString().slice(0, 10),
        endDate: row.endDate.toISOString().slice(0, 10), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
        isCurrent: row.status === 'CURRENT' });
      const result = project(semester);
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${this.ids.next()}::uuid,${principal.organizationId}::uuid,'SEMESTER',${semester.id}::uuid,
          ${previous ? 'CONFIGURATION_UPDATED' : 'CREATED'},${principal.userId}::uuid,${facts.requestId},${semester.version},
          ${JSON.stringify({ before: previous ? project(previous) : null, after: result })}::jsonb,${now},'SUCCEEDED')`;
      return this.idempotency.success(result);
    });
  }
}
@Controller('admin/semesters')
export class V81SemestersController {
  constructor(private readonly service: V81SemestersService) {}
  @Post(':id/switch') @OperationPolicy('switchV81Semester')
  switchCurrent(@CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) })) id: string,
    @Body() input: V81SemesterSwitchInput, @Headers('idempotency-key') key: string | undefined,
    @Req() request: FoundationRequest) {
    return this.service.switchCurrent(principal, id, input, { requestId: request.requestId, idempotencyKey: key });
  }
  @Get(':id/switch-check') @OperationPolicy('getV81SemesterSwitchCheck')
  switchCheck(@CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) })) id: string,
    @Query() query: V81SemesterListQuery) { return this.service.switchCheck(principal, id, query); }
  @Get() @OperationPolicy('listV81Semesters')
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Query() query: V81SemesterListQuery) {
    return this.service.list(principal, query);
  }
  @Post() @OperationPolicy('createV81Semester')
  create(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Body() input: V81SemesterInput,
    @Headers('idempotency-key') key: string | undefined, @Req() request: FoundationRequest) {
    return this.service.save(principal, null, input, { requestId: request.requestId, idempotencyKey: key });
  }
  @Post(':id') @OperationPolicy('updateV81Semester')
  update(@CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) })) id: string,
    @Body() input: V81SemesterUpdateInput, @Headers('idempotency-key') key: string | undefined, @Req() request: FoundationRequest) {
    return this.service.save(principal, id, input, { requestId: request.requestId, idempotencyKey: key });
  }
}
