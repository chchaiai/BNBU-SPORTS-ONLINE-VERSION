import { Body, Controller, Get, Header, Headers, Injectable, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { Type } from 'class-transformer';
import { requireUnsettledCourse } from './v81-settlement-write-guard.js';
import { IsInt, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { PrismaService } from '../../common/database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import type { AuthenticatedPrincipal, FoundationRequest } from '../../common/http/request-context.js';
import { Clock } from '../../common/time/clock.js';
import { IdGenerator } from '../../common/time/id-generator.js';

export class RosterBasisInput {
  @IsUUID() confirmedRosterId!: string;
  @IsInt() @Min(0) @Max(2147483646) expectedVersion!: number;
  @IsString() @MinLength(1) @MaxLength(1000) @Matches(/\S/u) reason!: string;
}
export class RosterSnapshotQuery {
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @ValidateIf((_o, v: unknown) => v !== undefined) @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) beforeVersion?: number;
}
type Basis = { version: number; roster_import_id: string | null; ocr_batch_id: string | null; observed_at: Date };
type Snapshot = { id: string; roster_import_id: string | null; ocr_batch_id: string | null; source_at: Date };
@Injectable()
export class V81RosterBasisService {
  constructor(private readonly prisma: PrismaService, private readonly idempotency: IdempotencyService,
    private readonly clock: Clock, private readonly ids: IdGenerator) {}
  private async scope(tx: Prisma.TransactionClient, principal: AuthenticatedPrincipal, id: string) {
    if (principal.role !== 'TEACHER') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    const section = await tx.classSection.findFirst({ where: { id, organizationId: principal.organizationId,
      teacher: { userId: principal.userId } }, include: { semester: true } });
    if (!section) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    return section;
  }
  private async current(tx: Prisma.TransactionClient, id: string) {
    const basis = (await tx.$queryRaw<Basis[]>`SELECT * FROM v81_roster_basis_history WHERE class_section_id=${id}::uuid ORDER BY version DESC LIMIT 1`)[0];
    const confirmed = (await tx.$queryRaw<{ id: string; version: number }[]>`SELECT id,version FROM v81_current_confirmed_rosters WHERE class_section_id=${id}::uuid`)[0];
    return { classSectionId: id, version: basis?.version ?? 0,
      sourceKind: basis ? basis.ocr_batch_id ? 'OCR' as const : 'ELECTRONIC' as const : null,
      rosterImportId: basis?.roster_import_id ?? null, ocrBatchId: basis?.ocr_batch_id ?? null,
      confirmedRosterId: confirmed?.id ?? null, rosterVersion: confirmed?.version ?? null,
      selectedAt: basis?.observed_at.toISOString() ?? null };
  }
  async get(principal: AuthenticatedPrincipal, id: string) {
    return this.prisma.$transaction(async tx => { await this.scope(tx, principal, id); return this.current(tx, id); }, { isolationLevel: 'RepeatableRead' });
  }
  async snapshots(principal: AuthenticatedPrincipal, id: string, query: RosterSnapshotQuery) {
    return this.prisma.$transaction(async tx => {
      await this.scope(tx, principal, id);
      const rows = await tx.$queryRaw<{ id: string; version: number; roster_import_id: string | null; ocr_batch_id: string | null;
        source_version: number; row_count: number; confirmed_at: Date; selected: boolean }[]>`
        SELECT c.id,c.version,c.roster_import_id,c.ocr_batch_id,c.source_version,jsonb_array_length(c.source_rows) AS row_count,
          c.confirmed_at,EXISTS(SELECT 1 FROM v81_current_confirmed_rosters active WHERE active.id=c.id) AS selected
        FROM v81_confirmed_rosters c WHERE c.class_section_id=${id}::uuid AND c.organization_id=${principal.organizationId}::uuid
          AND (${query.beforeVersion ?? null}::integer IS NULL OR c.version<${query.beforeVersion ?? null}::integer)
        ORDER BY c.version DESC LIMIT ${query.limit + 1}`;
      const page = rows.slice(0, query.limit);
      return { classSectionId: id, nextBeforeVersion: rows.length > query.limit ? page.at(-1)!.version : null,
        items: page.map(row => ({ id: row.id, version: row.version, sourceKind: row.ocr_batch_id ? 'OCR' as const : 'ELECTRONIC' as const,
          rosterImportId: row.roster_import_id, ocrBatchId: row.ocr_batch_id, sourceVersion: row.source_version,
          sourceRowCount: row.row_count, confirmedAt: row.confirmed_at.toISOString(), selected: row.selected })) };
    }, { isolationLevel: 'RepeatableRead' });
  }
  async select(principal: AuthenticatedPrincipal, id: string, input: RosterBasisInput, requestId: string, key?: string) {
    await this.prisma.$transaction(tx => this.scope(tx, principal, id));
    return this.idempotency.execute({ organizationId: principal.organizationId, principalId: principal.userId,
      authSessionId: principal.sessionId, operationId: 'selectV81RosterBasis', scope: `${principal.organizationId}:${id}`,
      request: input, requestId, key }, async tx => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
      if ((await tx.systemPolicy.findUnique({ where: { organizationId: principal.organizationId } }))?.systemMode !== 'NORMAL')
        throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
      await tx.$queryRaw`SELECT id FROM class_sections WHERE id=${id}::uuid FOR UPDATE`;
      const section = await this.scope(tx, principal, id);
      await requireUnsettledCourse(tx, principal.organizationId, id);
      if (section.semester.status === 'ARCHIVED') throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
      const before = await this.current(tx, id);
      if (before.version !== input.expectedVersion) throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
      if (before.confirmedRosterId === input.confirmedRosterId) throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409, { reason: 'ROSTER_BASIS_ALREADY_SELECTED' });
      const target = (await tx.$queryRaw<Snapshot[]>`SELECT c.id,c.roster_import_id,c.ocr_batch_id,coalesce(i.created_at,b.created_at) AS source_at
        FROM v81_confirmed_rosters c LEFT JOIN official_roster_imports i ON i.id=c.roster_import_id LEFT JOIN v81_ocr_batches b ON b.id=c.ocr_batch_id
        WHERE c.id=${input.confirmedRosterId}::uuid AND c.class_section_id=${id}::uuid AND c.organization_id=${principal.organizationId}::uuid`)[0];
      if (!target) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      if (!(['UPCOMING', 'ACTIVE'].includes(section.status) || (section.status === 'CLOSED' && section.closedAt && target.source_at <= section.closedAt)))
        throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
      const now = this.clock.now();
      let appendedByElectronicTrigger = false;
      if (target.roster_import_id) {
        const source = await tx.officialRosterImport.findUniqueOrThrow({ where: { id: target.roster_import_id } });
        if (source.status !== 'VALIDATED') throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
        if (!source.isCurrent) {
          await tx.officialRosterImport.updateMany({ where: { classSectionId: id, isCurrent: true },
            data: { isCurrent: false, supersededAt: now, version: { increment: 1 } } });
          await tx.officialRosterImport.update({ where: { id: source.id }, data: { isCurrent: true, supersededAt: null, version: { increment: 1 } } });
          appendedByElectronicTrigger = true;
        }
      }
      if (!appendedByElectronicTrigger) await tx.$executeRaw`INSERT INTO v81_roster_basis_history(class_section_id,version,roster_import_id,ocr_batch_id)
        VALUES(${id}::uuid,${before.version + 1},${target.roster_import_id}::uuid,${target.ocr_batch_id}::uuid)`;
      await tx.rosterAlignmentRun.updateMany({ where: { classSectionId: id, isCurrent: true }, data: { isCurrent: false } });
      await tx.rosterAlignmentResult.updateMany({ where: { classSectionId: id, supersededAt: null }, data: { supersededAt: now } });
      const selected = await this.current(tx, id);
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${this.ids.next()}::uuid,${principal.organizationId}::uuid,'ROSTER_BASIS',${id}::uuid,'SELECTED',${principal.userId}::uuid,${requestId},
          ${selected.version},${JSON.stringify({ previousVersion: before.version, previousConfirmedRosterId: before.confirmedRosterId,
            confirmedRosterId: target.id, reason: input.reason.trim() })}::jsonb,${now},'SUCCEEDED')`;
      return this.idempotency.success(selected);
    });
  }
}
const uuid = new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) });
@Controller('class-sections/:classSectionId/roster-basis')
export class V81RosterBasisController {
  constructor(private readonly service: V81RosterBasisService) {}
  @Get('snapshots') @Header('Cache-Control', 'no-store') @OperationPolicy('listV81ConfirmedRosterSnapshots')
  snapshots(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('classSectionId', uuid) id: string, @Query() query: RosterSnapshotQuery) {
    return this.service.snapshots(principal, id, query);
  }
  @Get() @Header('Cache-Control', 'no-store') @OperationPolicy('getV81RosterBasis')
  get(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('classSectionId', uuid) id: string) { return this.service.get(principal, id); }
  @Post() @OperationPolicy('selectV81RosterBasis')
  select(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('classSectionId', uuid) id: string, @Body() input: RosterBasisInput,
    @Req() req: FoundationRequest, @Headers('idempotency-key') key?: string) { return this.service.select(principal, id, input, req.requestId, key); }
}
