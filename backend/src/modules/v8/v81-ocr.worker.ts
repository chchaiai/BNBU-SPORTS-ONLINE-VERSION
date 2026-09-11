import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/database/prisma.service.js';
import { RUNTIME_CONFIG } from '../../common/config/runtime-config.module.js';
import type { RuntimeConfig } from '../../common/config/environment.js';
import { OBJECT_STORAGE_PORT, type ObjectStoragePort } from '../../common/object-storage/object-storage.port.js';
import { Clock } from '../../common/time/clock.js';
import { TencentOcrProvider } from './tencent-ocr-provider.js';
import type { OcrSourcePage } from './ocr-multipart.js';
import type { OcrTableSource } from './domain/ocr-table-source.js';
import { appendV81SystemEvent } from './v81-system-event.js';
import { currentOcrService } from './v81-ocr-service-config.js';
type Job = { id: string; batch_id: string; organization_id: string; page_id: string; actor_id: string;
  expected_attempt: number; version: number; lease_owner: string; lease_until: Date; request_id: string; status: string };
const safeErrors = new Set(['OCR_PROVIDER_NOT_CONFIGURED', 'OCR_PROVIDER_IMAGE_FORMAT_UNSUPPORTED', 'OCR_PROVIDER_IMAGE_SIZE_LIMIT', 'OCR_PROVIDER_IMAGE_INVALID',
  'OCR_PROVIDER_PERMISSION_DENIED', 'OCR_PROVIDER_RATE_LIMITED', 'OCR_PROVIDER_QUOTA_EXCEEDED',
  'OCR_SOURCE_DIGEST_MISMATCH', 'OCR_SOURCE_SIZE_MISMATCH', 'OCR_PROVIDER_TIMEOUT', 'OCR_PROVIDER_UNAVAILABLE',
  'OCR_PROVIDER_RESPONSE_INVALID', 'OCR_NO_TABLE_DETECTED', 'OCR_EMPTY_TABLE', 'OCR_PROVIDER_RESPONSE_LIMIT', 'OCR_PROVIDER_REJECTED']);
