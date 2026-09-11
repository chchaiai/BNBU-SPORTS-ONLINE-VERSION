import { Body, Controller, Get, Headers, Injectable, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { Equals, IsInt, IsString, Matches } from 'class-validator';
import { PrismaService } from '../../common/database/prisma.service.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import type { AuthenticatedPrincipal, FoundationRequest } from '../../common/http/request-context.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import { V81CompositeRosterService } from './v81-composite-roster.js';
import { V81SettlementCheckService } from './v81-settlement-check.js';
import { V81SettlementReportsService, settlementPreviewFingerprint } from './v81-settlement-reports.js';

class ConfirmSettlementInput {
  @IsInt() @Equals(0) expectedVersion!: number;
  @IsString() @Matches(/^[a-f0-9]{64}$/) previewFingerprint!: string;
}
@Injectable()
export class V81SettlementCommandService {
  constructor(private readonly prisma: PrismaService, private readonly idempotency: IdempotencyService,
    private readonly composite: V81CompositeRosterService, private readonly checks: V81SettlementCheckService,
    private readonly reports: V81SettlementReportsService) {}
  async preview(principal: AuthenticatedPrincipal, id: string) {
    return this.prisma.$transaction(async tx => {
      const preview = await this.composite.previewInTransaction(tx, principal, id);
      const check = await this.checks.checkInTransaction(tx, principal.organizationId, id);
      const [latest] = await tx.$queryRaw<{ version: number }[]>`SELECT coalesce(max(version),0) AS version
        FROM v81_settlement_report_revisions WHERE class_section_id=${id}::uuid AND organization_id=${principal.organizationId}::uuid`;
      const policy = await tx.systemPolicy.findUnique({ where: { organizationId: principal.organizationId } });
      const section = await tx.classSection.findUniqueOrThrow({ where: { id }, include: { semester: true } });
      return { preview, previewFingerprint: settlementPreviewFingerprint(preview), expectedVersion: latest!.version,
        canConfirm: latest!.version === 0 && section.semester.status !== 'ARCHIVED' && policy?.systemMode === 'NORMAL'
          && check.checks.every(item => item.code === 'CONFIRMED_COMPOSITE_ROSTER' || item.status === 'CLEAR'),
        checks: check.checks, checkedAt: check.checkedAt };
    }, { isolationLevel: 'RepeatableRead' });
  }
  async confirm(principal: AuthenticatedPrincipal, id: string, input: ConfirmSettlementInput, requestId: string, key?: string) {
    return this.idempotency.execute({ organizationId: principal.organizationId, principalId: principal.userId,
      authSessionId: principal.sessionId, operationId: 'confirmV81Settlement', scope: `${principal.organizationId}:${id}`,
      request: input, requestId, key }, async tx => {
      const saved = await this.reports.confirmInTransaction(tx, principal, id, input, requestId);
      return this.idempotency.success({ ...saved, previousReportId: null, correctionReason: null },
        { resourceType: 'SETTLEMENT_REPORT', resourceId: saved.id });
    });
  }
}
const uuid = new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) });
@Controller('class-sections/:classSectionId')
export class V81SettlementCommandController {
  constructor(private readonly service: V81SettlementCommandService) {}
  @Get('settlement-preview') @OperationPolicy('previewV81Settlement')
  preview(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('classSectionId', uuid) id: string) {
    return this.service.preview(principal, id);
  }
  @Post('settlement-reports') @OperationPolicy('confirmV81Settlement')
  confirm(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('classSectionId', uuid) id: string,
    @Body() input: ConfirmSettlementInput, @Headers('idempotency-key') key: string | undefined, @Req() req: FoundationRequest) {
    return this.service.confirm(principal, id, input, req.requestId, key);
  }
}
