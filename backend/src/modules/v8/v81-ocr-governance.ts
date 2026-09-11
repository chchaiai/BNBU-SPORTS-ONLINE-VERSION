import { Body, Controller, Get, Header, Headers, Inject, Injectable, Post, Query, Req } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/database/prisma.service.js';
import { RUNTIME_CONFIG } from '../../common/config/runtime-config.module.js';
import type { RuntimeConfig } from '../../common/config/environment.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { Clock } from '../../common/time/clock.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import { AllowSystemModes } from '../../common/policy/system-mode-policy.decorator.js';
import type { AuthenticatedPrincipal, FoundationRequest } from '../../common/http/request-context.js';
import { requireAdminAccess } from './v81-admin-access.js';
import { currentOcrService, type OcrServiceRevision } from './v81-ocr-service-config.js';

export class OcrServiceInput {
  @IsIn(['DISABLED', 'TENCENT_TABLE_V3']) provider!: 'DISABLED' | 'TENCENT_TABLE_V3';
  @ValidateIf((_o, v: unknown) => v !== null) @IsString() @Matches(/^[a-z]+-[a-z]+(?:-[0-9]+)?$/u) @MaxLength(64) region!: string | null;
  @IsInt() @Min(1000) @Max(60000) timeoutMs!: number;
  @IsBoolean() enabled!: boolean;
  @IsString() @Matches(/\S/u) @MaxLength(1000) reason!: string;
  @IsInt() @Min(0) @Max(2147483646) expectedVersion!: number;
}
export class OcrServiceHistoryQuery {
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @ValidateIf((_o, v: unknown) => v !== undefined) @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) beforeVersion?: number;
}
const project = (r: OcrServiceRevision) => ({ id: r.id, version: r.version, provider: r.provider, region: r.region,
  timeoutMs: r.timeout_ms, enabled: r.enabled, reason: r.reason, actorUserId: r.actor_id, createdAt: r.created_at.toISOString() });
