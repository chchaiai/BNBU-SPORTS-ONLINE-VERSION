import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/database/prisma.service.js';
import { RUNTIME_CONFIG } from '../../common/config/runtime-config.module.js';
import type { RuntimeConfig } from '../../common/config/environment.js';
import { MEDIA_STORAGE_PORT, type MediaStoragePort } from '../../common/object-storage/media-storage.port.js';
import { AI_REVIEW_PROVIDER, type AiReviewProvider } from './ai-review-provider.js';
import { prepareAiMedia } from './ai-review-media.js';
import { AI_AUTO_POLICY, decideAiReview, parseAiAssessment, recommendAiReview } from './domain/ai-review.js';
import { applyAiDecision } from './v81-ai-decision.js';
import { backfillPendingAiReviews } from './v81-ai-backfill.js';

interface Job { id: string; organization_id: string; record_id: string; material_version: number; attempts: number; policy_version: string }
const safeErrors = new Set(['AI_RESPONSE_INVALID', 'AI_PROVIDER_TIMEOUT', 'AI_PROVIDER_RATE_LIMITED', 'AI_PROVIDER_PERMISSION_DENIED', 'AI_PROVIDER_QUOTA_EXCEEDED', 'AI_PROVIDER_UNAVAILABLE', 'AI_MEDIA_INTEGRITY', 'AI_VIDEO_DECODE_FAILED', 'AI_MEDIA_MISSING']);

