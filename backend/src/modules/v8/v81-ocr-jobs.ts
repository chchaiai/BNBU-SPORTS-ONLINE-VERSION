import { requireUnsettledCourse } from './v81-settlement-write-guard.js';
import { Body, Controller, Get, Headers, Inject, Injectable, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { IsInt, Max, Min } from 'class-validator';
import { PrismaService } from '../../common/database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { RUNTIME_CONFIG } from '../../common/config/runtime-config.module.js';
import type { RuntimeConfig } from '../../common/config/environment.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import type { AuthenticatedPrincipal, FoundationRequest } from '../../common/http/request-context.js';
import { Clock } from '../../common/time/clock.js';
import { IdGenerator } from '../../common/time/id-generator.js';
import type { OcrSourcePage } from './ocr-multipart.js';
import { currentOcrService } from './v81-ocr-service-config.js';
export class OcrJobInput { @IsInt() @Min(0) @Max(2147483645) expectedAttempt!: number; }
type Job = { id: string; batch_id: string; page_id: string; status: string; version: number;
  expected_attempt: number; result_attempt: number | null; created_at: Date; updated_at: Date };
const project = (job: Job) => ({ id: job.id, batchId: job.batch_id, pageId: job.page_id, status: job.status,
  version: job.version, expectedAttempt: job.expected_attempt, resultAttempt: job.result_attempt,
  createdAt: job.created_at.toISOString(), updatedAt: job.updated_at.toISOString() });
@Injectable()
export class V81OcrJobsService {
  constructor(private readonly prisma: PrismaService, private readonly idempotency: IdempotencyService,
    private readonly clock: Clock, private readonly ids: IdGenerator, @Inject(RUNTIME_CONFIG) private readonly config: RuntimeConfig) {}
  private async scope(tx: Prisma.TransactionClient, principal: AuthenticatedPrincipal, id: string, pageId: string, writable = false) {
    if (principal.role !== 'TEACHER') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    const rows = await tx.$queryRaw<{ class_section_id: string; source_manifest: OcrSourcePage[]; created_at: Date }[]>`
      SELECT class_section_id,source_manifest,created_at FROM v81_ocr_batches WHERE id=${id}::uuid AND organization_id=${principal.organizationId}::uuid`;
    const batch = rows[0];
    if (!batch || !batch.source_manifest.some(page => page.id === pageId)) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    const section = await tx.classSection.findFirst({ where: { id: batch.class_section_id, organizationId: principal.organizationId,
      teacher: { userId: principal.userId } }, include: { semester: true } });
    if (!section) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    if (writable) await requireUnsettledCourse(tx, principal.organizationId, batch.class_section_id);
    if (writable && (section.semester.status === 'ARCHIVED' || !(['ACTIVE', 'UPCOMING'].includes(section.status) ||
      (section.status === 'CLOSED' && section.closedAt && batch.created_at <= section.closedAt))))
      throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
  }
  async get(principal: AuthenticatedPrincipal, id: string) {
    return this.prisma.$transaction(async tx => {
      if (principal.role !== 'TEACHER') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
      const rows = await tx.$queryRaw<Job[]>`SELECT * FROM v81_ocr_jobs WHERE id=${id}::uuid AND organization_id=${principal.organizationId}::uuid`;
      if (!rows[0]) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      await this.scope(tx, principal, rows[0].batch_id, rows[0].page_id);
      return project(rows[0]);
    }, { isolationLevel: 'RepeatableRead' });
  }
  async enqueue(principal: AuthenticatedPrincipal, batchId: string, pageId: string, input: OcrJobInput, requestId: string, key?: string) {
    await this.prisma.$transaction(tx => this.scope(tx, principal, batchId, pageId));
    return this.idempotency.execute({ organizationId: principal.organizationId, principalId: principal.userId,
      authSessionId: principal.sessionId, operationId: 'createV81OcrJob', scope: `${principal.organizationId}:${batchId}:${pageId}`,
      request: input, requestId, key }, async tx => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
      if ((await tx.systemPolicy.findUnique({ where: { organizationId: principal.organizationId } }))?.systemMode !== 'NORMAL')
        throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
      const service = await currentOcrService(tx, principal.organizationId, this.config.ocr);
      if (service.provider !== 'TENCENT_TABLE_V3' || !service.enabled)
        throw new ApplicationError('SYSTEM_SERVICE_UNAVAILABLE', 503, { reason: service.provider === 'DISABLED' ? 'OCR_PROVIDER_NOT_CONFIGURED' : 'OCR_SERVICE_PAUSED' });
      await tx.$queryRaw`SELECT id FROM v81_ocr_batches WHERE id=${batchId}::uuid FOR UPDATE`;
      await this.scope(tx, principal, batchId, pageId, true);
      const attempts = await tx.$queryRaw<{ attempt: number }[]>`SELECT coalesce(max(attempt),0) AS attempt FROM v81_ocr_page_attempts
        WHERE batch_id=${batchId}::uuid AND page_id=${pageId}::uuid`;
      if (attempts[0]!.attempt !== input.expectedAttempt) throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
      const active = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM v81_ocr_jobs WHERE batch_id=${batchId}::uuid AND page_id=${pageId}::uuid AND status IN ('QUEUED','RUNNING')`;
      if (active.length) throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409, { reason: 'OCR_PAGE_ALREADY_QUEUED' });
      const id = this.ids.next(), now = this.clock.now();
      const jobs = await tx.$queryRaw<Job[]>`INSERT INTO v81_ocr_jobs(id,batch_id,organization_id,page_id,actor_id,expected_attempt,request_id,created_at,updated_at)
        VALUES(${id}::uuid,${batchId}::uuid,${principal.organizationId}::uuid,${pageId}::uuid,${principal.userId}::uuid,
          ${input.expectedAttempt},${requestId},${now},${now}) RETURNING *`;
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${this.ids.next()}::uuid,${principal.organizationId}::uuid,'OCR_JOB',${id}::uuid,'QUEUED',${principal.userId}::uuid,
          ${requestId},1,${JSON.stringify({ batchId, pageId, expectedAttempt: input.expectedAttempt })}::jsonb,${now},'SUCCEEDED')`;
      return this.idempotency.success(project(jobs[0]!));
    });
  }
}
const uuid = new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) });
@Controller()
export class V81OcrJobsController {
  constructor(private readonly service: V81OcrJobsService) {}
  @Post('ocr-batches/:batchId/pages/:pageId/recognition') @OperationPolicy('createV81OcrJob')
  create(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('batchId', uuid) batch: string, @Param('pageId', uuid) page: string,
    @Body() input: OcrJobInput, @Req() req: FoundationRequest, @Headers('idempotency-key') key?: string) {
    return this.service.enqueue(principal, batch, page, input, req.requestId, key);
  }
  @Get('ocr-jobs/:jobId') @OperationPolicy('getV81OcrJob')
  get(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('jobId', uuid) id: string) { return this.service.get(principal, id); }
}
