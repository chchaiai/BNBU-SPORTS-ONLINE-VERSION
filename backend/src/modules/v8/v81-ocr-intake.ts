import { Controller, Headers, Inject, Injectable, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { OBJECT_STORAGE_PORT, type ObjectStoragePort } from '../../common/object-storage/object-storage.port.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import type { AuthenticatedPrincipal, FoundationRequest } from '../../common/http/request-context.js';
import { Clock } from '../../common/time/clock.js';
import { IdGenerator } from '../../common/time/id-generator.js';
import { receiveOcrPages } from './ocr-multipart.js';
import { requireUnsettledCourse } from './v81-settlement-write-guard.js';

@Injectable()
export class V81OcrIntakeService {
  constructor(private readonly prisma: PrismaService, private readonly idempotency: IdempotencyService,
    private readonly clock: Clock, private readonly ids: IdGenerator,
    @Inject(OBJECT_STORAGE_PORT) private readonly storage: ObjectStoragePort) {}
  private async authorize(tx: Prisma.TransactionClient, principal: AuthenticatedPrincipal, classSectionId: string, requireOpen = true) {
    if (principal.role !== 'TEACHER') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    const section = await tx.classSection.findFirst({ where: { id: classSectionId, organizationId: principal.organizationId,
      teacher: { userId: principal.userId } }, include: { semester: true } });
    if (!section) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    if (requireOpen && (!['UPCOMING', 'ACTIVE'].includes(section.status) || section.semester.status === 'ARCHIVED'))
      throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
  }
  async create(principal: AuthenticatedPrincipal, classSectionId: string, purpose: 'ROSTER' | 'PHYSICAL',
    req: FoundationRequest, key?: string) {
    // Check ownership before reading files; current course state is checked only for a new command.
    // An accepted upload must remain replayable if the course closes before its response is received.
    await this.prisma.$transaction(tx => this.authorize(tx, principal, classSectionId, false));
    const id = this.ids.next();
    let upload: Awaited<ReturnType<typeof receiveOcrPages>>;
    try { upload = await receiveOcrPages(req, this.storage, { organizationId: principal.organizationId, batchId: id }); }
    catch { throw new ApplicationError('VALIDATION_FAILED', 422, { reason: 'OCR_SOURCE_UPLOAD_FAILED' }); }
    try {
      return await this.idempotency.execute({ organizationId: principal.organizationId, principalId: principal.userId,
        authSessionId: principal.sessionId, operationId: purpose === 'ROSTER' ? 'createV81OcrRosterBatch' : 'createV81OcrPhysicalBatch',
        scope: `${principal.organizationId}:${classSectionId}`, key, requestId: req.requestId,
        request: { purpose, pages: upload.pages.map(page => ({ sha256: page.sha256, sizeBytes: page.sizeBytes, mimeType: page.mimeType })) } }, async tx => {
        await tx.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
        if ((await tx.systemPolicy.findUnique({ where: { organizationId: principal.organizationId } }))?.systemMode !== 'NORMAL')
          throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
        await tx.$queryRaw`SELECT id FROM class_sections WHERE id=${classSectionId}::uuid FOR UPDATE`;
        await this.authorize(tx, principal, classSectionId);
        await requireUnsettledCourse(tx, principal.organizationId, classSectionId);
        const now = this.clock.now();
        await tx.$executeRaw`INSERT INTO v81_ocr_batches(id,organization_id,class_section_id,purpose,source_manifest,total_bytes,actor_id,request_id,created_at)
          VALUES(${id}::uuid,${principal.organizationId}::uuid,${classSectionId}::uuid,${purpose},${JSON.stringify(upload.pages)}::jsonb,
            ${upload.totalBytes},${principal.userId}::uuid,${req.requestId},${now})`;
        await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
          VALUES(${this.ids.next()}::uuid,${principal.organizationId}::uuid,'OCR_BATCH',${id}::uuid,'SOURCE_ACCEPTED',${principal.userId}::uuid,
            ${req.requestId},1,${JSON.stringify({ purpose, pageCount: upload.pages.length, totalBytes: upload.totalBytes })}::jsonb,${now},'SUCCEEDED')`;
        return this.idempotency.success({ id, classSectionId, purpose, createdAt: now.toISOString(),
          pageCount: upload.pages.length, totalBytes: upload.totalBytes, recognitionStatus: 'NOT_STARTED',
          pages: upload.pages.map(({ storageKey: _key, ...page }) => page) });
      });
    } finally {
      // On replay or a rolled-back transaction, remove only this request's new objects.
      // If commit state cannot be read, retain objects for reconciliation rather than deleting a possible committed source.
      const committed = await this.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM v81_ocr_batches WHERE id=${id}::uuid`;
      if (!committed.length) await Promise.all(upload.pages.map(page => this.storage.deletePrivateObject(page.storageKey)));
    }
  }
}
const uuid = new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) });
@Controller('class-sections/:classSectionId')
export class V81OcrIntakeController {
  constructor(private readonly service: V81OcrIntakeService) {}
  @Post('ocr-roster-batches') @OperationPolicy('createV81OcrRosterBatch')
  roster(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('classSectionId', uuid) id: string,
    @Req() req: FoundationRequest, @Headers('idempotency-key') key?: string) {
    return this.service.create(principal, id, 'ROSTER', req, key);
  }
  @Post('ocr-physical-batches') @OperationPolicy('createV81OcrPhysicalBatch')
  physical(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('classSectionId', uuid) id: string,
    @Req() req: FoundationRequest, @Headers('idempotency-key') key?: string) {
    return this.service.create(principal, id, 'PHYSICAL', req, key);
  }
}