@Injectable()
export class V81AiReviewWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly logger = new Logger(V81AiReviewWorker.name);
  constructor(private readonly prisma: PrismaService,
    @Inject(RUNTIME_CONFIG) private readonly config: RuntimeConfig,
    @Inject(AI_REVIEW_PROVIDER) private readonly provider: AiReviewProvider,
    @Inject(MEDIA_STORAGE_PORT) private readonly storage: MediaStoragePort) {}

  onApplicationBootstrap(): void {
    if (!this.provider.enabled) return;
    this.timer = setInterval(() => void this.tick(), 5000); this.timer.unref();
  }
  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }
  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try { await this.processOne(); } catch { this.logger.error('AI_REVIEW_WORKER_INTERRUPTED'); }
    finally { this.running = false; }
  }
  async processOne(): Promise<{ jobId: string; status: string } | null> {
    if (!this.provider.enabled) return null;
    await backfillPendingAiReviews(this.prisma);
    const owner = randomUUID();
    const job = await this.prisma.$transaction(async tx => {
      // A process crash on the last attempt must not leave RUNNING forever.
      await tx.$executeRaw`UPDATE v81_ai_review_jobs SET status='FAILED',error_code='AI_WORKER_LEASE_EXPIRED',updated_at=now(),completed_at=now()
        WHERE status='RUNNING' AND lease_until<=now() AND attempts>=3`;
      const rows = await tx.$queryRaw<Job[]>`SELECT j.* FROM v81_ai_review_jobs j
        JOIN system_policies p ON p.organization_id=j.organization_id
        JOIN v81_record_workflows w ON w.record_id=j.record_id AND w.material_version=j.material_version
        WHERE ((j.status='QUEUED' AND j.next_attempt_at<=now()) OR (j.status='RUNNING' AND j.lease_until<=now()))
        AND j.attempts<3 AND p.system_mode='NORMAL' AND w.stage IN ('PENDING_TEACHER','PENDING_AI','TECHNICAL')
        ORDER BY j.created_at,j.id LIMIT 1 FOR UPDATE OF j SKIP LOCKED`;
      const next = rows[0]; if (!next) return null;
      // Reserve 1 yuan per attempt, including crashes/timeouts. This is deliberately
      // above bounded 21-image moderation plus a 32k-context vision request costs.
      const reserved = await tx.$executeRaw`UPDATE v81_ai_review_budget SET reserved_fen=reserved_fen+100,updated_at=now()
        WHERE id=1 AND reserved_fen+100<=${this.config.aiReview?.budgetFen ?? 500000}`;
      if (!reserved) {
        await tx.$executeRaw`UPDATE v81_ai_review_jobs SET status='FAILED',error_code='AI_BUDGET_LIMIT',completed_at=now(),updated_at=now() WHERE id=${next.id}::uuid`;
        return null;
      }
      await tx.$executeRaw`UPDATE v81_ai_review_jobs SET status='RUNNING',attempts=attempts+1,lease_owner=${owner}::uuid,
        lease_until=now()+interval '4 minutes',updated_at=now(),provider=${this.provider.provider},model=${this.provider.model} WHERE id=${next.id}::uuid`;
      return { ...next, attempts: next.attempts + 1 };
    });
    if (!job) return null;
    try {
      const record = await this.prisma.exerciseRecord.findFirst({ where: { id: job.record_id, organizationId: job.organization_id } });
      const active = await this.prisma.$queryRaw<{ material_version: number }[]>`SELECT material_version FROM v81_record_workflows WHERE record_id=${job.record_id}::uuid`;
      if (!record || active[0]?.material_version !== job.material_version) {
        await this.prisma.$executeRaw`UPDATE v81_ai_review_jobs SET status='SUPERSEDED',updated_at=now(),completed_at=now()
          WHERE id=${job.id}::uuid AND lease_owner=${owner}::uuid AND status='RUNNING'`;
        return { jobId: job.id, status: 'SUPERSEDED' };
      }
      const items = await this.prisma.$queryRaw<{media_id: string}[]>`SELECT media_id FROM v81_material_items WHERE record_id=${job.record_id}::uuid AND material_version=${job.material_version} ORDER BY position`;
      const media = await this.prisma.mediaEvidence.findMany({ where: { id: { in: items.map(item => item.media_id) }, organizationId: job.organization_id, uploadStatus: 'AVAILABLE' } });
      if (!media.length || media.length !== items.length) throw new Error('AI_MEDIA_MISSING');
      const duplicates = await this.prisma.$queryRaw<{ found: boolean }[]>`SELECT EXISTS (
        SELECT 1 FROM v81_material_items current_item JOIN media_evidence current_media ON current_media.id=current_item.media_id
        JOIN media_evidence other_media ON other_media.organization_id=current_media.organization_id AND other_media.verified_content_sha256=current_media.verified_content_sha256
        JOIN v81_material_items other_item ON other_item.media_id=other_media.id
        WHERE current_item.record_id=${job.record_id}::uuid AND current_item.material_version=${job.material_version}
        AND other_item.record_id<>current_item.record_id AND current_media.organization_id=${job.organization_id}::uuid
      ) AS found`;
      const signal = AbortSignal.timeout(180_000);
      const prepared = await prepareAiMedia(this.storage, media, signal);
      const assessment = parseAiAssessment(await this.provider.assess({ sport: record.sportName ?? record.sportType, ...prepared, signal }));
      signal.throwIfAborted();
      const result = recommendAiReview(assessment, duplicates[0]?.found ?? false, prepared.sampledVideo);
      const changed = await this.prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM organizations WHERE id=${job.organization_id}::uuid FOR NO KEY UPDATE`;
        const policy = await tx.systemPolicy.findUnique({where:{organizationId:job.organization_id}});
        if (policy?.systemMode !== 'NORMAL') throw new Error('AI_SYSTEM_PAUSED');
        const updated = await tx.$executeRaw`UPDATE v81_ai_review_jobs j SET status='SUCCEEDED',recommendation=${result.recommendation},
        flags=${JSON.stringify(result.flags)}::jsonb,assessment=${JSON.stringify(assessment)}::jsonb,error_code=NULL,completed_at=now(),updated_at=now()
        WHERE j.id=${job.id}::uuid AND j.lease_owner=${owner}::uuid AND j.status='RUNNING' AND j.lease_until>now()
        AND EXISTS(SELECT 1 FROM v81_record_workflows w WHERE w.record_id=j.record_id AND w.material_version=j.material_version)`;
        const decision = decideAiReview(assessment, duplicates[0]?.found ?? false, prepared.sampledVideo);
        if (updated && decision && job.policy_version === AI_AUTO_POLICY) await applyAiDecision(tx, {
          organizationId:job.organization_id,recordId:job.record_id,materialVersion:job.material_version,
          jobId:job.id,decision,policyVersion:job.policy_version,
        });
        return updated;
      });
      if (!changed) {
        await this.prisma.$executeRaw`UPDATE v81_ai_review_jobs SET status='SUPERSEDED',updated_at=now(),completed_at=now()
          WHERE id=${job.id}::uuid AND lease_owner=${owner}::uuid AND status='RUNNING' AND lease_until>now()`;
      }
      return { jobId: job.id, status: changed ? 'SUCCEEDED' : 'SUPERSEDED' };
    } catch (error) {
      const errorCode = error instanceof Error && safeErrors.has(error.message) ? error.message : 'AI_EXECUTION_FAILED';
      const status = job.attempts >= 3 ? 'FAILED' : 'QUEUED';
      await this.prisma.$executeRaw`UPDATE v81_ai_review_jobs SET status=${status},error_code=${errorCode},
        next_attempt_at=now()+${job.attempts * 30}*interval '1 second',updated_at=now(),completed_at=CASE WHEN ${status}='FAILED' THEN now() ELSE NULL END
        WHERE id=${job.id}::uuid AND lease_owner=${owner}::uuid AND status='RUNNING' AND lease_until>now()`;
      return { jobId: job.id, status };
    }
  }
}
