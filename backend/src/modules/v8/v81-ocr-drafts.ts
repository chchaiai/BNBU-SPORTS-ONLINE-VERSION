import { Body, Controller, Get, Header, Headers, Injectable, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { Type } from 'class-transformer';
import { requireUnsettledCourse } from './v81-settlement-write-guard.js';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDefined, IsInt, IsString, IsUUID, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { PrismaService } from '../../common/database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import type { AuthenticatedPrincipal, FoundationRequest } from '../../common/http/request-context.js';
import { Clock } from '../../common/time/clock.js';
import { IdGenerator } from '../../common/time/id-generator.js';
import type { OcrSourcePage } from './ocr-multipart.js';
import type { OcrTableSource } from './domain/ocr-table-source.js';
import { selectOcrPersonnelDraft, type OcrPersonnelField } from './domain/ocr-personnel-draft.js';

export class OcrColumns {
  @IsInt() @Min(0) @Max(100000) studentNumber!: number;
  @IsInt() @Min(0) @Max(100000) name!: number;
  @ValidateIf((_o, v: unknown) => v !== undefined) @IsInt() @Min(0) @Max(100000) runType?: number;
  @ValidateIf((_o, v: unknown) => v !== undefined) @IsInt() @Min(0) @Max(100000) elapsed?: number;
  @ValidateIf((_o, v: unknown) => v !== undefined) @IsInt() @Min(0) @Max(100000) testedOn?: number;
}
export class OcrDraftSelection {
  @IsUUID() pageId!: string;
  @IsInt() @Min(1) @Max(2147483646) attempt!: number;
  @IsInt() @Min(0) @Max(31) tableIndex!: number;
  @IsInt() @Min(0) @Max(100000) headerRow!: number;
  @IsDefined() @ValidateNested() @Type(() => OcrColumns) columns!: OcrColumns;
}
export class OcrDraftCreateInput {
  @IsInt() @Min(0) @Max(0) expectedVersion!: number;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(1000) @ValidateNested({ each: true }) @Type(() => OcrDraftSelection) selections!: OcrDraftSelection[];
}
export class OcrDraftValues {
  @IsString() @MaxLength(16384) studentNumber!: string;
  @IsString() @MaxLength(16384) name!: string;
  @ValidateIf((_o, v: unknown) => v !== undefined) @IsString() @MaxLength(16384) runType?: string;
  @ValidateIf((_o, v: unknown) => v !== undefined) @IsString() @MaxLength(16384) elapsed?: string;
  @ValidateIf((_o, v: unknown) => v !== undefined) @IsString() @MaxLength(16384) testedOn?: string;
}
export class OcrDraftEdit {
  @IsUUID() id!: string;
  @IsDefined() @ValidateNested() @Type(() => OcrDraftValues) values!: OcrDraftValues;
  @IsBoolean() reviewedAgainstSource!: boolean;
}
export class OcrDraftRevisionInput {
  @IsInt() @Min(1) @Max(2147483646) expectedVersion!: number;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => OcrDraftEdit) rows!: OcrDraftEdit[];
}
export class OcrDraftQuery {
  @ValidateIf((_o, v: unknown) => v !== undefined) @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) version?: number;
}
type Batch = { id: string; class_section_id: string; purpose: 'ROSTER' | 'PHYSICAL'; source_manifest: OcrSourcePage[]; created_at: Date };
type DraftRow = { id: string; source: { pageId: string; attempt: number; tableIndex: number; sourceRow: number;
  evidence: Partial<Record<OcrPersonnelField, number[]>> }; values: Partial<Record<OcrPersonnelField, string>>;
  ocrIssues: { field: OcrPersonnelField; code: string }[]; reviewedAgainstSource: boolean };
type Revision = { version: number; selections: OcrDraftSelection[]; draft_rows: DraftRow[]; created_at: Date };
const invalid = (reason: string): never => { throw new ApplicationError('VALIDATION_FAILED', 422, { reason }); };
const conflict = (reason: string): never => { throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409, { reason }); };
const project = (batch: Batch, revision: Revision) => ({ batchId: batch.id, classSectionId: batch.class_section_id,
  purpose: batch.purpose, version: revision.version, createdAt: revision.created_at.toISOString(), selections: revision.selections,
  rows: revision.draft_rows, isFormal: false, pendingReviewCount: revision.draft_rows.filter(row => !row.reviewedAgainstSource).length });

