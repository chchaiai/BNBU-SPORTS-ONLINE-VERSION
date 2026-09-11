import { Controller, Get, Injectable, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, Max, Min, ValidateIf } from 'class-validator';
import { PrismaService } from '../../common/database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import { V81CompositeRosterService } from './v81-composite-roster.js';

export class SettlementHistoryQuery {
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @ValidateIf((_object, value: unknown) => value !== undefined) @Type(() => Number)
  @IsInt() @Min(1) @Max(2147483647) beforeVersion?: number;
}
type Revision = { id: string; class_section_id: string; version: number; kind: string;
  previous_report_id: string | null; correction_reason: string | null; report_sha256: string;
  created_at: Date; report?: unknown };
const metadata = (row: Revision) => ({ id: row.id, classSectionId: row.class_section_id, version: row.version,
  kind: row.kind, previousReportId: row.previous_report_id, correctionReason: row.correction_reason,
  reportSha256: row.report_sha256, createdAt: row.created_at.toISOString() });
@Injectable()
export class V81SettlementReportReadService {
  constructor(private readonly prisma: PrismaService, private readonly composite: V81CompositeRosterService) {}
  async export(principal: AuthenticatedPrincipal, id: string, version: number) {
    const saved = await this.get(principal, id, version);
    const report = saved.report as Awaited<ReturnType<V81CompositeRosterService['preview']>> & {
      settlementChecks?: { code: string; status: string; count: number | null }[] };
    return this.composite.exportSnapshot(report, { ...saved, checks: report.settlementChecks });
  }
  private async scope(tx: Prisma.TransactionClient, principal: AuthenticatedPrincipal, id: string) {
    if (principal.role !== 'TEACHER') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    const course = await tx.classSection.findFirst({ where: { id, organizationId: principal.organizationId,
      teacher: { userId: principal.userId } }, select: { id: true } });
    if (!course) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
  }
  async list(principal: AuthenticatedPrincipal, id: string, query: SettlementHistoryQuery) {
    return this.prisma.$transaction(async tx => {
      await this.scope(tx, principal, id);
      const rows = await tx.$queryRaw<Revision[]>`SELECT id,class_section_id,version,kind,previous_report_id,
        correction_reason,report_sha256,created_at FROM v81_settlement_report_revisions
        WHERE class_section_id=${id}::uuid AND organization_id=${principal.organizationId}::uuid
          AND (${query.beforeVersion ?? null}::integer IS NULL OR version<${query.beforeVersion ?? null}::integer)
        ORDER BY version DESC LIMIT ${query.limit + 1}`;
      const page = rows.slice(0, query.limit);
      return { items: page.map(metadata), nextBeforeVersion: rows.length > query.limit ? page.at(-1)!.version : null };
    }, { isolationLevel: 'RepeatableRead' });
  }
  async get(principal: AuthenticatedPrincipal, id: string, version: number) {
    return this.prisma.$transaction(async tx => {
      await this.scope(tx, principal, id);
      const [row] = await tx.$queryRaw<Revision[]>`SELECT id,class_section_id,version,kind,previous_report_id,
        correction_reason,report_sha256,created_at,report FROM v81_settlement_report_revisions
        WHERE class_section_id=${id}::uuid AND organization_id=${principal.organizationId}::uuid AND version=${version}`;
      if (!row) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      return { ...metadata(row), report: row.report };
    }, { isolationLevel: 'RepeatableRead' });
  }
}
const uuid = new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) });
function reportVersion(raw: string) {
  const version = Number(raw);
  if (!/^[1-9][0-9]*$/.test(raw) || !Number.isInteger(version) || version > 2147483647)
    throw new ApplicationError('VALIDATION_FAILED', 422);
  return version;
}
@Controller('class-sections/:classSectionId/settlement-reports')
export class V81SettlementReportReadController {
  constructor(private readonly service: V81SettlementReportReadService) {}
  @Get(':version/export') @OperationPolicy('exportV81SettlementReport')
  export(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('classSectionId', uuid) id: string,
    @Param('version') raw: string) { return this.service.export(principal, id, reportVersion(raw)); }
  @Get() @OperationPolicy('listV81SettlementReports')
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('classSectionId', uuid) id: string,
    @Query() query: SettlementHistoryQuery) { return this.service.list(principal, id, query); }
  @Get(':version') @OperationPolicy('getV81SettlementReport')
  get(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('classSectionId', uuid) id: string,
    @Param('version') raw: string) {
    return this.service.get(principal, id, reportVersion(raw));
  }
}
