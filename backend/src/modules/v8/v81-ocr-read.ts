import { Controller, Get, Header, Inject, Injectable, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsUUID, Max, Min, ValidateIf } from 'class-validator';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../common/database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { OBJECT_STORAGE_PORT, type ObjectStoragePort } from '../../common/object-storage/object-storage.port.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';
import type { OcrSourcePage } from './ocr-multipart.js';
import type { OcrTableSource } from './domain/ocr-table-source.js';
type Batch = { id: string; class_section_id: string; purpose: string; created_at: Date; total_bytes: bigint; source_manifest: OcrSourcePage[] };
type Attempt = { page_id: string; attempt: number; outcome: string; error_code: string | null; created_at: Date; evidence: OcrTableSource | null };
export class OcrBatchListQuery {
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsUUID() beforeId?: string;
}
@Injectable()
export class V81OcrReadService {
  constructor(private readonly prisma: PrismaService, @Inject(OBJECT_STORAGE_PORT) private readonly storage: ObjectStoragePort) {}
  private async course(tx: Prisma.TransactionClient, principal: AuthenticatedPrincipal, id: string) {
    if (principal.role !== 'TEACHER') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    if (!await tx.classSection.findFirst({ where: { id, organizationId: principal.organizationId, teacher: { userId: principal.userId } }, select: { id: true } }))
      throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
  }
  private async batch(tx: Prisma.TransactionClient, principal: AuthenticatedPrincipal, id: string) {
    if (principal.role !== 'TEACHER') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    const rows = await tx.$queryRaw<Batch[]>`SELECT * FROM v81_ocr_batches WHERE id=${id}::uuid AND organization_id=${principal.organizationId}::uuid`;
    const batch = rows[0];
    if (!batch) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    await this.course(tx, principal, batch.class_section_id);
    return batch;
  }
  async list(principal: AuthenticatedPrincipal, id: string, query: OcrBatchListQuery) {
    return this.prisma.$transaction(async tx => {
      await this.course(tx, principal, id);
      const batches = await tx.$queryRaw<Batch[]>`SELECT * FROM v81_ocr_batches WHERE organization_id=${principal.organizationId}::uuid
        AND class_section_id=${id}::uuid AND (${query.beforeId ?? null}::uuid IS NULL OR id<${query.beforeId ?? null}::uuid)
        ORDER BY id DESC LIMIT ${query.limit + 1}`;
      const page = batches.slice(0, query.limit);
      return { items: page.map(batch => ({ id: batch.id, classSectionId: id, purpose: batch.purpose,
        createdAt: batch.created_at.toISOString(), pageCount: batch.source_manifest.length, totalBytes: Number(batch.total_bytes) })),
        nextBeforeId: batches.length > query.limit ? page.at(-1)!.id : null };
    }, { isolationLevel: 'RepeatableRead' });
  }
  async detail(principal: AuthenticatedPrincipal, id: string) {
    return this.prisma.$transaction(async tx => {
      const batch = await this.batch(tx, principal, id);
      const attempts = await tx.$queryRaw<Attempt[]>`SELECT DISTINCT ON(page_id) page_id,attempt,outcome,error_code,created_at
        FROM v81_ocr_page_attempts WHERE batch_id=${id}::uuid ORDER BY page_id,attempt DESC`;
      return { id: batch.id, classSectionId: batch.class_section_id, purpose: batch.purpose,
        createdAt: batch.created_at.toISOString(), totalBytes: Number(batch.total_bytes), pages: batch.source_manifest.map(({ storageKey: _key, ...page }) => {
          const attempt = attempts.find(item => item.page_id === page.id);
          return { ...page, latestAttempt: attempt ? { attempt: attempt.attempt, outcome: attempt.outcome,
            errorCode: attempt.error_code, createdAt: attempt.created_at.toISOString() } : null };
        }) };
    }, { isolationLevel: 'RepeatableRead' });
  }
  async recognition(principal: AuthenticatedPrincipal, id: string, pageId: string) {
    return this.prisma.$transaction(async tx => {
      const batch = await this.batch(tx, principal, id);
      if (!batch.source_manifest.some(page => page.id === pageId)) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      const attempts = await tx.$queryRaw<Attempt[]>`SELECT * FROM v81_ocr_page_attempts WHERE batch_id=${id}::uuid AND page_id=${pageId}::uuid
        ORDER BY attempt DESC LIMIT 1`;
      const row = attempts[0];
      return { batchId: id, pageId, latestAttempt: row ? { attempt: row.attempt, outcome: row.outcome,
        errorCode: row.error_code, createdAt: row.created_at.toISOString(), evidence: row.evidence } : null };
    }, { isolationLevel: 'RepeatableRead' });
  }
  async source(principal: AuthenticatedPrincipal, id: string, pageId: string) {
    const page = await this.prisma.$transaction(async tx => {
      const batch = await this.batch(tx, principal, id), page = batch.source_manifest.find(item => item.id === pageId);
      if (!page) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      return page;
    }, { isolationLevel: 'RepeatableRead' });
    const stream = await this.storage.getPrivateObject(page.storageKey), chunks: Buffer[] = [];
    const digest = createHash('sha256'); let size = 0;
    for await (const chunk of stream) {
      const bytes = Buffer.from(chunk as Uint8Array); size += bytes.length;
      if (size > page.sizeBytes || size > 104857600) throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500);
      chunks.push(bytes); digest.update(bytes);
    }
    if (size !== page.sizeBytes || digest.digest('hex') !== page.sha256) throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500);
    return { batchId: id, pageId, mimeType: page.mimeType, sizeBytes: size, sha256: page.sha256, fileBase64: Buffer.concat(chunks).toString('base64') };
  }
}
const uuid = new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) });
@Controller()
export class V81OcrReadController {
  constructor(private readonly service: V81OcrReadService) {}
  @Get('class-sections/:classSectionId/ocr-batches') @OperationPolicy('listV81OcrBatches')
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('classSectionId', uuid) id: string, @Query() query: OcrBatchListQuery) {
    return this.service.list(principal, id, query);
  }
  @Get('ocr-batches/:batchId') @OperationPolicy('getV81OcrBatch')
  detail(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('batchId', uuid) id: string) { return this.service.detail(principal, id); }
  @Get('ocr-batches/:batchId/pages/:pageId/recognition') @Header('Cache-Control', 'no-store') @OperationPolicy('getV81OcrPageRecognition')
  recognition(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('batchId', uuid) id: string, @Param('pageId', uuid) page: string) {
    return this.service.recognition(principal, id, page);
  }
  @Get('ocr-batches/:batchId/pages/:pageId/source') @Header('Cache-Control', 'no-store') @OperationPolicy('getV81OcrPageSource')
  source(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('batchId', uuid) id: string, @Param('pageId', uuid) page: string) {
    return this.service.source(principal, id, page);
  }
}