@Injectable()
export class V81OcrDraftsService {
  constructor(private readonly prisma: PrismaService, private readonly idempotency: IdempotencyService,
    private readonly clock: Clock, private readonly ids: IdGenerator) {}
  private async scope(tx: Prisma.TransactionClient, principal: AuthenticatedPrincipal, id: string, writable = false) {
    if (principal.role !== 'TEACHER') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    const batches = await tx.$queryRaw<Batch[]>`SELECT * FROM v81_ocr_batches WHERE id=${id}::uuid AND organization_id=${principal.organizationId}::uuid`;
    const batch = batches[0];
    if (!batch) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    const section = await tx.classSection.findFirst({ where: { id: batch.class_section_id, organizationId: principal.organizationId,
      teacher: { userId: principal.userId } }, include: { semester: true } });
    if (!section) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    if (writable && (section.semester.status === 'ARCHIVED' || !(['ACTIVE', 'UPCOMING'].includes(section.status) ||
      (section.status === 'CLOSED' && section.closedAt && batch.created_at <= section.closedAt)))) conflict('OCR_SOURCE_NOT_WRITABLE');
    return batch;
  }
  async get(principal: AuthenticatedPrincipal, id: string, query: OcrDraftQuery) {
    return this.prisma.$transaction(async tx => {
      const batch = await this.scope(tx, principal, id);
      const rows = await tx.$queryRaw<Revision[]>`SELECT version,selections,draft_rows,created_at FROM v81_ocr_draft_revisions
        WHERE batch_id=${id}::uuid AND (${query.version ?? null}::integer IS NULL OR version=${query.version ?? null}::integer) ORDER BY version DESC LIMIT 1`;
      if (!rows[0]) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      return project(batch, rows[0]);
    }, { isolationLevel: 'RepeatableRead' });
  }
  async write(principal: AuthenticatedPrincipal, id: string, input: OcrDraftCreateInput | OcrDraftRevisionInput,
    requestId: string, key: string | undefined, create: boolean) {
    await this.prisma.$transaction(tx => this.scope(tx, principal, id));
    return this.idempotency.execute({ organizationId: principal.organizationId, principalId: principal.userId,
      authSessionId: principal.sessionId, operationId: create ? 'createV81OcrDraft' : 'reviseV81OcrDraft',
      scope: `${principal.organizationId}:${id}`, request: input, requestId, key }, async tx => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
      if ((await tx.systemPolicy.findUnique({ where: { organizationId: principal.organizationId } }))?.systemMode !== 'NORMAL')
        throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
      await tx.$queryRaw`SELECT id FROM v81_ocr_batches WHERE id=${id}::uuid FOR UPDATE`;
      const batch = await this.scope(tx, principal, id, true);
      await requireUnsettledCourse(tx, principal.organizationId, batch.class_section_id);
      const confirmedRoster = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM v81_confirmed_rosters WHERE ocr_batch_id=${id}::uuid`;
      if (confirmedRoster.length) conflict('OCR_ROSTER_ALREADY_CONFIRMED');
      const latest = (await tx.$queryRaw<Revision[]>`SELECT version,selections,draft_rows,created_at FROM v81_ocr_draft_revisions
        WHERE batch_id=${id}::uuid ORDER BY version DESC LIMIT 1`)[0];
      if ((latest?.version ?? 0) !== input.expectedVersion) throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
      let selections: OcrDraftSelection[], rows: DraftRow[];
      if (create) {
        selections = JSON.parse(JSON.stringify((input as OcrDraftCreateInput).selections)) as OcrDraftSelection[];
        if (new Set(selections.map(s => `${s.pageId}:${s.tableIndex}`)).size !== selections.length) invalid('OCR_DUPLICATE_TABLE_SELECTION');
        const pages = new Set(selections.map(s => s.pageId));
        if (pages.size !== batch.source_manifest.length || batch.source_manifest.some(p => !pages.has(p.id))) invalid('OCR_ALL_PAGES_REQUIRED');
        const active = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM v81_ocr_jobs WHERE batch_id=${id}::uuid AND status IN ('QUEUED','RUNNING') LIMIT 1`;
        if (active.length) conflict('OCR_BATCH_NOT_FINISHED');
        rows = [];
        for (const page of batch.source_manifest) {
          const attempt = (await tx.$queryRaw<{ attempt: number; outcome: string; evidence: OcrTableSource | null }[]>`
            SELECT attempt,outcome,evidence FROM v81_ocr_page_attempts WHERE batch_id=${id}::uuid AND page_id=${page.id}::uuid ORDER BY attempt DESC LIMIT 1`)[0];
          if (!attempt || attempt.outcome !== 'SUCCEEDED' || !attempt.evidence) conflict('OCR_PAGE_NOT_SUCCESSFUL');
          for (const selection of selections.filter(s => s.pageId === page.id)) {
            if (selection.attempt !== attempt!.attempt) conflict('OCR_ATTEMPT_NOT_LATEST');
            let draft: ReturnType<typeof selectOcrPersonnelDraft>;
            try { draft = selectOcrPersonnelDraft(attempt!.evidence!, { ...selection, purpose: batch.purpose }); }
            catch (error) { return invalid(error instanceof Error && /^OCR_[A-Z_]+$/.test(error.message) ? error.message : 'OCR_SELECTION_INVALID'); }
            if (rows.length + draft.rows.length > 500) invalid('OCR_PERSONNEL_ROW_LIMIT');
            rows.push(...draft.rows.map(row => ({ id: this.ids.next(), source: { pageId: page.id, attempt: selection.attempt,
              tableIndex: selection.tableIndex, sourceRow: row.sourceRow, evidence: row.evidence }, values: row.values,
              ocrIssues: row.issues, reviewedAgainstSource: false })));
          }
        }
      } else {
        if (!latest) conflict('OCR_DRAFT_NOT_CREATED');
        selections = latest!.selections;
        const edits = (input as OcrDraftRevisionInput).rows;
        const confirmed = await tx.$queryRaw<{ row_id: string }[]>`SELECT row_id FROM v81_ocr_physical_confirmations WHERE batch_id=${id}::uuid`;
        if (edits.some(edit => confirmed.some(row => row.row_id === edit.id))) conflict('OCR_ROW_ALREADY_CONFIRMED');
        if (new Set(edits.map(row => row.id)).size !== edits.length || edits.some(edit => !latest!.draft_rows.some(row => row.id === edit.id))) invalid('OCR_ROW_ID_INVALID');
        const fields = batch.purpose === 'ROSTER' ? ['studentNumber', 'name'] : ['studentNumber', 'name', 'runType', 'elapsed', 'testedOn'];
        for (const edit of edits) if (Object.keys(edit.values).filter(k => edit.values[k as OcrPersonnelField] !== undefined).some(k => !fields.includes(k)) ||
          fields.some(k => typeof edit.values[k as OcrPersonnelField] !== 'string')) invalid('OCR_VALUES_PURPOSE_MISMATCH');
        rows = latest!.draft_rows.map(row => {
          const edit = edits.find(edit => edit.id === row.id);
          return edit ? { ...row, values: edit.values, reviewedAgainstSource: edit.reviewedAgainstSource } : row;
        });
      }
      const serializedSelections = JSON.stringify(selections), serializedRows = JSON.stringify(rows);
      const sizes = await tx.$queryRaw<{ bytes: number }[]>`SELECT octet_length((${serializedSelections}::jsonb)::text)
        +octet_length((${serializedRows}::jsonb)::text) AS bytes`;
      if (sizes[0]!.bytes > 8388608) invalid('OCR_DRAFT_TOO_LARGE');
      const now = this.clock.now(), version = input.expectedVersion + 1;
      const saved = (await tx.$queryRaw<Revision[]>`INSERT INTO v81_ocr_draft_revisions(batch_id,version,selections,draft_rows,actor_id,request_id,created_at)
        VALUES(${id}::uuid,${version},${serializedSelections}::jsonb,${serializedRows}::jsonb,${principal.userId}::uuid,${requestId},${now}) RETURNING *`)[0]!;
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${this.ids.next()}::uuid,${principal.organizationId}::uuid,'OCR_DRAFT',${id}::uuid,${create ? 'CREATED' : 'REVISED'},${principal.userId}::uuid,
          ${requestId},${version},${JSON.stringify({ rowCount: rows.length, pendingReviewCount: rows.filter(row => !row.reviewedAgainstSource).length })}::jsonb,${now},'SUCCEEDED')`;
      return this.idempotency.success(project(batch, saved));
    });
  }
}
const uuid = new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) });
@Controller()
export class V81OcrDraftsController {
  constructor(private readonly service: V81OcrDraftsService) {}
  @Get('ocr-batches/:batchId/draft') @Header('Cache-Control', 'no-store') @OperationPolicy('getV81OcrDraft')
  get(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('batchId', uuid) id: string, @Query() query: OcrDraftQuery) { return this.service.get(principal, id, query); }
  @Post('ocr-batches/:batchId/draft') @OperationPolicy('createV81OcrDraft')
  create(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('batchId', uuid) id: string, @Body() input: OcrDraftCreateInput,
    @Req() req: FoundationRequest, @Headers('idempotency-key') key?: string) { return this.service.write(principal, id, input, req.requestId, key, true); }
  @Post('ocr-batches/:batchId/draft/revisions') @OperationPolicy('reviseV81OcrDraft')
  revise(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('batchId', uuid) id: string, @Body() input: OcrDraftRevisionInput,
    @Req() req: FoundationRequest, @Headers('idempotency-key') key?: string) { return this.service.write(principal, id, input, req.requestId, key, false); }
}