@Injectable()
export class V81OcrWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly logger = new Logger(V81OcrWorker.name);
  constructor(private readonly prisma: PrismaService, @Inject(RUNTIME_CONFIG) private readonly config: RuntimeConfig,
    private readonly clock: Clock, private readonly provider: TencentOcrProvider,
    @Inject(OBJECT_STORAGE_PORT) private readonly storage: ObjectStoragePort) {}
  onApplicationBootstrap() {
    if (this.config.ocr?.provider !== 'TENCENT_TABLE_V3' || !this.config.ocr.workerEnabled) return;
    this.timer = setInterval(() => void this.tick(), 5000); this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  private async tick() {
    if (this.running) return;
    this.running = true;
    try { await this.processOne(); } catch { this.logger.error('OCR execution interrupted; durable task remains available for recovery.'); }
    finally { this.running = false; }
  }
  async processOne(organizationId?: string) {
    if (this.config.ocr?.provider !== 'TENCENT_TABLE_V3' || !this.config.ocr.workerEnabled) return null;
    const now = this.clock.now(), owner = randomUUID(), leaseUntil = new Date(now.getTime() + 120000);
    const job = await this.prisma.$transaction(async tx => {
      const candidates = await tx.$queryRaw<Job[]>`SELECT j.* FROM v81_ocr_jobs j JOIN v81_ocr_batches b ON b.id=j.batch_id
        JOIN class_sections c ON c.id=b.class_section_id JOIN semesters s ON s.id=c.semester_id
        JOIN teacher_profiles t ON t.id=c.teacher_id JOIN users u ON u.id=j.actor_id JOIN system_policies p ON p.organization_id=j.organization_id
        WHERE (j.status='QUEUED' OR (j.status='RUNNING' AND j.lease_until<=${now})) AND p.system_mode='NORMAL'
          AND (${organizationId ?? null}::uuid IS NULL OR j.organization_id=${organizationId ?? null}::uuid)
          AND coalesce((SELECT r.enabled AND r.provider='TENCENT_TABLE_V3' FROM v81_ocr_service_revisions r
            WHERE r.organization_id=j.organization_id ORDER BY r.version DESC LIMIT 1),true)
          AND s.status<>'ARCHIVED' AND u.status='ACTIVE' AND t.user_id=j.actor_id
          AND (c.status IN ('UPCOMING','ACTIVE') OR (c.status='CLOSED' AND b.created_at<=c.closed_at))
        ORDER BY j.created_at,j.id LIMIT 1 FOR UPDATE OF j SKIP LOCKED`;
      const candidate = candidates[0]; if (!candidate) return null;
      const service = await currentOcrService(tx, candidate.organization_id, this.config.ocr);
      if (!service.enabled || service.provider !== 'TENCENT_TABLE_V3') return null;
      const claimed = await tx.$queryRaw<Job[]>`UPDATE v81_ocr_jobs SET status='RUNNING',version=version+1,
        lease_owner=${owner}::uuid,lease_until=${leaseUntil},updated_at=${now} WHERE id=${candidate.id}::uuid RETURNING *`;
      const result = claimed[0]!;
      await tx.$executeRaw`INSERT INTO v81_ocr_execution_services(job_id,job_version,organization_id,service_revision_id,service_version,provider,region,timeout_ms,created_at)
        VALUES(${result.id}::uuid,${result.version},${result.organization_id}::uuid,${service.id}::uuid,${service.version},
          ${service.provider},${service.region},${service.timeoutMs},${now})`;
      await appendV81SystemEvent(tx, { organizationId: result.organization_id, resourceType: 'OCR_JOB', resourceId: result.id,
        eventType: 'CLAIMED', requestId: result.request_id, version: result.version, occurredAt: now, outcome: 'SUCCEEDED', facts: { serviceVersion: service.version } });
      return { ...result, service };
    });
    if (!job) return null;
    const batches = await this.prisma.$queryRaw<{ source_manifest: OcrSourcePage[] }[]>`SELECT source_manifest FROM v81_ocr_batches WHERE id=${job.batch_id}::uuid`;
    const page = batches[0]!.source_manifest.find(item => item.id === job.page_id)!;
    let evidence: OcrTableSource | null = null, errorCode: string | null = null;
    try {
      const stream = await this.storage.getPrivateObject(page.storageKey), parts: Buffer[] = [];
      const digest = createHash('sha256'); let size = 0;
      for await (const chunk of stream) {
        const bytes = Buffer.from(chunk as Uint8Array); size += bytes.length;
        if (size > page.sizeBytes || size > 104857600) throw new Error('OCR_SOURCE_SIZE_MISMATCH');
        digest.update(bytes); parts.push(bytes);
      }
      if (size !== page.sizeBytes) throw new Error('OCR_SOURCE_SIZE_MISMATCH');
      if (digest.digest('hex') !== page.sha256) throw new Error('OCR_SOURCE_DIGEST_MISMATCH');
      if (this.clock.now() >= job.lease_until) return { jobId: job.id, status: 'STALE' };
      const activeService = await currentOcrService(this.prisma, job.organization_id, this.config.ocr);
      if (activeService.version !== job.service.version || !activeService.enabled) return { jobId: job.id, status: 'STALE' };
      evidence = await this.provider.withConfiguration({ provider: 'TENCENT_TABLE_V3', region: job.service.region!, timeoutMs: job.service.timeoutMs })
        .recognize(Buffer.concat(parts), page.mimeType, page.sha256);
    } catch (error) { errorCode = error instanceof Error && safeErrors.has(error.message) ? error.message : 'OCR_EXECUTION_FAILED'; }
    const outcome = evidence ? 'SUCCEEDED' : 'FAILED';
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${job.organization_id}::uuid FOR NO KEY UPDATE`;
      await tx.$queryRaw`SELECT id FROM v81_ocr_batches WHERE id=${job.batch_id}::uuid FOR UPDATE`;
      const rows = await tx.$queryRaw<Job[]>`SELECT * FROM v81_ocr_jobs WHERE id=${job.id}::uuid FOR UPDATE`;
      const current = rows[0]!, finishedAt = this.clock.now();
      const activeService = await currentOcrService(tx, job.organization_id, this.config.ocr);
      if (current.status !== 'RUNNING' || current.lease_owner !== owner || current.version !== job.version || finishedAt >= current.lease_until ||
        activeService.version !== job.service.version || !activeService.enabled ||
        (await tx.systemPolicy.findUnique({ where: { organizationId: job.organization_id } }))?.systemMode !== 'NORMAL')
        return { jobId: job.id, status: 'STALE' };
      const attempt = job.expected_attempt + 1;
      await tx.$executeRaw`INSERT INTO v81_ocr_page_attempts(batch_id,page_id,attempt,source_sha256,provider,outcome,evidence,error_code,request_id,created_at)
        VALUES(${job.batch_id}::uuid,${job.page_id}::uuid,${attempt},${page.sha256},'TENCENT_TABLE_V3',${outcome},
          ${evidence === null ? null : JSON.stringify(evidence)}::jsonb,${errorCode},${job.request_id},${finishedAt})`;
      await tx.$executeRaw`UPDATE v81_ocr_jobs SET status=${outcome},result_attempt=${attempt},version=version+1,updated_at=${finishedAt} WHERE id=${job.id}::uuid`;
      await appendV81SystemEvent(tx, { organizationId: job.organization_id, resourceType: 'OCR_JOB', resourceId: job.id,
        eventType: 'EXECUTION_' + outcome, requestId: job.request_id, version: job.version + 1, occurredAt: finishedAt,
        outcome, reasonCode: errorCode, facts: { attempt, errorCode, serviceVersion: job.service.version } });
      return { jobId: job.id, status: outcome };
    });
  }
}
