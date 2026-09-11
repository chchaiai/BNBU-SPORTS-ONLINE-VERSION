import { Body, Controller, Get, Header, Headers, Injectable, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { PrismaService } from '../../common/database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import type { AuthenticatedPrincipal, FoundationRequest } from '../../common/http/request-context.js';
import { Clock } from '../../common/time/clock.js';
import { IdGenerator } from '../../common/time/id-generator.js';
import { V81PhysicalResultsService } from './v81-physical-results.js';
import { inspectOcrPhysicalConfirmation, selectOcrPhysicalConfirmation, type OcrPhysicalWorkingRow } from './domain/ocr-physical-confirmation.js';

export class OcrPhysicalSelection {
  @IsUUID() rowId!: string;
  @IsInt() @Min(0) @Max(2147483646) expectedResultVersion!: number;
}
export class OcrPhysicalConfirmationInput {
  @IsInt() @Min(1) @Max(2147483647) expectedDraftVersion!: number;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => OcrPhysicalSelection) selections!: OcrPhysicalSelection[];
}
type Batch = { id: string; class_section_id: string; purpose: string; created_at: Date };
type Draft = { version: number; draft_rows: OcrPhysicalWorkingRow[] };
@Injectable()
export class V81OcrPhysicalConfirmationService {
  constructor(private readonly prisma: PrismaService, private readonly idempotency: IdempotencyService,
    private readonly results: V81PhysicalResultsService, private readonly clock: Clock, private readonly ids: IdGenerator) {}
  private async scope(tx: Prisma.TransactionClient, principal: AuthenticatedPrincipal, id: string, writable = false) {
    if (principal.role !== 'TEACHER') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    const batch = (await tx.$queryRaw<Batch[]>`SELECT id,class_section_id,purpose,created_at FROM v81_ocr_batches
      WHERE id=${id}::uuid AND organization_id=${principal.organizationId}::uuid`)[0];
    if (!batch) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    const section = await tx.classSection.findFirst({ where: { id: batch.class_section_id, organizationId: principal.organizationId,
      teacher: { userId: principal.userId } }, include: { semester: true } });
    if (!section) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    if (batch.purpose !== 'PHYSICAL') throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409, { reason: 'OCR_PHYSICAL_BATCH_REQUIRED' });
    if (writable && (section.semester.status === 'ARCHIVED' || !(['ACTIVE', 'UPCOMING'].includes(section.status) ||
      (section.status === 'CLOSED' && section.closedAt && batch.created_at <= section.closedAt))))
      throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
    return batch;
  }
  private async inspect(tx: Prisma.TransactionClient, principal: AuthenticatedPrincipal, batch: Batch) {
    const draft = (await tx.$queryRaw<Draft[]>`SELECT version,draft_rows FROM v81_ocr_draft_revisions
      WHERE batch_id=${batch.id}::uuid ORDER BY version DESC LIMIT 1`)[0];
    if (!draft) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    const enrolled = await tx.enrollment.findMany({ where: { classSectionId: batch.class_section_id,
      organizationId: principal.organizationId, status: 'ACTIVE' }, include: { student: true } });
    const members = enrolled.map(e => ({ enrollmentId: e.id, studentNumber: e.student.studentNumber, name: e.student.fullName, gender: e.student.gender }));
    const links = await tx.$queryRaw<{ row_id: string; enrollment_id: string; result_version: number }[]>`
      SELECT row_id,enrollment_id,result_version FROM v81_ocr_physical_confirmations WHERE batch_id=${batch.id}::uuid`;
    const versions = await tx.$queryRaw<{ enrollment_id: string; version: number }[]>`SELECT r.enrollment_id,max(r.version) AS version
      FROM v81_physical_result_revisions r JOIN enrollments e ON e.id=r.enrollment_id
      WHERE e.class_section_id=${batch.class_section_id}::uuid AND r.organization_id=${principal.organizationId}::uuid GROUP BY r.enrollment_id`;
    const exemptions = await tx.exemptionApplication.findMany({ where: { organizationId: principal.organizationId,
      classSectionId: batch.class_section_id, applicationType: 'PHYSICAL_TEST', status: 'APPROVED' }, select: { enrollmentId: true } });
    const inspected = inspectOcrPhysicalConfirmation(draft.draft_rows, members);
    const rows = inspected.map(row => {
      const link = links.find(link => link.row_id === row.rowId);
      const issues = link ? [] : [...row.issues, ...(exemptions.some(e => e.enrollmentId === row.enrollmentId) ? ['PHYSICAL_TEST_EXEMPT'] : [])];
      return { ...row, enrollmentId: link?.enrollment_id ?? row.enrollmentId, issues,
        confirmed: !!link, resultVersion: link?.result_version ?? null,
        currentResultVersion: versions.find(v => v.enrollment_id === (link?.enrollment_id ?? row.enrollmentId))?.version ?? 0 };
    });
    return { draft, members, view: { batchId: batch.id, draftVersion: draft.version,
      pendingCount: rows.filter(row => !row.confirmed).length, rows } };
  }
  async get(principal: AuthenticatedPrincipal, id: string) {
    return this.prisma.$transaction(async tx => (await this.inspect(tx, principal, await this.scope(tx, principal, id))).view,
      { isolationLevel: 'RepeatableRead' });
  }
  async confirm(principal: AuthenticatedPrincipal, id: string, input: OcrPhysicalConfirmationInput, requestId: string, key?: string) {
    await this.prisma.$transaction(tx => this.scope(tx, principal, id));
    return this.idempotency.execute({ organizationId: principal.organizationId, principalId: principal.userId,
      authSessionId: principal.sessionId, operationId: 'confirmV81OcrPhysicalRows', scope: `${principal.organizationId}:${id}`,
      request: input, requestId, key }, async tx => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
      if ((await tx.systemPolicy.findUnique({ where: { organizationId: principal.organizationId } }))?.systemMode !== 'NORMAL')
        throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
      await tx.$queryRaw`SELECT id FROM v81_ocr_batches WHERE id=${id}::uuid FOR UPDATE`;
      const batch = await this.scope(tx, principal, id, true), state = await this.inspect(tx, principal, batch);
      if (state.draft.version !== input.expectedDraftVersion) throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
      let selected: ReturnType<typeof selectOcrPhysicalConfirmation>;
      try { selected = selectOcrPhysicalConfirmation(state.draft.draft_rows, state.members, input.selections.map(s => s.rowId)); }
      catch (error) { throw new ApplicationError('VALIDATION_FAILED', 422, { reason: error instanceof Error && /^OCR_[A-Z_]+$/.test(error.message) ? error.message : 'OCR_SELECTED_ROWS_UNRESOLVED' }); }
      for (const row of selected) {
        const view = state.view.rows.find(item => item.rowId === row.rowId)!;
        if (view.confirmed) throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409, { reason: 'OCR_ROW_ALREADY_CONFIRMED' });
        if (view.issues.length) throw new ApplicationError('VALIDATION_FAILED', 422, { reason: 'OCR_SELECTED_ROWS_UNRESOLVED' });
      }
      for (const row of selected) {
        const result = await this.results.appendInTransaction(tx, principal, row.enrollmentId, { runType: row.runType,
          elapsedSeconds: row.elapsedSeconds, testedOn: row.testedOn,
          expectedVersion: input.selections.find(s => s.rowId === row.rowId)!.expectedResultVersion }, requestId);
        await tx.$executeRaw`INSERT INTO v81_ocr_physical_confirmations(batch_id,row_id,draft_version,enrollment_id,result_version,actor_id,request_id,created_at)
          VALUES(${id}::uuid,${row.rowId}::uuid,${state.draft.version},${row.enrollmentId}::uuid,${result.version},
            ${principal.userId}::uuid,${requestId},${this.clock.now()})`;
      }
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${this.ids.next()}::uuid,${principal.organizationId}::uuid,'OCR_PHYSICAL_CONFIRMATION',${id}::uuid,'ROWS_CONFIRMED',${principal.userId}::uuid,
          ${requestId},(SELECT coalesce(max(version),0)+1 FROM v81_events WHERE organization_id=${principal.organizationId}::uuid
            AND resource_type='OCR_PHYSICAL_CONFIRMATION' AND resource_id=${id}::uuid),
          ${JSON.stringify({ draftVersion: state.draft.version, rowIds: selected.map(row => row.rowId) })}::jsonb,${this.clock.now()},'SUCCEEDED')`;
      return this.idempotency.success((await this.inspect(tx, principal, batch)).view);
    });
  }
}
const uuid = new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) });
@Controller()
export class V81OcrPhysicalConfirmationController {
  constructor(private readonly service: V81OcrPhysicalConfirmationService) {}
  @Get('ocr-batches/:batchId/physical-confirmations') @Header('Cache-Control', 'no-store') @OperationPolicy('getV81OcrPhysicalConfirmation')
  get(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('batchId', uuid) id: string) { return this.service.get(principal, id); }
  @Post('ocr-batches/:batchId/physical-confirmations') @OperationPolicy('confirmV81OcrPhysicalRows')
  confirm(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('batchId', uuid) id: string, @Body() input: OcrPhysicalConfirmationInput,
    @Req() req: FoundationRequest, @Headers('idempotency-key') key?: string) { return this.service.confirm(principal, id, input, req.requestId, key); }
}
