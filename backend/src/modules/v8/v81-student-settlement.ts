import { Controller, Get, Injectable, Param, ParseUUIDPipe } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import { studentSettlementResult } from './domain/student-settlement.js';

@Injectable()
export class V81StudentSettlementService {
  constructor(private readonly prisma: PrismaService) {}
  async get(principal: AuthenticatedPrincipal, id: string) {
    if (principal.role !== 'STUDENT') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    return this.prisma.$transaction(async tx => {
      const enrollment = await tx.enrollment.findFirst({ where: { id, organizationId: principal.organizationId,
        student: { userId: principal.userId } }, select: { classSectionId: true } });
      if (!enrollment) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      const [latest] = await tx.$queryRaw<{ version: number; rule_version: number; generated_at: string;
        own_rows: Parameters<typeof studentSettlementResult>[0][] }[]>`
        SELECT version,(report->>'ruleVersion')::integer AS rule_version,report->>'generatedAt' AS generated_at,
          (SELECT coalesce(jsonb_agg(item),'[]'::jsonb)
            FROM jsonb_array_elements((report->'rows') || (report->'extras')) item
            WHERE item->>'enrollmentId'=${id}) AS own_rows
        FROM v81_settlement_report_revisions WHERE class_section_id=${enrollment.classSectionId}::uuid
          AND organization_id=${principal.organizationId}::uuid ORDER BY version DESC LIMIT 1`;
      if (!latest || latest.own_rows.length === 0) return { enrollmentId: id, available: false,
        reportVersion: null, ruleVersion: null, generatedAt: null, result: null };
      if (latest.own_rows.length !== 1) throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500);
      return { enrollmentId: id, available: true, reportVersion: latest.version, ruleVersion: latest.rule_version,
        generatedAt: latest.generated_at, result: studentSettlementResult(latest.own_rows[0]!) };
    }, { isolationLevel: 'RepeatableRead' });
  }
}
const uuid = new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) });
@Controller('student/enrollments/:enrollmentId/settlement-result')
export class V81StudentSettlementController {
  constructor(private readonly service: V81StudentSettlementService) {}
  @Get() @OperationPolicy('getV81StudentSettlementResult')
  get(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('enrollmentId', uuid) id: string) {
    return this.service.get(principal, id);
  }
}
