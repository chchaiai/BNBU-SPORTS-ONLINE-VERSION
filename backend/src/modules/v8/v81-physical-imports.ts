import { Body, Controller, Get, Headers, Inject, Injectable, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { Readable } from 'node:stream';
import { requireUnsettledCourse } from './v81-settlement-write-guard.js';
import { OBJECT_STORAGE_PORT, type ObjectStoragePort } from '../../common/object-storage/object-storage.port.js';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { readPhysicalXlsxIsolated } from './domain/physical-xlsx-isolated.js';
import { Type } from 'class-transformer';
import { V81PhysicalResultsService } from './v81-physical-results.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import type { FoundationRequest } from '../../common/http/request-context.js';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../common/database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { Clock } from '../../common/time/clock.js';
import { IdGenerator } from '../../common/time/id-generator.js';
import { readPhysicalCsv } from './domain/physical-csv.js';
import { inspectPhysicalImport, type PhysicalImportRow } from './domain/physical-import.js';

type Batch = { id: string; class_section_id: string; source_sha256: string; source_rows: PhysicalImportRow[]; created_at: Date;
  source_format?: 'CSV' | 'XLSX'; source_sheet?: string | null };
type Row = { row_number: number; version: number; content: PhysicalImportRow; result_version: number | null };
export class PhysicalImportInput { @IsString() @MaxLength(1048576) csv!: string; }
export class PhysicalXlsxInput {
  @IsString() @MinLength(1) @MaxLength(31) sheetName!: string;
  @IsString() @MinLength(4) @MaxLength(1398104) @Matches(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
  fileBase64!: string;
}
export class PhysicalImportListQuery {
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsUUID() beforeId?: string;
}
export class PhysicalImportHistoryQuery {
  @Type(() => Number) @IsInt() @Min(1) @Max(1000) rowNumber!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @ValidateIf((_object, value: unknown) => value !== undefined) @Type(() => Number) @IsInt() @Min(1) @Max(2147483647)
  beforeVersion?: number;
}
export class PhysicalImportSelection {
  @IsInt() @Min(1) @Max(1000) rowNumber!: number;
  @IsInt() @Min(1) @Max(2147483646) expectedVersion!: number;
  @IsInt() @Min(0) @Max(2147483646) expectedResultVersion!: number;
}
export class PhysicalImportConfirmationInput {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(1000) @ValidateNested({ each: true }) @Type(() => PhysicalImportSelection)
  selections!: PhysicalImportSelection[];
}
export class PhysicalImportRevisionInput implements PhysicalImportRow {
  @IsInt() @Min(1) @Max(1000) rowNumber!: number;
  @IsInt() @Min(1) @Max(2147483646) expectedVersion!: number;
  @IsString() @MaxLength(1048576) studentNumber!: string;
  @IsString() @MaxLength(1048576) name!: string;
  @IsString() @MaxLength(1048576) runType!: string;
  @IsString() @MaxLength(1048576) elapsed!: string;
  @IsString() @MaxLength(1048576) testedOn!: string;
}
@Injectable()
export class V81PhysicalImportsService {
  constructor(private readonly prisma: PrismaService, private readonly idempotency: IdempotencyService,
    private readonly clock: Clock, private readonly ids: IdGenerator, private readonly results: V81PhysicalResultsService,
    @Inject(OBJECT_STORAGE_PORT) private readonly storage: ObjectStoragePort) {}

  private sourceKey(organizationId: string, id: string, digest: string, format = 'CSV') {
    return `v81/physical-imports/${organizationId}/${id}/${digest}.${format === 'XLSX' ? 'xlsx' : 'csv'}`;
  }

  async source(principal: AuthenticatedPrincipal, id: string) {
    const batch = await this.prisma.$transaction(async tx => {
      if (principal.role !== 'TEACHER') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
      const batches = await tx.$queryRaw<Batch[]>`SELECT * FROM v81_physical_import_batches
        WHERE id=${id}::uuid AND organization_id=${principal.organizationId}::uuid`;
      if (!batches[0]) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      await this.scope(tx, principal, batches[0].class_section_id);
      return batches[0];
    }, { isolationLevel: 'RepeatableRead' });
    const stream = await this.storage.getPrivateObject(this.sourceKey(principal.organizationId, id, batch.source_sha256, batch.source_format));
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of stream) {
      const bytes = Buffer.from(chunk as Uint8Array);
      size += bytes.length;
      if (size > 1048576) {
        stream.destroy();
        throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, { reason: 'PHYSICAL_SOURCE_TOO_LARGE' });
      }
      chunks.push(bytes);
    }
    const bytes = Buffer.concat(chunks);
    if (createHash('sha256').update(bytes).digest('hex') !== batch.source_sha256)
      throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, { reason: 'PHYSICAL_SOURCE_DIGEST_MISMATCH' });
    return batch.source_format === 'XLSX'
      ? { fileBase64: bytes.toString('base64'), sourceSha256: batch.source_sha256, sheetName: batch.source_sheet! }
      : { csv: bytes.toString('utf8'), sourceSha256: batch.source_sha256 };
  }

  private async scope(tx: Prisma.TransactionClient, principal: AuthenticatedPrincipal, classSectionId: string) {
    if (principal.role !== 'TEACHER') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    const section = await tx.classSection.findFirst({ where: { id: classSectionId, organizationId: principal.organizationId,
      teacher: { userId: principal.userId } }, include: { semester: true } });
    if (!section) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    return section;
  }

  private async project(tx: Prisma.TransactionClient, principal: AuthenticatedPrincipal, batch: Batch) {
    const members = await tx.enrollment.findMany({ where: { classSectionId: batch.class_section_id,
      organizationId: principal.organizationId, status: 'ACTIVE' }, include: { student: true } });
    const rows = await tx.$queryRaw<Row[]>`SELECT r.*,c.result_version FROM
      (SELECT DISTINCT ON(row_number) row_number,version,content FROM v81_physical_import_row_revisions
       WHERE batch_id=${batch.id}::uuid ORDER BY row_number,version DESC) r
      LEFT JOIN v81_physical_import_confirmations c ON c.batch_id=${batch.id}::uuid AND c.row_number=r.row_number ORDER BY r.row_number`;
    const inspected = inspectPhysicalImport(rows.map(row => row.content), members.map(member => ({ enrollmentId: member.id,
      studentNumber: member.student.studentNumber, name: member.student.fullName, gender: member.student.gender })));
    return { id: batch.id, classSectionId: batch.class_section_id, sourceSha256: batch.source_sha256,
      createdAt: batch.created_at.toISOString(), rows: inspected.map((row, index) => ({ ...row,
        rowNumber: rows[index]!.row_number, version: rows[index]!.version, original: batch.source_rows[rows[index]!.row_number - 1]!,
        confirmed: rows[index]!.result_version !== null, resultVersion: rows[index]!.result_version })),
      pendingCount: rows.filter(row => row.result_version === null).length };
  }

  async history(principal: AuthenticatedPrincipal, id: string, query: PhysicalImportHistoryQuery) {
    return this.prisma.$transaction(async tx => {
      if (principal.role !== 'TEACHER') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
      const batches = await tx.$queryRaw<Batch[]>`SELECT * FROM v81_physical_import_batches
        WHERE id=${id}::uuid AND organization_id=${principal.organizationId}::uuid`;
      const batch = batches[0];
      if (!batch) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      await this.scope(tx, principal, batch.class_section_id);
      if (query.rowNumber > batch.source_rows.length) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      const rows = await tx.$queryRaw<{ version: number; content: PhysicalImportRow; created_at: Date }[]>`
        SELECT version,content,created_at FROM v81_physical_import_row_revisions
        WHERE batch_id=${id}::uuid AND row_number=${query.rowNumber}
          AND (${query.beforeVersion ?? null}::integer IS NULL OR version<${query.beforeVersion ?? null}::integer)
        ORDER BY version DESC LIMIT ${query.limit + 1}`;
      const page = rows.slice(0, query.limit);
      return { items: page.map(row => ({ version: row.version, source: row.content, createdAt: row.created_at.toISOString() })),
        nextBeforeVersion: rows.length > query.limit ? page.at(-1)!.version : null };
    }, { isolationLevel: 'RepeatableRead' });
  }

  async list(principal: AuthenticatedPrincipal, classSectionId: string, query: PhysicalImportListQuery) {
    return this.prisma.$transaction(async tx => {
      await this.scope(tx, principal, classSectionId);
      const batches = await tx.$queryRaw<{ id: string; created_at: Date; row_count: number; confirmed_count: bigint }[]>`
        SELECT b.id,b.created_at,jsonb_array_length(b.source_rows) AS row_count,
          (SELECT count(*) FROM v81_physical_import_confirmations c WHERE c.batch_id=b.id) AS confirmed_count
        FROM v81_physical_import_batches b
        WHERE b.organization_id=${principal.organizationId}::uuid AND b.class_section_id=${classSectionId}::uuid
          AND (${query.beforeId ?? null}::uuid IS NULL OR b.id<${query.beforeId ?? null}::uuid)
        ORDER BY b.id DESC LIMIT ${query.limit + 1}`;
      const page = batches.slice(0, query.limit);
      return { items: page.map(batch => ({ id: batch.id, createdAt: batch.created_at.toISOString(), rowCount: batch.row_count,
        confirmedCount: Number(batch.confirmed_count), pendingCount: batch.row_count - Number(batch.confirmed_count) })),
        nextBeforeId: batches.length > query.limit ? page.at(-1)!.id : null };
    }, { isolationLevel: 'RepeatableRead' });
  }

  async detail(principal: AuthenticatedPrincipal, id: string) {
    return this.prisma.$transaction(async tx => {
      if (principal.role !== 'TEACHER') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
      const batches = await tx.$queryRaw<Batch[]>`SELECT * FROM v81_physical_import_batches
        WHERE id=${id}::uuid AND organization_id=${principal.organizationId}::uuid`;
      if (!batches[0]) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      await this.scope(tx, principal, batches[0].class_section_id);
      return this.project(tx, principal, batches[0]);
    }, { isolationLevel: 'RepeatableRead' });
  }

  async confirm(principal: AuthenticatedPrincipal, id: string, input: PhysicalImportConfirmationInput, requestId: string, key?: string) {
    if (principal.role !== 'TEACHER') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    if (new Set(input.selections.map(row => row.rowNumber)).size !== input.selections.length)
      throw new ApplicationError('VALIDATION_FAILED', 422, { reason: 'DUPLICATE_SELECTED_ROW' });
    return this.idempotency.execute({ organizationId: principal.organizationId, principalId: principal.userId,
      authSessionId: principal.sessionId, operationId: 'confirmV81PhysicalImport', scope: `${principal.organizationId}:${id}`,
      request: input, requestId, key }, async tx => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
      const policy = await tx.systemPolicy.findUnique({ where: { organizationId: principal.organizationId } });
      if (policy?.systemMode !== 'NORMAL') throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
      const batches = await tx.$queryRaw<Batch[]>`SELECT * FROM v81_physical_import_batches
        WHERE id=${id}::uuid AND organization_id=${principal.organizationId}::uuid FOR UPDATE`;
      const batch = batches[0];
      if (!batch) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      const section = await this.scope(tx, principal, batch.class_section_id);
      await requireUnsettledCourse(tx, principal.organizationId, batch.class_section_id);
      if (section.semester.status === 'ARCHIVED') throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
      const draft = await this.project(tx, principal, batch);
      for (const selection of input.selections) {
        const row = draft.rows.find(item => item.rowNumber === selection.rowNumber);
        if (!row) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
        if (row.confirmed || row.version !== selection.expectedVersion) throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
        if (row.issues.length || !row.enrollmentId || row.elapsedSeconds === null)
          throw new ApplicationError('VALIDATION_FAILED', 422, { reason: 'UNRESOLVED_IMPORT_ROW' });
        const result = await this.results.appendInTransaction(tx, principal, row.enrollmentId, {
          runType: row.runType, elapsedSeconds: row.elapsedSeconds, testedOn: row.testedOn,
          expectedVersion: selection.expectedResultVersion }, requestId);
        await tx.$executeRaw`INSERT INTO v81_physical_import_confirmations(batch_id,row_number,row_version,enrollment_id,result_version,created_at)
          VALUES(${id}::uuid,${row.rowNumber},${row.version},${row.enrollmentId}::uuid,${result.version},${this.clock.now()})`;
      }
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${this.ids.next()}::uuid,${principal.organizationId}::uuid,'PHYSICAL_IMPORT',${id}::uuid,'ROWS_CONFIRMED',${principal.userId}::uuid,
          ${requestId},(SELECT coalesce(max(version),0)+1 FROM v81_events WHERE organization_id=${principal.organizationId}::uuid
            AND resource_type='PHYSICAL_IMPORT' AND resource_id=${id}::uuid),${JSON.stringify({ selections: input.selections })}::jsonb,${this.clock.now()},'SUCCEEDED')`;
      return this.idempotency.success(await this.project(tx, principal, batch));
    });
  }

  async revise(principal: AuthenticatedPrincipal, id: string, input: PhysicalImportRevisionInput, requestId: string, key?: string) {
    if (principal.role !== 'TEACHER') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    return this.idempotency.execute({ organizationId: principal.organizationId, principalId: principal.userId,
      authSessionId: principal.sessionId, operationId: 'reviseV81PhysicalImport', scope: `${principal.organizationId}:${id}`,
      request: input, requestId, key }, async tx => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
      const policy = await tx.systemPolicy.findUnique({ where: { organizationId: principal.organizationId } });
      if (policy?.systemMode !== 'NORMAL') throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
      const batches = await tx.$queryRaw<Batch[]>`SELECT * FROM v81_physical_import_batches
        WHERE id=${id}::uuid AND organization_id=${principal.organizationId}::uuid FOR UPDATE`;
      const batch = batches[0];
      if (!batch) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      const section = await this.scope(tx, principal, batch.class_section_id);
      await requireUnsettledCourse(tx, principal.organizationId, batch.class_section_id);
      if (section.semester.status === 'ARCHIVED') throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
      const before = await this.project(tx, principal, batch);
      const row = before.rows.find(item => item.rowNumber === input.rowNumber);
      if (!row) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      if (row.confirmed || row.version !== input.expectedVersion) throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
      const content: PhysicalImportRow = { studentNumber: input.studentNumber, name: input.name,
        runType: input.runType, elapsed: input.elapsed, testedOn: input.testedOn };
      const version = row.version + 1, now = this.clock.now();
      await tx.$executeRaw`INSERT INTO v81_physical_import_row_revisions(batch_id,row_number,version,content,actor_id,request_id,created_at)
        VALUES(${id}::uuid,${input.rowNumber},${version},${JSON.stringify(content)}::jsonb,${principal.userId}::uuid,${requestId},${now})`;
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${this.ids.next()}::uuid,${principal.organizationId}::uuid,'PHYSICAL_IMPORT',${id}::uuid,'ROW_REVISED',${principal.userId}::uuid,
          ${requestId},(SELECT coalesce(max(version),0)+1 FROM v81_events WHERE organization_id=${principal.organizationId}::uuid
            AND resource_type='PHYSICAL_IMPORT' AND resource_id=${id}::uuid),${JSON.stringify({ rowNumber: input.rowNumber, rowVersion: version, before: row.source, after: content })}::jsonb,${now},'SUCCEEDED')`;
      return this.idempotency.success(await this.project(tx, principal, batch));
    });
  }

  async create(principal: AuthenticatedPrincipal, classSectionId: string, csv: string, requestId: string, key?: string) {
    if (principal.role !== 'TEACHER') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    let source: PhysicalImportRow[];
    try { source = readPhysicalCsv(Buffer.from(csv, 'utf8'), { maxBytes: 1048576, maxRows: 1000 }); }
    catch (error) { throw new ApplicationError('VALIDATION_FAILED', 422, { reason: error instanceof Error ? error.message : 'PHYSICAL_CSV_INVALID' }); }
    return this.createParsed(principal, classSectionId, Buffer.from(csv, 'utf8'), source, 'CSV', null, { csv }, requestId, key);
  }

  async createXlsx(principal: AuthenticatedPrincipal, classSectionId: string, input: PhysicalXlsxInput, requestId: string, key?: string) {
    await this.scope(this.prisma, principal, classSectionId);
    const bytes = Buffer.from(input.fileBase64, 'base64');
    if (bytes.toString('base64') !== input.fileBase64) throw new ApplicationError('VALIDATION_FAILED', 422);
    let rows: PhysicalImportRow[];
    try { rows = await readPhysicalXlsxIsolated(bytes, input.sheetName, { maxBytes: 1048576, maxRows: 1000, timeoutMs: 5000 }); }
    catch (error) { throw new ApplicationError('VALIDATION_FAILED', 422, { reason: error instanceof Error ? error.message : 'PHYSICAL_XLSX_INVALID' }); }
    return this.createParsed(principal, classSectionId, bytes, rows, 'XLSX', input.sheetName, input, requestId, key);
  }

  private async createParsed(principal: AuthenticatedPrincipal, classSectionId: string, bytes: Buffer, source: PhysicalImportRow[],
    format: 'CSV' | 'XLSX', sheetName: string | null, request: object, requestId: string, key?: string) {
    return this.idempotency.execute({ organizationId: principal.organizationId, principalId: principal.userId,
      authSessionId: principal.sessionId, operationId: format === 'CSV' ? 'createV81PhysicalImport' : 'createV81PhysicalXlsxImport', scope: `${principal.organizationId}:${classSectionId}`,
      request, requestId, key }, async tx => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
      const policy = await tx.systemPolicy.findUnique({ where: { organizationId: principal.organizationId } });
      if (policy?.systemMode !== 'NORMAL') throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
      const section = await this.scope(tx, principal, classSectionId);
      await requireUnsettledCourse(tx, principal.organizationId, classSectionId);
      if (section.semester.status === 'ARCHIVED') throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
      const id = this.ids.next(), now = this.clock.now(), digest = createHash('sha256').update(bytes).digest('hex');
      await this.storage.putPrivateObject({ storageKey: this.sourceKey(principal.organizationId, id, digest, format),
        body: Readable.from([bytes]), contentType: format === 'CSV' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', contentLength: bytes.length });
      await tx.$executeRaw`INSERT INTO v81_physical_import_batches(id,organization_id,class_section_id,actor_id,source_sha256,source_rows,request_id,created_at,source_format,source_sheet)
        VALUES(${id}::uuid,${principal.organizationId}::uuid,${classSectionId}::uuid,${principal.userId}::uuid,${digest},${JSON.stringify(source)}::jsonb,${requestId},${now},${format},${sheetName})`;
      await tx.$executeRaw`INSERT INTO v81_physical_import_row_revisions(batch_id,row_number,version,content,actor_id,request_id,created_at)
        SELECT ${id}::uuid,ordinality::integer,1,value,${principal.userId}::uuid,${requestId},${now}
        FROM jsonb_array_elements(${JSON.stringify(source)}::jsonb) WITH ORDINALITY`;
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${this.ids.next()}::uuid,${principal.organizationId}::uuid,'PHYSICAL_IMPORT',${id}::uuid,'CREATED',${principal.userId}::uuid,
          ${requestId},1,${JSON.stringify({ sourceSha256: digest, rowCount: source.length })}::jsonb,${now},'SUCCEEDED')`;
      return this.idempotency.success(await this.project(tx, principal, { id, class_section_id: classSectionId, source_sha256: digest,
        source_rows: source, created_at: now }));
    });
  }
}

const importUuid = new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) });
@Controller()
export class V81PhysicalImportsController {
  constructor(private readonly service: V81PhysicalImportsService) {}
  @Post('class-sections/:classSectionId/physical-imports/xlsx') @OperationPolicy('createV81PhysicalXlsxImport')
  createXlsx(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('classSectionId', importUuid) id: string,
    @Body() input: PhysicalXlsxInput, @Headers('idempotency-key') key: string | undefined, @Req() req: FoundationRequest) {
    return this.service.createXlsx(principal, id, input, req.requestId, key);
  }
  @Get('physical-imports/:importId/revisions') @OperationPolicy('listV81PhysicalImportRevisions')
  history(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('importId', importUuid) id: string,
    @Query() query: PhysicalImportHistoryQuery) { return this.service.history(principal, id, query); }
  @Get('physical-imports/:importId/source') @OperationPolicy('getV81PhysicalImportSource')
  source(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('importId', importUuid) id: string) {
    return this.service.source(principal, id);
  }
  @Get('class-sections/:classSectionId/physical-imports') @OperationPolicy('listV81PhysicalImports')
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('classSectionId', importUuid) id: string,
    @Query() query: PhysicalImportListQuery) { return this.service.list(principal, id, query); }
  @Post('physical-imports/:importId/confirm') @OperationPolicy('confirmV81PhysicalImport')
  confirm(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('importId', importUuid) id: string,
    @Body() input: PhysicalImportConfirmationInput, @Headers('idempotency-key') key: string | undefined, @Req() req: FoundationRequest) {
    return this.service.confirm(principal, id, input, req.requestId, key);
  }
  @Post('physical-imports/:importId/revisions') @OperationPolicy('reviseV81PhysicalImport')
  revise(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('importId', importUuid) id: string,
    @Body() input: PhysicalImportRevisionInput, @Headers('idempotency-key') key: string | undefined, @Req() req: FoundationRequest) {
    return this.service.revise(principal, id, input, req.requestId, key);
  }
  @Post('class-sections/:classSectionId/physical-imports') @OperationPolicy('createV81PhysicalImport')
  create(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('classSectionId', importUuid) id: string,
    @Body() input: PhysicalImportInput, @Headers('idempotency-key') key: string | undefined, @Req() req: FoundationRequest) {
    return this.service.create(principal, id, input.csv, req.requestId, key);
  }
  @Get('physical-imports/:importId') @OperationPolicy('getV81PhysicalImport')
  detail(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('importId', importUuid) id: string) {
    return this.service.detail(principal, id);
  }
}
