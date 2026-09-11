import { Body, Controller, Get, Headers, Injectable, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsString, Length, Matches, Min, Max, ValidateIf } from 'class-validator';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { Clock } from '../../common/time/clock.js';
import { OrganizationTimeService } from '../../common/time/organization-time.service.js';
import { IdGenerator } from '../../common/time/id-generator.js';
import type { FoundationRequest } from '../../common/http/request-context.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import { validPhysicalDate } from './domain/physical-import.js';
import { requireUnsettledCourse } from './v81-settlement-write-guard.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { V81SettlementReportsService } from './v81-settlement-reports.js';

export class PhysicalHistoryQuery {
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 100;
  @ValidateIf((_object, value: unknown) => value !== undefined) @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) beforeVersion?: number;
}
export class PhysicalResultInput {
  @IsIn(['800m', '1000m']) runType!: string;
  @IsInt() @Min(0) @Max(9007199254740991) elapsedSeconds!: number;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) testedOn!: string;
  @IsInt() @Min(0) @Max(2147483646) expectedVersion!: number;
}
export class PhysicalCorrectionInput extends PhysicalResultInput {
  @IsString() @Length(1, 1000) correctionReason!: string;
}
type RawResult = { version: number; run_type: string; elapsed_seconds: bigint; tested_on: Date; created_at: Date };
const project = (row: RawResult) => ({ version: row.version, runType: row.run_type,
  elapsedSeconds: Number(row.elapsed_seconds), testedOn: row.tested_on.toISOString().slice(0, 10) });