@Injectable()
export class V81OcrGovernanceService {
  constructor(private readonly prisma: PrismaService, private readonly idempotency: IdempotencyService,
    private readonly clock: Clock, @Inject(RUNTIME_CONFIG) private readonly config: RuntimeConfig) {}
  async status(p: AuthenticatedPrincipal) {
    return this.prisma.$transaction(async tx => {
      await requireAdminAccess(tx, p, 'SUPER');
      const service = await currentOcrService(tx, p.organizationId, this.config.ocr);
      const mode = (await tx.systemPolicy.findUniqueOrThrow({ where: { organizationId: p.organizationId } })).systemMode;
      const counts = (await tx.$queryRaw<{ queued: bigint; running: bigint; succeeded: bigint; failed: bigint; oldest_waiting: Date | null; last_finished: Date | null }[]>`
        SELECT count(*) FILTER(WHERE status='QUEUED') AS queued,count(*) FILTER(WHERE status='RUNNING') AS running,
          count(*) FILTER(WHERE status='SUCCEEDED') AS succeeded,count(*) FILTER(WHERE status='FAILED') AS failed,
          min(created_at) FILTER(WHERE status IN ('QUEUED','RUNNING')) AS oldest_waiting,
          max(updated_at) FILTER(WHERE status IN ('SUCCEEDED','FAILED')) AS last_finished
        FROM v81_ocr_jobs WHERE organization_id=${p.organizationId}::uuid`)[0]!;
      const runtimeWorkerEnabled = this.config.ocr?.provider === 'TENCENT_TABLE_V3' && this.config.ocr.workerEnabled === true;
      return { scope: 'ORGANIZATION', configurationSource: service.revision ? 'ADMIN_REVISION' : 'DEPLOYMENT_ENVIRONMENT',
        configuration: { version: service.version, provider: service.provider, region: service.region, timeoutMs: service.timeoutMs, enabled: service.enabled },
        runtimeWorkerEnabled, executionEnabled: runtimeWorkerEnabled && service.enabled && service.provider === 'TENCENT_TABLE_V3' && mode === 'NORMAL',
        systemMode: mode, credentialSource: 'CVM_ROLE', providerConnectivity: 'UNVERIFIED',
        automaticPassValidation: 'NOT_PROVIDED', formalFactsRequireTeacherConfirmation: true,
        jobs: { queued: Number(counts.queued), running: Number(counts.running), succeeded: Number(counts.succeeded), failed: Number(counts.failed),
          oldestWaitingAt: counts.oldest_waiting?.toISOString() ?? null, lastFinishedAt: counts.last_finished?.toISOString() ?? null },
        observedAt: this.clock.now().toISOString() };
    }, { isolationLevel: 'RepeatableRead' });
  }
  async history(p: AuthenticatedPrincipal, q: OcrServiceHistoryQuery) {
    await requireAdminAccess(this.prisma, p, 'SUPER');
    const rows = await this.prisma.$queryRaw<OcrServiceRevision[]>`SELECT * FROM v81_ocr_service_revisions WHERE organization_id=${p.organizationId}::uuid
      AND (${q.beforeVersion ?? null}::integer IS NULL OR version<${q.beforeVersion ?? null}::integer) ORDER BY version DESC LIMIT ${q.limit + 1}`;
    const page = rows.slice(0, q.limit);
    return { items: page.map(project), nextBeforeVersion: rows.length > q.limit ? page.at(-1)!.version : null };
  }
  async save(p: AuthenticatedPrincipal, input: OcrServiceInput, requestId: string, key?: string) {
    await requireAdminAccess(this.prisma, p, 'SUPER');
    if ((input.provider === 'DISABLED' && (input.enabled || input.region !== null)) || (input.provider === 'TENCENT_TABLE_V3' && input.region === null))
      throw new ApplicationError('VALIDATION_FAILED', 422);
    return this.idempotency.execute({ organizationId: p.organizationId, principalId: p.userId, authSessionId: p.sessionId,
      operationId: 'saveV81OcrService', scope: p.organizationId, request: input, requestId, key }, async tx => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${p.organizationId}::uuid FOR NO KEY UPDATE`;
      await requireAdminAccess(tx, p, 'SUPER');
      const previous = await currentOcrService(tx, p.organizationId, this.config.ocr);
      if (input.expectedVersion !== previous.version) throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
      const id = randomUUID(), now = this.clock.now(), version = previous.version + 1;
      const rows = await tx.$queryRaw<OcrServiceRevision[]>`INSERT INTO v81_ocr_service_revisions(id,organization_id,version,provider,region,timeout_ms,enabled,reason,actor_id,request_id,created_at)
        VALUES(${id}::uuid,${p.organizationId}::uuid,${version},${input.provider},${input.region},${input.timeoutMs},${input.enabled},${input.reason.trim()},
          ${p.userId}::uuid,${requestId},${now}) RETURNING *`;
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,event_outcome,request_id,version,facts,occurred_at)
        VALUES(${randomUUID()}::uuid,${p.organizationId}::uuid,'OCR_SERVICE',${id}::uuid,'CONFIGURED',${p.userId}::uuid,'SUCCEEDED',${requestId},${version},
          ${JSON.stringify({ provider: input.provider, enabled: input.enabled, serviceVersion: version })}::jsonb,${now})`;
      return this.idempotency.success(project(rows[0]!));
    });
  }
}
@Controller('admin/review-services/ocr')
export class V81OcrGovernanceController {
  constructor(private readonly service: V81OcrGovernanceService) {}
  @Get() @Header('Cache-Control', 'no-store') @AllowSystemModes('NORMAL', 'MAINTENANCE') @OperationPolicy('getV81OcrService')
  status(@CurrentPrincipal() p: AuthenticatedPrincipal) { return this.service.status(p); }
  @Get('revisions') @Header('Cache-Control', 'no-store') @AllowSystemModes('NORMAL', 'MAINTENANCE') @OperationPolicy('listV81OcrServiceRevisions')
  history(@CurrentPrincipal() p: AuthenticatedPrincipal, @Query() q: OcrServiceHistoryQuery) { return this.service.history(p, q); }
  @Post('revisions') @AllowSystemModes('NORMAL', 'MAINTENANCE') @OperationPolicy('saveV81OcrService')
  save(@CurrentPrincipal() p: AuthenticatedPrincipal, @Body() b: OcrServiceInput, @Req() r: FoundationRequest, @Headers('idempotency-key') k?: string) {
    return this.service.save(p, b, r.requestId, k);
  }
}
