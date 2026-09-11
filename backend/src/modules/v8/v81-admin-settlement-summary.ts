import { Controller, Get, Injectable, Param, ParseUUIDPipe } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import { requireAdminAccess } from './v81-admin-access.js';
import { V81SettlementCheckService } from './v81-settlement-check.js';

@Injectable()
export class V81AdminSettlementSummaryService {
  constructor(private readonly prisma: PrismaService, private readonly checks: V81SettlementCheckService) {}
  async get(principal: AuthenticatedPrincipal, id: string) {
    return this.prisma.$transaction(async tx => {
      await requireAdminAccess(tx, principal, 'COURSE_VIEW');
      const course = await tx.classSection.findFirst({ where: { id, organizationId: principal.organizationId }, select: { id: true } });
      if (!course) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      const checks = await this.checks.checkInTransaction(tx, principal.organizationId, id);
      const [report] = await tx.$queryRaw<{ version: number; created_at: Date }[]>`
        SELECT version,created_at FROM v81_settlement_report_revisions
        WHERE organization_id=${principal.organizationId}::uuid AND class_section_id=${id}::uuid ORDER BY version DESC LIMIT 1`;
      return { classSectionId: id, checkedAt: checks.checkedAt, ready: checks.ready, checks: checks.checks,
        settled: !!report, reportVersion: report?.version ?? null, settledAt: report?.created_at.toISOString() ?? null };
    }, { isolationLevel: 'RepeatableRead' });
  }
}
@Controller('admin/class-sections/:classSectionId/settlement-summary')
export class V81AdminSettlementSummaryController {
  constructor(private readonly service: V81AdminSettlementSummaryService) {}
  @Get() @OperationPolicy('getV81AdminSettlementSummary')
  get(@CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('classSectionId', new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) })) id: string) {
    return this.service.get(principal, id);
  }
}
