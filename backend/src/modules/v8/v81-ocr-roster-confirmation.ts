import { Body, Controller, Get, Header, Headers, Injectable, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { IsInt, Max, Min } from 'class-validator';
import { requireUnsettledCourse } from './v81-settlement-write-guard.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import type { AuthenticatedPrincipal, FoundationRequest } from '../../common/http/request-context.js';
import { Clock } from '../../common/time/clock.js';
import { IdGenerator } from '../../common/time/id-generator.js';
import { prepareOcrRosterSnapshot, type OcrRosterWorkingRow } from './domain/ocr-roster-snapshot.js';

export class OcrRosterConfirmationInput { @IsInt() @Min(1) @Max(2147483647) expectedDraftVersion!: number; }
type Batch = { id: string; class_section_id: string; purpose: string; created_at: Date };
type Snapshot = { id: string; class_section_id: string; ocr_batch_id: string; source_version: number; source_sha256: string;
  source_rows: ReturnType<typeof prepareOcrRosterSnapshot>; version: number; confirmed_at: Date };
const project = (snapshot: Snapshot) => ({ id: snapshot.id, classSectionId: snapshot.class_section_id, batchId: snapshot.ocr_batch_id,
  draftVersion: snapshot.source_version, sourceManifestSha256: snapshot.source_sha256, sourceRows: snapshot.source_rows,
  version: snapshot.version, confirmedAt: snapshot.confirmed_at.toISOString() });
@Injectable()
export class V81OcrRosterConfirmationService {
  constructor(private readonly prisma: PrismaService, private readonly idempotency: IdempotencyService,
    private readonly clock: Clock, private readonly ids: IdGenerator) {}
  private async scope(tx: Prisma.TransactionClient, principal: AuthenticatedPrincipal, id: string, writable = false) {
    if (principal.role !== 'TEACHER') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    const batch = (await tx.$queryRaw<Batch[]>`SELECT id,class_section_id,purpose,created_at FROM v81_ocr_batches
      WHERE id=${id}::uuid AND organization_id=${principal.organizationId}::uuid`)[0];
    if (!batch) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    const section = await tx.classSection.findFirst({ where: { id: batch.class_section_id, organizationId: principal.organizationId,
      teacher: { userId: principal.userId } }, include: { semester: true } });
    if (!section) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    if (batch.purpose !== 'ROSTER') throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409, { reason: 'OCR_ROSTER_BATCH_REQUIRED' });
    if (writable && (section.semester.status === 'ARCHIVED' || !(['ACTIVE', 'UPCOMING'].includes(section.status) ||
      (section.status === 'CLOSED' && section.closedAt && batch.created_at <= section.closedAt))))
      throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
    return batch;
  }
  async get(principal: AuthenticatedPrincipal, id: string) {
    return this.prisma.$transaction(async tx => {
      await this.scope(tx, principal, id);
      const snapshot = (await tx.$queryRaw<Snapshot[]>`SELECT * FROM v81_confirmed_rosters WHERE ocr_batch_id=${id}::uuid`)[0];
      if (!snapshot) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      return project(snapshot);
    }, { isolationLevel: 'RepeatableRead' });
  }
  async confirm(principal: AuthenticatedPrincipal, id: string, input: OcrRosterConfirmationInput, requestId: string, key?: string) {
    await this.prisma.$transaction(tx => this.scope(tx, principal, id));
    return this.idempotency.execute({ organizationId: principal.organizationId, principalId: principal.userId,
      authSessionId: principal.sessionId, operationId: 'confirmV81OcrRoster', scope: `${principal.organizationId}:${id}`,
      request: input, requestId, key }, async tx => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
      if ((await tx.systemPolicy.findUnique({ where: { organizationId: principal.organizationId } }))?.systemMode !== 'NORMAL')
        throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
      const batch = await this.scope(tx, principal, id, true);
      await requireUnsettledCourse(tx, principal.organizationId, batch.class_section_id);
      await tx.$queryRaw`SELECT id FROM class_sections WHERE id=${batch.class_section_id}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM v81_ocr_batches WHERE id=${id}::uuid FOR UPDATE`;
      const existing = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM v81_confirmed_rosters WHERE ocr_batch_id=${id}::uuid`;
      if (existing.length) throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409, { reason: 'OCR_ROSTER_ALREADY_CONFIRMED' });
      const draft = (await tx.$queryRaw<{ version: number; draft_rows: OcrRosterWorkingRow[] }[]>`
        SELECT version,draft_rows FROM v81_ocr_draft_revisions WHERE batch_id=${id}::uuid ORDER BY version DESC LIMIT 1`)[0];
      if (!draft) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      if (draft.version !== input.expectedDraftVersion) throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
      let sourceRows: ReturnType<typeof prepareOcrRosterSnapshot>;
      try { sourceRows = prepareOcrRosterSnapshot(draft.draft_rows); }
      catch (error) { throw new ApplicationError('VALIDATION_FAILED', 422, { reason: error instanceof Error && /^OCR_[A-Z_]+$/.test(error.message) ? error.message : 'OCR_ROSTER_ROWS_INVALID' }); }
      const snapshotId = this.ids.next(), now = this.clock.now();
      const saved = (await tx.$queryRaw<Snapshot[]>`INSERT INTO v81_confirmed_rosters(id,organization_id,class_section_id,ocr_batch_id,
        source_version,source_sha256,source_rows,version,actor_id,request_id,confirmed_at)
        SELECT ${snapshotId}::uuid,organization_id,class_section_id,id,${draft.version},encode(sha256(convert_to(source_manifest::text,'UTF8')),'hex'),
          ${JSON.stringify(sourceRows)}::jsonb,(SELECT coalesce(max(version),0)+1 FROM v81_confirmed_rosters WHERE class_section_id=${batch.class_section_id}::uuid),
          ${principal.userId}::uuid,${requestId},${now} FROM v81_ocr_batches WHERE id=${id}::uuid RETURNING *`)[0]!;
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${this.ids.next()}::uuid,${principal.organizationId}::uuid,'ROSTER_CONFIRMATION',${snapshotId}::uuid,'CONFIRMED',${principal.userId}::uuid,
          ${requestId},1,${JSON.stringify({ ocrBatchId: id, sourceVersion: draft.version })}::jsonb,${now},'SUCCEEDED')`;
      return this.idempotency.success(project(saved));
    });
  }
}
const uuid = new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) });
@Controller()
export class V81OcrRosterConfirmationController {
  constructor(private readonly service: V81OcrRosterConfirmationService) {}
  @Get('ocr-batches/:batchId/roster-confirmation') @Header('Cache-Control', 'no-store') @OperationPolicy('getV81OcrRosterConfirmation')
  get(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('batchId', uuid) id: string) { return this.service.get(principal, id); }
  @Post('ocr-batches/:batchId/roster-confirmation') @OperationPolicy('confirmV81OcrRoster')
  confirm(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('batchId', uuid) id: string, @Body() input: OcrRosterConfirmationInput,
    @Req() req: FoundationRequest, @Headers('idempotency-key') key?: string) { return this.service.confirm(principal, id, input, req.requestId, key); }
}
