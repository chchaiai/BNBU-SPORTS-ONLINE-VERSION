import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';

import type { MediaEvidence, Prisma } from '../../../generated/prisma/client.js';
import { AuditService } from '../../../common/audit/audit.service.js';
import type { MediaConfig, RuntimeConfig } from '../../../common/config/environment.js';
import { RUNTIME_CONFIG } from '../../../common/config/runtime-config.module.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import { ApplicationError } from '../../../common/errors/application-error.js';
import {
  MEDIA_STORAGE_PORT,
  MediaStoragePort,
} from '../../../common/object-storage/media-storage.port.js';
import { OutboxService } from '../../../common/outbox/outbox.service.js';
import { Clock } from '../../../common/time/clock.js';
import { IdGenerator } from '../../../common/time/id-generator.js';
import { MediaValidator, type VerifiedMediaFacts } from './media-validator.js';

interface ClaimedMedia {
  media: MediaEvidence;
  attemptNumber: number;
  requestId: string;
}

@Injectable()
export class MediaProcessingWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly workerId = `media-worker-${process.pid}`;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
    private readonly validator: MediaValidator,
    @Inject(MEDIA_STORAGE_PORT) private readonly storage: MediaStoragePort,
    @Inject(RUNTIME_CONFIG) private readonly runtimeConfig: RuntimeConfig,
  ) {}

  onApplicationBootstrap(): void {
    const config = this.runtimeConfig.media;
    if (!config?.workerEnabled) return;
    this.timer = setInterval(() => void this.tick(), config.workerPollMs);
    this.timer.unref();
    void this.tick();
  }

  onModuleDestroy(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  async processOne(): Promise<boolean> {
    const config = this.configuration();
    const claimed = await this.claim(config);
    if (claimed === null) return false;
    let verified: VerifiedMediaFacts;
    try {
      verified = await this.validator.readAndVerify(
        await this.storage.getPrivateObject(claimed.media.storageKey),
        {
          businessPurpose: claimed.media.businessPurpose,
          mediaType: claimed.media.mediaType,
          mimeType: claimed.media.declaredMimeType,
          fileSizeBytes: Number(claimed.media.declaredFileSizeBytes),
          contentSha256: claimed.media.declaredContentSha256,
          durationSeconds: claimed.media.declaredDurationSeconds,
        },
        config,
      );
      if (
        verified.mimeType !== claimed.media.verifiedMimeType ||
        verified.fileSizeBytes !== Number(claimed.media.verifiedFileSizeBytes) ||
        verified.contentSha256 !== claimed.media.verifiedContentSha256 ||
        verified.durationSeconds !== claimed.media.verifiedDurationSeconds
      ) {
        throw new ApplicationError('MEDIA_INTEGRITY_MISMATCH', 422);
      }
    } catch (error: unknown) {
      const code =
        error instanceof ApplicationError
          ? error.code === 'SYSTEM_SERVICE_UNAVAILABLE'
            ? 'MEDIA_DEPENDENCY_UNAVAILABLE'
            : error.code
          : 'MEDIA_PROCESSING_FAILED';
      const terminal =
        error instanceof ApplicationError &&
        error.code !== 'SYSTEM_SERVICE_UNAVAILABLE' &&
        error.code !== 'MEDIA_OBJECT_NOT_FOUND';
      await this.failAttempt(claimed, code, terminal);
      return true;
    }
    await this.completeAttempt(claimed, verified);
    return true;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.processOne();
    } catch {
      // The next database-driven poll retries safely. No signed URL or object detail is logged.
    } finally {
      this.running = false;
    }
  }

  private async claim(config: MediaConfig): Promise<ClaimedMedia | null> {
    return this.prisma.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<{ id: string }[]>`
        SELECT id
          FROM media_evidence
         WHERE upload_status IN ('BOUND', 'PROCESSING')
         ORDER BY CASE upload_status WHEN 'BOUND' THEN 0 ELSE 1 END, updated_at ASC, id ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1
      `;
      const candidate = rows[0];
      if (candidate === undefined) return null;
      let media = await transaction.mediaEvidence.findUniqueOrThrow({
        where: { id: candidate.id },
      });
      const requestId = `media-worker:${this.idGenerator.next()}`;
      if (media.uploadStatus === 'BOUND') {
        const now = this.clock.now();
        media = await transaction.mediaEvidence.update({
          where: { id: media.id, version: media.version, uploadStatus: 'BOUND' },
          data: {
            uploadStatus: 'PROCESSING',
            processingStartedAt: now,
            updatedAt: now,
            version: { increment: 1 },
          },
        });
        await this.appendStatusEvent(transaction, media, 'PROCESSING_STARTED', 'BOUND', requestId);
        await this.audit.append(transaction, {
          organizationId: media.organizationId,
          actorUserId: null,
          actorRoleSnapshot: null,
          permissionId: 'MEDIA-PROCESSING-WORKER',
          actionType: 'MEDIA_PROCESSING_CHANGED',
          targetType: 'MEDIA_EVIDENCE',
          targetId: media.id,
          requestId,
          outcome: 'SUCCEEDED',
          safeMetadata: {
            sessionId: media.sessionId,
            mediaType: media.mediaType,
            previousStatus: 'BOUND',
            nextStatus: 'PROCESSING',
            resultCode: 'PROCESSING_STARTED',
          },
        });
        await this.appendOutbox(transaction, media, 'MEDIA_PROCESSING_STARTED');
      }
      const aggregate = await transaction.mediaProcessingAttempt.aggregate({
        where: { mediaId: media.id },
        _max: { attemptNumber: true },
      });
      const attemptNumber = (aggregate._max.attemptNumber ?? 0) + 1;
      await transaction.mediaProcessingAttempt.create({
        data: {
          id: this.idGenerator.next(),
          organizationId: media.organizationId,
          mediaId: media.id,
          attemptNumber,
          phase: 'STARTED',
          workerId: this.workerId,
          scannerMode: config.scannerMode,
          occurredAt: this.clock.now(),
        },
      });
      return { media, attemptNumber, requestId };
    });
  }

  private async completeAttempt(
    claimed: ClaimedMedia,
    verified: VerifiedMediaFacts,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.mediaEvidence.findUniqueOrThrow({
        where: { id: claimed.media.id },
      });
      if (current.uploadStatus !== 'PROCESSING') return;
      await transaction.mediaProcessingAttempt.create({
        data: {
          id: this.idGenerator.next(),
          organizationId: current.organizationId,
          mediaId: current.id,
          attemptNumber: claimed.attemptNumber,
          phase: 'SUCCEEDED',
          workerId: this.workerId,
          scannerMode: this.configuration().scannerMode,
          resultCode: 'AVAILABLE',
          safeMetadata: verified.safeMetadata,
          occurredAt: this.clock.now(),
        },
      });
      const now = this.clock.now();
      const updated = await transaction.mediaEvidence.update({
        where: { id: current.id, version: current.version, uploadStatus: 'PROCESSING' },
        data: {
          uploadStatus: 'AVAILABLE',
          availableAt: now,
          updatedAt: now,
          version: { increment: 1 },
        },
      });
      await this.appendStatusEvent(
        transaction,
        updated,
        'AVAILABLE',
        'PROCESSING',
        claimed.requestId,
      );
      await this.audit.append(transaction, {
        organizationId: updated.organizationId,
        actorUserId: null,
        actorRoleSnapshot: null,
        permissionId: 'MEDIA-PROCESSING-WORKER',
        actionType: 'MEDIA_PROCESSING_CHANGED',
        targetType: 'MEDIA_EVIDENCE',
        targetId: updated.id,
        requestId: claimed.requestId,
        outcome: 'SUCCEEDED',
        safeMetadata: {
          sessionId: updated.sessionId,
          mediaType: updated.mediaType,
          previousStatus: 'PROCESSING',
          nextStatus: 'AVAILABLE',
          resultCode: 'AVAILABLE',
        },
      });
      await this.appendOutbox(transaction, updated, 'MEDIA_AVAILABLE');
    });
  }

  private async failAttempt(
    claimed: ClaimedMedia,
    resultCode: string,
    terminal: boolean,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.mediaEvidence.findUniqueOrThrow({
        where: { id: claimed.media.id },
      });
      await transaction.mediaProcessingAttempt.create({
        data: {
          id: this.idGenerator.next(),
          organizationId: current.organizationId,
          mediaId: current.id,
          attemptNumber: claimed.attemptNumber,
          phase: 'FAILED',
          workerId: this.workerId,
          scannerMode: this.configuration().scannerMode,
          resultCode,
          occurredAt: this.clock.now(),
        },
      });
      if (!terminal || current.uploadStatus !== 'PROCESSING') return;
      const now = this.clock.now();
      const updated = await transaction.mediaEvidence.update({
        where: { id: current.id, version: current.version, uploadStatus: 'PROCESSING' },
        data: {
          uploadStatus: 'FAILED',
          failedAt: now,
          failureCode: resultCode,
          updatedAt: now,
          version: { increment: 1 },
        },
      });
      await this.appendStatusEvent(transaction, updated, 'FAILED', 'PROCESSING', claimed.requestId);
      await this.audit.append(transaction, {
        organizationId: updated.organizationId,
        actorUserId: null,
        actorRoleSnapshot: null,
        permissionId: 'MEDIA-PROCESSING-WORKER',
        actionType: 'MEDIA_PROCESSING_CHANGED',
        targetType: 'MEDIA_EVIDENCE',
        targetId: updated.id,
        requestId: claimed.requestId,
        outcome: 'FAILED',
        reasonCode: resultCode,
        safeMetadata: {
          sessionId: updated.sessionId,
          mediaType: updated.mediaType,
          previousStatus: 'PROCESSING',
          nextStatus: 'FAILED',
          resultCode,
        },
      });
      await this.appendOutbox(transaction, updated, 'MEDIA_PROCESSING_FAILED');
    });
  }

  private async appendStatusEvent(
    transaction: Prisma.TransactionClient,
    media: MediaEvidence,
    eventType: string,
    fromStatus: string,
    requestId: string,
  ): Promise<void> {
    await transaction.mediaStatusEvent.create({
      data: {
        id: this.idGenerator.next(),
        organizationId: media.organizationId,
        mediaId: media.id,
        eventVersion: media.version,
        eventType,
        fromStatus,
        toStatus: media.uploadStatus,
        actorType: 'WORKER',
        actorUserId: null,
        requestId,
        occurredAt: this.clock.now(),
      },
    });
  }

  private async appendOutbox(
    transaction: Prisma.TransactionClient,
    media: MediaEvidence,
    eventType: string,
  ): Promise<void> {
    await this.outbox.append(transaction, {
      organizationId: media.organizationId,
      aggregateType: 'MEDIA_EVIDENCE',
      aggregateId: media.id,
      eventType,
      eventVersion: media.version,
      payload: {
        mediaId: media.id,
        sessionId: media.sessionId,
        mediaType: media.mediaType,
        uploadStatus: media.uploadStatus,
      },
    });
  }

  private configuration(): MediaConfig {
    if (this.runtimeConfig.media === null) {
      throw new ApplicationError('SYSTEM_SERVICE_UNAVAILABLE', 503, {
        dependency: 'MEDIA_STORAGE',
      });
    }
    return this.runtimeConfig.media;
  }
}
