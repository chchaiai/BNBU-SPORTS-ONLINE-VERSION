import { Body, Controller, Get, Headers, Injectable, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { PrismaService } from '../../common/database/prisma.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import type { AuthenticatedPrincipal, FoundationRequest } from '../../common/http/request-context.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import { Clock } from '../../common/time/clock.js';
import { IdGenerator } from '../../common/time/id-generator.js';
import { requireUnsettledCourse } from './v81-settlement-write-guard.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { V81SettlementReportsService } from './v81-settlement-reports.js';

class FinalGradeInput {
  @IsInt() @Min(-2147483648) @Max(2147483647) finalGrade!: number;
  @IsBoolean() published!: boolean;
  @IsInt() @Min(0) @Max(2147483646) expectedVersion!: number;
}
class FinalGradeQuery {
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 100;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) beforeVersion?: number;
}
class FinalGradeCorrectionInput extends FinalGradeInput {
  @IsString() @Length(1, 1000) correctionReason!: string;
}
type Revision = { version: number; final_grade: number; published: boolean; created_at: Date };
const projection = (enrollmentId: string, row: Revision) => ({ enrollmentId, version: row.version,
  finalGrade: row.final_grade, published: row.published, createdAt: row.created_at.toISOString() });

@Injectable()
export class V81FinalGradesService {
  constructor(private readonly prisma: PrismaService, private readonly idempotency: IdempotencyService,
    private readonly clock: Clock, private readonly ids: IdGenerator, private readonly reports: V81SettlementReportsService) {}
  private async scope(tx: Prisma.TransactionClient, principal: AuthenticatedPrincipal, enrollmentId: string) {
    if (principal.role !== 'TEACHER') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    const enrollment = await tx.enrollment.findFirst({ where: { id: enrollmentId, organizationId: principal.organizationId,
      classSection: { teacher: { userId: principal.userId } } }, include: { classSection: { include: { semester: true } } } });
    if (!enrollment) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    return enrollment;
  }
  async history(principal: AuthenticatedPrincipal, enrollmentId: string, query: FinalGradeQuery) {
    return this.prisma.$transaction(async (tx) => {
      await this.scope(tx, principal, enrollmentId);
      const rows = await tx.$queryRaw<Revision[]>`SELECT version,final_grade,published,created_at FROM v81_final_grade_revisions
        WHERE enrollment_id=${enrollmentId}::uuid AND organization_id=${principal.organizationId}::uuid
          AND (${query.beforeVersion ?? null}::integer IS NULL OR version<${query.beforeVersion ?? null}::integer)
        ORDER BY version DESC LIMIT ${query.limit + 1}`;
      const page = rows.slice(0, query.limit);
      return { items: page.map((row) => projection(enrollmentId, row)),
        nextBeforeVersion: rows.length > query.limit ? page.at(-1)!.version : null };
    }, { isolationLevel: 'RepeatableRead' });
  }
  async write(principal: AuthenticatedPrincipal, enrollmentId: string, input: FinalGradeInput,
    requestId: string, key: string | undefined, correctionReason?: string) {
    if (correctionReason !== undefined && (!correctionReason.trim() || input.expectedVersion < 1))
      throw new ApplicationError('VALIDATION_FAILED', 422);
    return this.idempotency.execute({ organizationId: principal.organizationId, principalId: principal.userId,
      authSessionId: principal.sessionId, operationId: correctionReason !== undefined ? 'correctV81FinalGrade' : 'appendV81FinalGrade', scope: `${principal.organizationId}:${enrollmentId}`,
      key, request: input, requestId }, async (tx) => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
      const policy = await tx.systemPolicy.findUnique({ where: { organizationId: principal.organizationId } });
      if (policy?.systemMode !== 'NORMAL') throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
      const enrollment = await this.scope(tx, principal, enrollmentId);
      if (correctionReason === undefined) await requireUnsettledCourse(tx, principal.organizationId, enrollment.classSectionId);
      if (correctionReason === undefined && enrollment.classSection.semester.status === 'ARCHIVED')
        throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409, { reason: 'ARCHIVED_FACT_CORRECTION_REQUIRED' });
      await tx.$queryRaw`SELECT id FROM enrollments WHERE id=${enrollmentId}::uuid FOR UPDATE`;
      const versions = await tx.$queryRaw<{ version: number }[]>`SELECT coalesce(max(version),0) AS version
        FROM v81_final_grade_revisions WHERE enrollment_id=${enrollmentId}::uuid`;
      if (versions[0]!.version !== input.expectedVersion) throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
      const version = input.expectedVersion + 1, now = this.clock.now();
      await tx.$executeRaw`INSERT INTO v81_final_grade_revisions(enrollment_id,organization_id,version,final_grade,published,actor_id,created_at)
        VALUES(${enrollmentId}::uuid,${principal.organizationId}::uuid,${version},${input.finalGrade},${input.published},${principal.userId}::uuid,${now})`;
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${this.ids.next()}::uuid,${principal.organizationId}::uuid,'FINAL_GRADE',${enrollmentId}::uuid,
          ${correctionReason !== undefined ? 'FACT_CORRECTED' : input.published ? 'PUBLISHED' : 'DRAFT_SAVED'},${principal.userId}::uuid,${requestId},${version},
          ${JSON.stringify({ published: input.published, previousVersion: input.expectedVersion,
            ...(correctionReason !== undefined ? { correctionReason: correctionReason.trim() } : {}) })}::jsonb,${now},'SUCCEEDED')`;
      if (correctionReason !== undefined) await this.reports.appendFinalGradeCorrectionInTransaction(tx, principal,
        enrollment.classSectionId, enrollmentId, version, correctionReason, requestId);
      return this.idempotency.success(projection(enrollmentId, { version, final_grade: input.finalGrade,
        published: input.published, created_at: now }));
    });
  }
}
const uuid = new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) });
@Controller('enrollments/:enrollmentId/final-grades')
export class V81FinalGradesController {
  constructor(private readonly service: V81FinalGradesService) {}
  @Post('corrections') @OperationPolicy('correctV81FinalGrade')
  correct(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('enrollmentId', uuid) id: string,
    @Body() input: FinalGradeCorrectionInput, @Headers('idempotency-key') key: string | undefined, @Req() req: FoundationRequest) {
    return this.service.write(principal, id, input, req.requestId, key, input.correctionReason);
  }
  @Get() @OperationPolicy('listV81FinalGrades')
  history(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('enrollmentId', uuid) id: string,
    @Query() query: FinalGradeQuery) { return this.service.history(principal, id, query); }
  @Post() @OperationPolicy('appendV81FinalGrade')
  write(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('enrollmentId', uuid) id: string,
    @Body() input: FinalGradeInput, @Headers('idempotency-key') key: string | undefined, @Req() req: FoundationRequest) {
    return this.service.write(principal, id, input, req.requestId, key);
  }
}