@Injectable()
export class V81PhysicalResultsService {
  private readonly organizationTime = new OrganizationTimeService();
  constructor(private readonly prisma: PrismaService, private readonly idempotency: IdempotencyService,
    private readonly clock: Clock, private readonly ids: IdGenerator, private readonly reports: V81SettlementReportsService) {}
  async write(principal: AuthenticatedPrincipal, enrollmentId: string, input: PhysicalResultInput, requestId: string, key?: string, correctionReason?: string) {
    if (correctionReason !== undefined && (!correctionReason.trim() || input.expectedVersion < 1)) throw new ApplicationError('VALIDATION_FAILED', 422);
    return this.idempotency.execute({ organizationId: principal.organizationId, principalId: principal.userId,
      authSessionId: principal.sessionId, operationId: correctionReason !== undefined ? 'correctV81PhysicalResult' : 'appendV81PhysicalResult', scope: `${principal.organizationId}:${enrollmentId}`,
      request: input, requestId, key }, async tx => this.idempotency.success(
        await this.appendInTransaction(tx, principal, enrollmentId, input, requestId, correctionReason)));
  }
  async appendInTransaction(tx: Prisma.TransactionClient, principal: AuthenticatedPrincipal, enrollmentId: string,
    input: PhysicalResultInput, requestId: string, correctionReason?: string) {
    if (principal.role !== 'TEACHER') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    const testedOn = new Date(input.testedOn + 'T00:00:00Z');
    if (!validPhysicalDate(input.testedOn))
      throw new ApplicationError('VALIDATION_FAILED', 422, { reason: 'INVALID_TEST_DATE' });
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
      const policy = await tx.systemPolicy.findUnique({ where: { organizationId: principal.organizationId } });
      if (policy?.systemMode !== 'NORMAL') throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
      const enrollment = await tx.enrollment.findFirst({ where: { id: enrollmentId, organizationId: principal.organizationId,
        classSection: { teacher: { userId: principal.userId } } }, include: { student: true, classSection: { include: { semester: true, organization: true } } } });
      if (!enrollment) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      if (input.testedOn > this.organizationTime.businessDate(this.clock.now(), enrollment.classSection.organization.timezone))
        throw new ApplicationError('VALIDATION_FAILED', 422, { reason: 'ACTUAL_TEST_DATE_IN_FUTURE' });
      if (correctionReason === undefined) await requireUnsettledCourse(tx, principal.organizationId, enrollment.classSectionId);
      if (correctionReason === undefined && enrollment.classSection.semester.status === 'ARCHIVED')
        throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409, { reason: 'ARCHIVED_FACT_CORRECTION_REQUIRED' });
      const expectedRun = enrollment.student.gender === 'MALE' ? '1000m' : enrollment.student.gender === 'FEMALE' ? '800m' : null;
      if (!expectedRun || input.runType !== expectedRun) throw new ApplicationError('VALIDATION_FAILED', 422, { reason: 'STUDENT_PROJECT_MISMATCH' });
      const exemption = await tx.exemptionApplication.findFirst({ where: { enrollmentId, organizationId: principal.organizationId,
        applicationType: 'PHYSICAL_TEST', status: 'APPROVED' } });
      if (exemption) throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409, { reason: 'PHYSICAL_TEST_EXEMPT' });
      await tx.$queryRaw`SELECT id FROM enrollments WHERE id=${enrollmentId}::uuid FOR UPDATE`;
      const previous = await tx.$queryRaw<{ version: number }[]>`SELECT coalesce(max(version),0) AS version FROM v81_physical_result_revisions WHERE enrollment_id=${enrollmentId}::uuid`;
      if (input.expectedVersion !== previous[0]!.version) throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
      const now = this.clock.now(), version = input.expectedVersion + 1;
      await tx.$executeRaw`INSERT INTO v81_physical_result_revisions(enrollment_id,organization_id,version,run_type,elapsed_seconds,tested_on,actor_id,request_id,created_at)
        VALUES(${enrollmentId}::uuid,${principal.organizationId}::uuid,${version},${input.runType},${BigInt(input.elapsedSeconds)},${testedOn},${principal.userId}::uuid,${requestId},${now})`;
      const preference = await tx.userPreference.findUnique({ where: { userId: enrollment.student.userId } });
      const english = preference?.locale === 'en';
      await tx.notification.create({ data: { id: this.ids.next(), organizationId: principal.organizationId,
        recipientUserId: enrollment.student.userId, notificationType: 'RAW_ENDURANCE_RESULT',
        title: english ? 'Raw endurance result updated' : '原始体测结果已更新',
        body: `${input.runType} · ${input.elapsedSeconds}${english ? ' seconds' : ' 秒'} · ${input.testedOn}`,
        targetType: 'ENROLLMENT', targetId: enrollmentId, createdAt: now } });
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${this.ids.next()}::uuid,${principal.organizationId}::uuid,'PHYSICAL_RESULT',${enrollmentId}::uuid,${correctionReason !== undefined ? 'FACT_CORRECTED' : 'CONFIRMED'},${principal.userId}::uuid,
          ${requestId},${version},${JSON.stringify({ previousVersion: input.expectedVersion, runType: input.runType, elapsedSeconds: input.elapsedSeconds, testedOn: input.testedOn,
            ...(correctionReason !== undefined ? { correctionReason: correctionReason.trim() } : {}) })}::jsonb,${now},'SUCCEEDED')`;
      if (correctionReason !== undefined) await this.reports.appendPhysicalCorrectionInTransaction(tx, principal,
        enrollment.classSectionId, enrollmentId, version, correctionReason, requestId);
      return { version, runType: input.runType, elapsedSeconds: input.elapsedSeconds, testedOn: input.testedOn, createdAt: now.toISOString() };
  }
  async history(principal: AuthenticatedPrincipal, enrollmentId: string, query: PhysicalHistoryQuery) {
    if (principal.role !== 'TEACHER') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    const enrollment = await this.prisma.enrollment.findFirst({ where: { id: enrollmentId, organizationId: principal.organizationId,
      classSection: { teacher: { userId: principal.userId } } } });
    if (!enrollment) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    const rows = await this.prisma.$queryRaw<RawResult[]>`SELECT version,run_type,elapsed_seconds,tested_on,created_at FROM v81_physical_result_revisions
      WHERE enrollment_id=${enrollmentId}::uuid AND organization_id=${principal.organizationId}::uuid
        AND (${query.beforeVersion ?? null}::integer IS NULL OR version<${query.beforeVersion ?? null}::integer)
      ORDER BY version DESC LIMIT ${query.limit + 1}`;
    const page = rows.slice(0, query.limit);
    return { items: page.map(row => ({ ...project(row), createdAt: row.created_at.toISOString() })),
      nextBeforeVersion: rows.length > query.limit ? page.at(-1)!.version : null };
  }
  async current(principal: AuthenticatedPrincipal, enrollmentId: string) {
    if (principal.role !== 'STUDENT') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    return this.prisma.$transaction(async tx => {
      const enrollment = await tx.enrollment.findFirst({ where: { id: enrollmentId, organizationId: principal.organizationId,
        student: { userId: principal.userId } } });
      if (!enrollment) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      const exempt = await tx.exemptionApplication.findFirst({ where: { enrollmentId, organizationId: principal.organizationId,
        applicationType: 'PHYSICAL_TEST', status: 'APPROVED' } });
      if (exempt) return { status: 'EXEMPT' as const, result: null };
      const rows = await tx.$queryRaw<RawResult[]>`SELECT version,run_type,elapsed_seconds,tested_on,created_at FROM v81_physical_result_revisions
        WHERE enrollment_id=${enrollmentId}::uuid AND organization_id=${principal.organizationId}::uuid ORDER BY version DESC LIMIT 1`;
      return rows[0] ? { status: 'RECORDED' as const, result: project(rows[0]) } : { status: 'NOT_RECORDED' as const, result: null };
    }, { isolationLevel: 'RepeatableRead' });
  }
}
const physicalUuid = new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) });
@Controller()
export class V81PhysicalResultsController {
  constructor(private readonly service: V81PhysicalResultsService) {}
  @Post('enrollments/:enrollmentId/physical-results/corrections') @OperationPolicy('correctV81PhysicalResult')
  correct(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('enrollmentId', physicalUuid) id: string,
    @Body() input: PhysicalCorrectionInput, @Headers('idempotency-key') key: string | undefined, @Req() req: FoundationRequest) {
    return this.service.write(principal, id, input, req.requestId, key, input.correctionReason);
  }
  @Post('enrollments/:enrollmentId/physical-results') @OperationPolicy('appendV81PhysicalResult')
  write(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('enrollmentId', physicalUuid) id: string,
    @Body() input: PhysicalResultInput, @Headers('idempotency-key') key: string | undefined, @Req() req: FoundationRequest) {
    return this.service.write(principal, id, input, req.requestId, key);
  }
  @Get('enrollments/:enrollmentId/physical-results') @OperationPolicy('listV81PhysicalResults')
  history(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('enrollmentId', physicalUuid) id: string,
    @Query() query: PhysicalHistoryQuery) { return this.service.history(principal, id, query); }
  @Get('student/enrollments/:enrollmentId/physical-result') @OperationPolicy('getV81StudentPhysicalResult')
  current(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('enrollmentId', physicalUuid) id: string) {
    return this.service.current(principal, id);
  }
}
