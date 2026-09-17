import {processedVideoKey} from './video-normalizer.js';
import {isHistoricalSession} from '../../v8/v81-history-backfill.js';
import { Inject, Injectable } from '@nestjs/common';
import { exerciseUploadWindow } from '../../v8/v81-upload-window.js';

import { Prisma, type MediaEvidence } from '../../../generated/prisma/client.js';
import { AuditService } from '../../../common/audit/audit.service.js';
import type { MediaConfig, RuntimeConfig } from '../../../common/config/environment.js';
import { RUNTIME_CONFIG } from '../../../common/config/runtime-config.module.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import { ApplicationError } from '../../../common/errors/application-error.js';
import type { AuthenticatedPrincipal } from '../../../common/http/request-context.js';
import {
  IdempotencyService,
  type IdempotentFailure,
  type IdempotentStage,
} from '../../../common/idempotency/idempotency.service.js';
import {
  MEDIA_STORAGE_PORT,
  MediaStoragePort,
} from '../../../common/object-storage/media-storage.port.js';
import { OutboxService } from '../../../common/outbox/outbox.service.js';
import { Clock } from '../../../common/time/clock.js';
import { IdGenerator } from '../../../common/time/id-generator.js';
import type {
  BindMediaRequestDto,
  ConfirmMediaUploadRequestDto,
  InitiateMediaUploadRequestDto,
  MediaAccessRequestDto,
} from '../interface/http/media.dto.js';
import { mediaProjection, type MediaEvidenceProjection } from './media-projection.js';
import {
  MediaValidator,
  type DeclaredMediaFacts,
  type VerifiedMediaFacts,
} from './media-validator.js';

interface RequestContext {
  requestId: string;
  idempotencyKey: string | undefined;
}

interface InitiationStage {
  mediaId: string;
  uploadSessionId: string;
  storageKey: string;
  declaredMimeType: string;
  declaredFileSizeBytes: number;
  capabilityExpiresAt: Date;
}

interface ConfirmationStage {
  uploadSessionId: string;
  mediaId: string;
  capabilityExpiresAt: Date;
}

type ResolvedInitiationTarget =
  | {
      kind: 'TARGET';
      studentId: string;
      sessionId: string | null;
      enrollmentId: string | null;
    }
  | { kind: 'FAILURE'; failure: IdempotentFailure };

type AuthorizedMedia = Prisma.MediaEvidenceGetPayload<{
  include: {
    ownerStudent: { select: { userId: true } };
    recordAssociation: { select: { recordId: true } };
    session: {
      include: { classSection: { include: { teacher: { select: { userId: true } } } } };
    };
    exemptionAssociations: {
      include: {
        application: {
          include: {
            classSection: { include: { teacher: { select: { userId: true } } } };
          };
        };
      };
    };
  };
}>;

export interface MediaUploadSessionProjection {
  uploadSessionId: string;
  mediaId: string;
  uploadUrl: string;
  uploadMethod: 'PUT';
  requiredHeaders: Record<string, string>;
  expiresAt: string;
}

export interface MediaAccessProjection {
  mediaId: string;
  accessUrl: string;
  expiresAt: string;
}

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
    private readonly validator: MediaValidator,
    @Inject(MEDIA_STORAGE_PORT) private readonly storage: MediaStoragePort,
    @Inject(RUNTIME_CONFIG) private readonly runtimeConfig: RuntimeConfig,
  ) {}

  async initiate(
    principal: AuthenticatedPrincipal,
    input: InitiateMediaUploadRequestDto,
    context: RequestContext,
  ): Promise<MediaUploadSessionProjection> {
    const config = this.configuration();
    const declared = this.declaredFacts(input);
    this.validator.validateDeclaration(declared, config);

    let reservation;
    try {
      reservation = await this.idempotency.reserveStage<
        InitiationStage,
        MediaUploadSessionProjection
      >(
        {
          organizationId: principal.organizationId,
          principalId: principal.userId,
          authSessionId: principal.sessionId,
          operationId: 'initiateMediaUpload',
          scope: this.targetScope(input),
          key: context.idempotencyKey,
          request: input,
          requestId: context.requestId,
        },
        async (transaction, stageContext) => {
          if (stageContext.isRecovery) {
            const recovered = await transaction.mediaEvidence.findFirst({
              where: {
                id: stageContext.resourceId ?? '',
                organizationId: principal.organizationId,
                initiatedByUserId: principal.userId,
              },
              include: { uploadSession: true },
            });
            if (recovered?.uploadSession === null || recovered?.uploadSession === undefined) {
              return this.idempotency.failure(
                new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
                  invariant: 'MEDIA_INITIATION_RECOVERY_REQUIRED',
                }),
              );
            }
            return this.idempotency.stage(
              {
                mediaId: recovered.id,
                uploadSessionId: recovered.uploadSession.id,
                storageKey: recovered.storageKey,
                declaredMimeType: recovered.declaredMimeType,
                declaredFileSizeBytes: Number(recovered.declaredFileSizeBytes),
                capabilityExpiresAt: recovered.uploadSession.capabilityExpiresAt,
              },
              { resourceType: 'MEDIA_EVIDENCE', resourceId: recovered.id },
            );
          }
          return this.createInitiation(transaction, principal, input, context.requestId, config);
        },
      );
    } catch (error: unknown) {
      if (this.isQuotaConstraint(error)) {
        throw new ApplicationError('MEDIA_COUNT_LIMIT_EXCEEDED', 422);
      }
      throw error;
    }
    if (reservation.kind === 'REPLAY') return reservation.value;

    const transport = await this.storage.createUploadUrl({
      storageKey: reservation.value.storageKey,
      contentType: reservation.value.declaredMimeType,
      contentLength: reservation.value.declaredFileSizeBytes,
      expiresInSeconds: Math.max(1, Math.min(config.uploadUrlTtlSeconds,
        Math.floor((reservation.value.capabilityExpiresAt.getTime() - this.clock.now().getTime()) / 1000))),
    });
    const response: MediaUploadSessionProjection = {
      uploadSessionId: reservation.value.uploadSessionId,
      mediaId: reservation.value.mediaId,
      uploadUrl: transport.url,
      uploadMethod: transport.method,
      requiredHeaders: transport.requiredHeaders,
      expiresAt: reservation.value.capabilityExpiresAt.toISOString(),
    };
    return this.idempotency.completeStage(reservation, () =>
      Promise.resolve(
        this.idempotency.success(response, {
          principalId: principal.userId,
          authSessionId: principal.sessionId,
          resourceType: 'MEDIA_EVIDENCE',
          resourceId: reservation.value.mediaId,
        }),
      ),
    );
  }

  async confirm(
    principal: AuthenticatedPrincipal,
    uploadSessionId: string,
    input: ConfirmMediaUploadRequestDto,
    context: RequestContext,
  ): Promise<MediaEvidenceProjection> {
    const config = this.configuration();
    const reservation = await this.idempotency.reserveStage<
      ConfirmationStage,
      MediaEvidenceProjection
    >(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'confirmMediaUpload',
        scope: `upload-session:${uploadSessionId}`,
        key: context.idempotencyKey,
        request: input,
        requestId: context.requestId,
      },
      async (transaction) => {
        const upload = await transaction.mediaUploadSession.findFirst({
          where: { id: uploadSessionId, organizationId: principal.organizationId },
          include: { media: { include: { ownerStudent: { select: { userId: true } } } } },
        });
        if (upload?.media.ownerStudent.userId !== principal.userId) {
          return this.idempotency.failure(new ApplicationError('MEDIA_OBJECT_NOT_FOUND', 404));
        }
        if (upload.status !== 'ACTIVE' || upload.media.uploadStatus !== 'PENDING_UPLOAD') {
          return this.idempotency.failure(
            new ApplicationError('MEDIA_TRANSITION_NOT_ALLOWED', 409),
          );
        }
        return this.idempotency.stage(
          {
            uploadSessionId: upload.id,
            mediaId: upload.mediaId,
            capabilityExpiresAt: upload.capabilityExpiresAt,
          },
          { resourceType: 'MEDIA_UPLOAD_SESSION', resourceId: upload.id },
        );
      },
    );
    if (reservation.kind === 'REPLAY') return reservation.value;

    const media = await this.prisma.mediaEvidence.findUniqueOrThrow({
      where: { id: reservation.value.mediaId },
    });
    // Signed PUT expiry limits new object writes, not confirmation of bytes already stored.
    let verified: VerifiedMediaFacts;
    let observedEntityTag: string | null = null;
    try {
      const metadata = await this.storage.headPrivateObject(media.storageKey);
      observedEntityTag = metadata.entityTag;
      const clientTag = this.normalizeEntityTag(input.etag);
      if (
        metadata.contentLength !== Number(media.declaredFileSizeBytes) ||
        (metadata.contentType !== null &&
          metadata.contentType.toLowerCase() !== media.declaredMimeType.toLowerCase()) ||
        (observedEntityTag !== null && clientTag !== observedEntityTag)
      ) {
        throw new ApplicationError('MEDIA_INTEGRITY_MISMATCH', 422);
      }
      verified = await (media.mediaType === 'VIDEO' ? this.validator.readRawVideo.bind(this.validator) : this.validator.readAndVerify.bind(this.validator))(
        await this.storage.getPrivateObject(media.storageKey),
        this.declaredFactsFromMedia(media),
        config,
      );
    } catch (error: unknown) {
      if (error instanceof ApplicationError && error.code === 'MEDIA_OBJECT_NOT_FOUND' &&
          reservation.value.capabilityExpiresAt <= this.clock.now()) {
        return this.completeFailedConfirmation(reservation,principal,media,context.requestId,
          new ApplicationError('MEDIA_UPLOAD_SESSION_EXPIRED',410));
      }
      if (error instanceof ApplicationError && this.isDeterministicIntegrityFailure(error)) {
        return this.completeFailedConfirmation(
          reservation,
          principal,
          media,
          context.requestId,
          error,
        );
      }
      if (error instanceof ApplicationError) {
        return this.idempotency.completeStage(reservation, () =>
          Promise.resolve(
            this.idempotency.failure(error, {
              principalId: principal.userId,
              authSessionId: principal.sessionId,
            }),
          ),
        );
      }
      throw error;
    }

    return this.idempotency.completeStage(reservation, async (transaction) => {
      const now = this.clock.now();
      if (media.businessPurpose === 'EXERCISE_RECORD' && media.sessionId) {
        await exerciseUploadWindow(transaction, media.sessionId, now, media.id);
      }
      const updated = await transaction.mediaEvidence.update({
        where: { id: media.id, version: media.version, uploadStatus: 'PENDING_UPLOAD' },
        data: {
          verifiedMimeType: verified.mimeType,
          verifiedFileSizeBytes: BigInt(verified.fileSizeBytes),
          verifiedContentSha256: verified.contentSha256,
          verifiedDurationSeconds: verified.durationSeconds,
          safeMetadata: verified.safeMetadata,
          uploadStatus: 'UPLOADED',
          uploadedAt: now,
          updatedAt: now,
          version: { increment: 1 },
        },
      });
      await transaction.mediaUploadSession.update({
        where: { id: uploadSessionId, status: 'ACTIVE' },
        data: {
          status: 'CONFIRMED',
          clientEntityTag: this.normalizeEntityTag(input.etag),
          observedEntityTag,
          observedFileSizeBytes: BigInt(verified.fileSizeBytes),
          confirmedAt: now,
          updatedAt: now,
          version: { increment: 1 },
        },
      });
      await this.appendStatusEvent(transaction, updated, 'CONFIRMED', 'PENDING_UPLOAD', {
        actorType: 'USER',
        actorUserId: principal.userId,
        requestId: context.requestId,
      });
      await this.audit.append(transaction, {
        organizationId: updated.organizationId,
        actorUserId: principal.userId,
        actorRoleSnapshot: principal.role,
        permissionId: 'MEDIA-UPLOAD-CONFIRM',
        actionType: 'MEDIA_UPLOAD_CONFIRMED',
        targetType: 'MEDIA_EVIDENCE',
        targetId: updated.id,
        requestId: context.requestId,
        outcome: 'SUCCEEDED',
        safeMetadata: {
          sessionId: updated.sessionId,
          enrollmentId: updated.enrollmentId,
          businessPurpose: updated.businessPurpose,
          mediaType: updated.mediaType,
          previousStatus: 'PENDING_UPLOAD',
          nextStatus: 'UPLOADED',
        },
      });
      await this.appendOutbox(transaction, updated, 'MEDIA_UPLOAD_CONFIRMED');
      if (updated.businessPurpose === 'EXEMPTION_APPLICATION') {
        // The enrollment was authorized when the upload was created and is immutable.
        // Certification uploads have no exercise session to bind in a separate request.
        const bound = await transaction.mediaEvidence.update({
          where: { id: updated.id, version: updated.version, uploadStatus: 'UPLOADED' },
          data: { uploadStatus: 'BOUND', boundAt: now, updatedAt: now, version: { increment: 1 } },
        });
        await this.appendStatusEvent(transaction, bound, 'BOUND', 'UPLOADED', {
          actorType: 'USER', actorUserId: principal.userId, requestId: context.requestId,
        });
        await this.appendOutbox(transaction, bound, 'MEDIA_BOUND');
        return this.idempotency.success(mediaProjection(bound), {
          principalId: principal.userId, authSessionId: principal.sessionId,
          resourceType: 'MEDIA_EVIDENCE', resourceId: bound.id,
        });
      }
      return this.idempotency.success(mediaProjection(updated), {
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        resourceType: 'MEDIA_EVIDENCE',
        resourceId: updated.id,
      });
    });
  }

  async get(principal: AuthenticatedPrincipal, mediaId: string): Promise<MediaEvidenceProjection> {
    const media = await this.loadAuthorizedMedia(principal, mediaId);
    return mediaProjection(media);
  }

  async bind(
    principal: AuthenticatedPrincipal,
    mediaId: string,
    input: BindMediaRequestDto,
    context: RequestContext,
  ): Promise<MediaEvidenceProjection> {
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'bindMediaEvidence',
        scope: `media:${mediaId}`,
        key: context.idempotencyKey,
        request: input,
        requestId: context.requestId,
      },
      async (transaction) => {
        await this.lockExerciseSession(transaction, input.sessionId);
        const media = await transaction.mediaEvidence.findFirst({
          where: { id: mediaId, organizationId: principal.organizationId },
          include: {
            ownerStudent: { select: { userId: true } },
            session: {
              include: {
                enrollment: { select: { status: true } },
                exerciseRecord: { select: { status: true } },
              },
            },
          },
        });
        if (media?.ownerStudent.userId !== principal.userId) {
          return this.idempotency.failure(new ApplicationError('MEDIA_OBJECT_NOT_FOUND', 404));
        }
        if (
          media.businessPurpose !== 'EXERCISE_RECORD' ||
          media.sessionId !== input.sessionId ||
          media.session === null
        ) {
          return this.idempotency.failure(new ApplicationError('MEDIA_BIND_TARGET_INVALID', 422));
        }
        if (media.version !== input.expectedVersion) {
          return this.idempotency.failure(new ApplicationError('CONFLICT_VERSION_MISMATCH', 409));
        }
        if (media.uploadStatus !== 'UPLOADED') {
          return this.idempotency.failure(
            new ApplicationError('MEDIA_TRANSITION_NOT_ALLOWED', 409),
          );
        }
        const now = this.clock.now();
        await exerciseUploadWindow(transaction, media.sessionId, now, media.id);
        const updated = await transaction.mediaEvidence.update({
          where: { id: media.id, version: input.expectedVersion, uploadStatus: 'UPLOADED' },
          data: {
            uploadStatus: 'BOUND',
            boundAt: now,
            updatedAt: now,
            version: { increment: 1 },
          },
        });
        await this.appendStatusEvent(transaction, updated, 'BOUND', 'UPLOADED', {
          actorType: 'USER',
          actorUserId: principal.userId,
          requestId: context.requestId,
        });
        await this.audit.append(transaction, {
          organizationId: updated.organizationId,
          actorUserId: principal.userId,
          actorRoleSnapshot: principal.role,
          permissionId: 'MEDIA-BIND',
          actionType: 'MEDIA_BOUND',
          targetType: 'MEDIA_EVIDENCE',
          targetId: updated.id,
          requestId: context.requestId,
          outcome: 'SUCCEEDED',
          safeMetadata: {
            sessionId: updated.sessionId,
            enrollmentId: updated.enrollmentId,
            businessPurpose: updated.businessPurpose,
            mediaType: updated.mediaType,
            previousStatus: 'UPLOADED',
            nextStatus: 'BOUND',
          },
        });
        await this.appendOutbox(transaction, updated, 'MEDIA_BOUND');
        return this.idempotency.success(mediaProjection(updated), {
          principalId: principal.userId,
          authSessionId: principal.sessionId,
          resourceType: 'MEDIA_EVIDENCE',
          resourceId: updated.id,
        });
      },
    );
  }

  async createAccessUrl(
    principal: AuthenticatedPrincipal,
    mediaId: string,
    input: MediaAccessRequestDto,
    context: RequestContext,
  ): Promise<MediaAccessProjection> {
    const config = this.configuration();
    const media = await this.loadAuthorizedMedia(principal, mediaId);
    const isOwner = principal.role === 'STUDENT' && media.ownerStudent.userId === principal.userId;
    const acceptedVersion = principal.role === 'TEACHER'
      ? await this.prisma.$queryRaw<{record_id:string}[]>`SELECT p.record_id FROM v81_material_items p
          JOIN exercise_records r ON r.id=p.record_id JOIN class_sections c ON c.id=r.class_section_id
          JOIN teacher_profiles t ON t.id=c.teacher_id WHERE p.media_id=${mediaId}::uuid
          AND r.organization_id=${principal.organizationId}::uuid AND t.user_id=${principal.userId}::uuid LIMIT 1`
      : [];
    const isResponsibleReviewTeacher =
      principal.role === 'TEACHER' &&
      media.session?.classSection.teacher.userId === principal.userId &&
      (media.recordAssociation !== null || acceptedVersion.length > 0);
    const isResponsibleExemptionTeacher =
      principal.role === 'TEACHER' &&
      media.exemptionAssociations.some(
        ({ application }) =>
          application.classSection.teacher.userId === principal.userId &&
          application.status !== 'DRAFT',
      );
    if (
      (!isOwner && !isResponsibleReviewTeacher && !isResponsibleExemptionTeacher) ||
      media.uploadStatus !== 'AVAILABLE' ||
      media.verifiedMimeType === null
    ) {
      throw new ApplicationError('MEDIA_ACCESS_DENIED', 403);
    }
    const expiresAt = new Date(this.clock.now().getTime() + config.accessUrlTtlSeconds * 1000);
    const accessUrl = await this.storage.createAccessUrl({
      storageKey: media.mediaType === 'VIDEO' && (media.safeMetadata as Record<string, unknown>)?.normalized === 1 ? processedVideoKey(media.storageKey) : media.storageKey,
      contentType: media.verifiedMimeType,
      expiresInSeconds: config.accessUrlTtlSeconds,
    });
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'createMediaAccessUrl',
        scope: `media:${mediaId}`,
        key: context.idempotencyKey,
        request: input,
        requestId: context.requestId,
      },
      async (transaction) => {
        await this.audit.append(transaction, {
          organizationId: media.organizationId,
          actorUserId: principal.userId,
          actorRoleSnapshot: principal.role,
          permissionId: 'MEDIA-ACCESS-URL',
          actionType: 'MEDIA_ACCESSED',
          targetType: 'MEDIA_EVIDENCE',
          targetId: media.id,
          requestId: context.requestId,
          outcome: 'SUCCEEDED',
          safeMetadata: {
            sessionId: media.sessionId,
            enrollmentId: media.enrollmentId,
            businessPurpose: media.businessPurpose,
            mediaType: media.mediaType,
            purpose: input.purpose,
          },
        });
        return this.idempotency.success(
          { mediaId: media.id, accessUrl, expiresAt: expiresAt.toISOString() },
          {
            principalId: principal.userId,
            authSessionId: principal.sessionId,
            resourceType: 'MEDIA_EVIDENCE',
            resourceId: media.id,
          },
        );
      },
    );
  }

  private async createInitiation(
    transaction: Prisma.TransactionClient,
    principal: AuthenticatedPrincipal,
    input: InitiateMediaUploadRequestDto,
    requestId: string,
    config: MediaConfig,
  ): Promise<IdempotentStage<InitiationStage> | IdempotentFailure> {
    const target = await this.resolveInitiationTarget(transaction, principal, input);
    if (target.kind === 'FAILURE') return target.failure;
    const now = this.clock.now();
    const window = target.sessionId === null ? null : await exerciseUploadWindow(transaction, target.sessionId, now);
    // A lost/denied object PUT must not reserve a second slot for the same bytes.
    // Only renew an unconfirmed, unfrozen upload owned by this student/session.
    if (input.declaredContentSha256) {
      const pending = await transaction.mediaEvidence.findFirst({
        where: {
          organizationId: principal.organizationId,
          initiatedByUserId: principal.userId,
          ownerStudentId: target.studentId,
          sessionId: target.sessionId,
          enrollmentId: target.enrollmentId,
          businessPurpose: input.businessPurpose,
          mediaType: input.mediaType,
          captureSource: input.captureSource,
          declaredMimeType: input.mimeType,
          declaredFileSizeBytes: BigInt(input.fileSizeBytes),
          declaredContentSha256: input.declaredContentSha256,
          declaredDurationSeconds: input.durationSeconds ?? null,
          uploadStatus: 'PENDING_UPLOAD',
          ...(window?.frozenMediaIds.length ? { id: { notIn: window.frozenMediaIds } } : {}),
          uploadSession: { is: { status: 'ACTIVE' } },
        },
        include: { uploadSession: true },
        orderBy: { createdAt: 'asc' },
      });
      if (pending?.uploadSession) {
        const capabilityExpiresAt = pending.uploadSession.capabilityExpiresAt > now ? pending.uploadSession.capabilityExpiresAt : new Date(now.getTime() + config.uploadUrlTtlSeconds * 1000);
        if (capabilityExpiresAt > pending.uploadSession.capabilityExpiresAt)
          await transaction.mediaUploadSession.update({where:{id:pending.uploadSession.id},data:{capabilityExpiresAt,updatedAt:now,version:{increment:1}}});
        return this.idempotency.stage({
          mediaId: pending.id,
          uploadSessionId: pending.uploadSession.id,
          storageKey: pending.storageKey,
          declaredMimeType: pending.declaredMimeType,
          declaredFileSizeBytes: Number(pending.declaredFileSizeBytes),
          capabilityExpiresAt,
        }, { resourceType: 'MEDIA_EVIDENCE', resourceId: pending.id });
      }
    }
    await this.expirePendingUploads(transaction,target,input.mediaType,principal.userId,requestId,now);
    const activeCount = await transaction.mediaEvidence.count({
      where: {
        ...(window?.frozenMediaIds.length ? { id: { notIn: window.frozenMediaIds } } : {}),
        ...(target.sessionId === null
          ? {
              enrollmentId: target.enrollmentId,
              businessPurpose: 'EXEMPTION_APPLICATION',
            }
          : {
              sessionId: target.sessionId,
              businessPurpose: 'EXERCISE_RECORD',
              mediaType: input.mediaType,
            }),
        uploadStatus: { in: ['PENDING_UPLOAD', 'UPLOADED', 'BOUND', 'PROCESSING', 'AVAILABLE'] },
      },
    });
    const allowedCount = target.sessionId === null ? 20 : input.mediaType === 'IMAGE' ? 6 : 1;
    if (activeCount >= allowedCount) {
      return this.idempotency.failure(new ApplicationError('MEDIA_COUNT_LIMIT_EXCEEDED', 422));
    }
    const mediaId = this.idGenerator.next();
    const uploadSessionId = this.idGenerator.next();
    const capabilityExpiresAt = new Date(now.getTime() + config.uploadUrlTtlSeconds * 1000);
    const storageKey = `media/${principal.organizationId}/${mediaId}/${input.mediaType.toLowerCase()}`;
    const media = await transaction.mediaEvidence.create({
      data: {
        id: mediaId,
        organizationId: principal.organizationId,
        ownerStudentId: target.studentId,
        sessionId: target.sessionId,
        enrollmentId: target.enrollmentId,
        initiatedByUserId: principal.userId,
        businessPurpose: input.businessPurpose,
        mediaType: input.mediaType,
        captureSource: input.captureSource,
        declaredMimeType: input.mimeType.toLowerCase(),
        declaredFileSizeBytes: BigInt(input.fileSizeBytes),
        declaredContentSha256: input.declaredContentSha256 ?? null,
        declaredDurationSeconds: input.durationSeconds ?? null,
        uploadStatus: 'PENDING_UPLOAD',
        storageKey,
        createdAt: now,
        updatedAt: now,
        version: 1,
      },
    });
    await transaction.mediaUploadSession.create({
      data: {
        id: uploadSessionId,
        organizationId: principal.organizationId,
        mediaId,
        status: 'ACTIVE',
        capabilityExpiresAt,
        createdAt: now,
        updatedAt: now,
        version: 1,
      },
    });
    await this.appendStatusEvent(transaction, media, 'INITIATED', null, {
      actorType: 'USER',
      actorUserId: principal.userId,
      requestId,
    });
    await this.audit.append(transaction, {
      organizationId: media.organizationId,
      actorUserId: principal.userId,
      actorRoleSnapshot: principal.role,
      permissionId: 'MEDIA-UPLOAD-INITIATE',
      actionType: 'MEDIA_UPLOAD_INITIATED',
      targetType: 'MEDIA_EVIDENCE',
      targetId: media.id,
      requestId,
      outcome: 'SUCCEEDED',
      safeMetadata: {
        sessionId: media.sessionId,
        enrollmentId: media.enrollmentId,
        businessPurpose: media.businessPurpose,
        mediaType: media.mediaType,
        nextStatus: 'PENDING_UPLOAD',
      },
    });
    await this.appendOutbox(transaction, media, 'MEDIA_UPLOAD_INITIATED');
    return this.idempotency.stage(
      {
        mediaId,
        uploadSessionId,
        storageKey,
        declaredMimeType: media.declaredMimeType,
        declaredFileSizeBytes: input.fileSizeBytes,
        capabilityExpiresAt,
      },
      { resourceType: 'MEDIA_EVIDENCE', resourceId: mediaId },
    );
  }

  private async expirePendingUploads(
    transaction: Prisma.TransactionClient,
    target: Extract<ResolvedInitiationTarget, { kind: 'TARGET' }>,
    mediaType: string,
    actorUserId: string,
    requestId: string,
    now: Date,
  ): Promise<void> {
    const expired = await transaction.mediaEvidence.findMany({
      where: {
        ...(target.sessionId === null
          ? {
              enrollmentId: target.enrollmentId,
              businessPurpose: 'EXEMPTION_APPLICATION',
            }
          : {
              sessionId: target.sessionId,
              businessPurpose: 'EXERCISE_RECORD',
              mediaType,
            }),
        uploadStatus: 'PENDING_UPLOAD',
        uploadSession: {
          is: { status: 'ACTIVE', capabilityExpiresAt: { lte: now } },
        },
      },
    });
    for (const media of expired) {
      // Never expire an uploaded object merely because its temporary PUT capability ended.
      // An unavailable storage provider cannot prove absence and must not discard the reservation.
      try { await this.storage.headPrivateObject(media.storageKey); continue; }
      catch (error) {
        if (!(error instanceof ApplicationError) || error.code !== 'MEDIA_OBJECT_NOT_FOUND') throw error;
      }
      const updated = await transaction.mediaEvidence.update({
        where: { id: media.id, version: media.version, uploadStatus: 'PENDING_UPLOAD' },
        data: {
          uploadStatus: 'FAILED',
          failedAt: now,
          failureCode: 'MEDIA_UPLOAD_SESSION_EXPIRED',
          updatedAt: now,
          version: { increment: 1 },
        },
      });
      await transaction.mediaUploadSession.update({
        where: {
          mediaId_organizationId: { mediaId: media.id, organizationId: media.organizationId },
        },
        data: { status: 'FAILED', updatedAt: now, version: { increment: 1 } },
      });
      await this.appendStatusEvent(transaction, updated, 'FAILED', 'PENDING_UPLOAD', {
        actorType: 'USER',
        actorUserId,
        requestId,
        safeMetadata: { resultCode: 'MEDIA_UPLOAD_SESSION_EXPIRED' },
      });
      await this.appendOutbox(transaction, updated, 'MEDIA_UPLOAD_FAILED');
    }
  }

  private async completeFailedConfirmation(
    reservation: Exclude<
      Awaited<ReturnType<IdempotencyService['reserveStage']>>,
      { kind: 'REPLAY' }
    >,
    principal: AuthenticatedPrincipal,
    media: MediaEvidence,
    requestId: string,
    error: ApplicationError,
  ): Promise<MediaEvidenceProjection> {
    return this.idempotency.completeStage(reservation, async (transaction) => {
      const now = this.clock.now();
      const updated = await transaction.mediaEvidence.update({
        where: { id: media.id, version: media.version, uploadStatus: 'PENDING_UPLOAD' },
        data: {
          uploadStatus: 'FAILED',
          failedAt: now,
          failureCode: error.code,
          updatedAt: now,
          version: { increment: 1 },
        },
      });
      await transaction.mediaUploadSession.update({
        where: {
          mediaId_organizationId: { mediaId: media.id, organizationId: media.organizationId },
        },
        data: { status: 'FAILED', updatedAt: now, version: { increment: 1 } },
      });
      await this.appendStatusEvent(transaction, updated, 'FAILED', 'PENDING_UPLOAD', {
        actorType: 'USER',
        actorUserId: principal.userId,
        requestId,
        safeMetadata: { resultCode: error.code },
      });
      await this.audit.append(transaction, {
        organizationId: updated.organizationId,
        actorUserId: principal.userId,
        actorRoleSnapshot: principal.role,
        permissionId: 'MEDIA-UPLOAD-CONFIRM',
        actionType: 'MEDIA_UPLOAD_CONFIRMED',
        targetType: 'MEDIA_EVIDENCE',
        targetId: updated.id,
        requestId,
        outcome: 'REJECTED',
        reasonCode: error.code,
        safeMetadata: {
          sessionId: updated.sessionId,
          enrollmentId: updated.enrollmentId,
          businessPurpose: updated.businessPurpose,
          mediaType: updated.mediaType,
          previousStatus: 'PENDING_UPLOAD',
          nextStatus: 'FAILED',
        },
      });
      await this.appendOutbox(transaction, updated, 'MEDIA_UPLOAD_FAILED');
      return this.idempotency.failure(error, {
        principalId: principal.userId,
        authSessionId: principal.sessionId,
      });
    });
  }

  private targetScope(input: InitiateMediaUploadRequestDto): string {
    if (
      input.businessPurpose === 'EXERCISE_RECORD' &&
      (input.captureSource === 'IN_APP_CAMERA' || input.captureSource === 'FILE_PICKER') &&
      input.sessionId !== undefined &&
      input.enrollmentId === undefined
    ) {
      return `session:${input.sessionId}`;
    }
    if (
      input.businessPurpose === 'EXEMPTION_APPLICATION' &&
      (input.captureSource === 'IN_APP_CAMERA' || input.captureSource === 'FILE_PICKER') &&
      input.enrollmentId !== undefined &&
      input.sessionId === undefined
    ) {
      return `enrollment:${input.enrollmentId}`;
    }
    throw new ApplicationError('MEDIA_BIND_TARGET_INVALID', 422);
  }

  private async resolveInitiationTarget(
    transaction: Prisma.TransactionClient,
    principal: AuthenticatedPrincipal,
    input: InitiateMediaUploadRequestDto,
  ): Promise<ResolvedInitiationTarget> {
    this.targetScope(input);
    if (input.businessPurpose === 'EXERCISE_RECORD') {
      const sessionId = input.sessionId;
      if (sessionId === undefined) throw new ApplicationError('MEDIA_BIND_TARGET_INVALID', 422);
      await this.lockExerciseSession(transaction, sessionId);
      const session = await transaction.exerciseSession.findFirst({
        where: { id: sessionId, organizationId: principal.organizationId },
        include: {
          student: { select: { userId: true } },
          enrollment: { select: { status: true } },
          exerciseRecord: { select: { status: true } },
        },
      });
      if (session?.student.userId !== principal.userId) {
        return {
          kind: 'FAILURE',
          failure: this.idempotency.failure(new ApplicationError('SESSION_NOT_FOUND', 404)),
        };
      }
      if (input.captureSource === 'FILE_PICKER' && !await isHistoricalSession(transaction,session.id)) throw new ApplicationError('MEDIA_BIND_TARGET_INVALID',422);
      await exerciseUploadWindow(transaction, session.id, this.clock.now());
      return {
        kind: 'TARGET',
        studentId: session.studentId,
        sessionId: session.id,
        enrollmentId: null,
      };
    }

    const enrollmentId = input.enrollmentId;
    if (enrollmentId === undefined) throw new ApplicationError('MEDIA_BIND_TARGET_INVALID', 422);
    const enrollment = await transaction.enrollment.findFirst({
      where: { id: enrollmentId, organizationId: principal.organizationId },
      include: { student: { select: { userId: true } } },
    });
    if (enrollment?.student.userId !== principal.userId) {
      return {
        kind: 'FAILURE',
        failure: this.idempotency.failure(new ApplicationError('ENROLLMENT_NOT_FOUND', 404)),
      };
    }
    if (enrollment.status !== 'ACTIVE') {
      return {
        kind: 'FAILURE',
        failure: this.idempotency.failure(new ApplicationError('ENROLLMENT_NOT_ACTIVE', 409)),
      };
    }
    return {
      kind: 'TARGET',
      studentId: enrollment.studentId,
      sessionId: null,
      enrollmentId: enrollment.id,
    };
  }

  private async lockExerciseSession(
    transaction: Prisma.TransactionClient,
    sessionId: string,
  ): Promise<void> {
    await transaction.$queryRaw(
      Prisma.sql`SELECT id FROM exercise_sessions WHERE id = ${sessionId}::uuid FOR UPDATE`,
    );
  }

  private async loadAuthorizedMedia(
    principal: AuthenticatedPrincipal,
    mediaId: string,
  ): Promise<AuthorizedMedia> {
    const media = await this.prisma.mediaEvidence.findFirst({
      where: { id: mediaId, organizationId: principal.organizationId },
      include: {
        ownerStudent: { select: { userId: true } },
        recordAssociation: { select: { recordId: true } },
        session: {
          include: { classSection: { include: { teacher: { select: { userId: true } } } } },
        },
        exemptionAssociations: {
          include: {
            application: {
              include: {
                classSection: { include: { teacher: { select: { userId: true } } } },
              },
            },
          },
        },
      },
    });
    if (media === null) throw new ApplicationError('MEDIA_OBJECT_NOT_FOUND', 404);
    const isOwner = principal.role === 'STUDENT' && media.ownerStudent.userId === principal.userId;
    const isTeacher =
      principal.role === 'TEACHER' &&
      (media.session?.classSection.teacher.userId === principal.userId ||
        media.exemptionAssociations.some(
          ({ application }) =>
            application.classSection.teacher.userId === principal.userId &&
            application.status !== 'DRAFT',
        ));
    if (!isOwner && !isTeacher) throw new ApplicationError('MEDIA_OBJECT_NOT_FOUND', 404);
    return media;
  }

  private declaredFacts(input: InitiateMediaUploadRequestDto): DeclaredMediaFacts {
    return {
      businessPurpose: input.businessPurpose,
      mediaType: input.mediaType,
      mimeType: input.mimeType.toLowerCase(),
      fileSizeBytes: input.fileSizeBytes,
      contentSha256: input.declaredContentSha256 ?? null,
      durationSeconds: input.durationSeconds ?? null,
    };
  }

  private declaredFactsFromMedia(media: MediaEvidence): DeclaredMediaFacts {
    return {
      businessPurpose: media.businessPurpose,
      mediaType: media.mediaType,
      mimeType: media.declaredMimeType,
      fileSizeBytes: Number(media.declaredFileSizeBytes),
      contentSha256: media.declaredContentSha256,
      durationSeconds: media.declaredDurationSeconds,
    };
  }

  private configuration(): MediaConfig {
    if (this.runtimeConfig.media === null) {
      throw new ApplicationError('SYSTEM_SERVICE_UNAVAILABLE', 503, {
        dependency: 'MEDIA_STORAGE',
      });
    }
    return this.runtimeConfig.media;
  }

  private normalizeEntityTag(value: string): string {
    return value.trim().replace(/^"|"$/g, '');
  }

  private isDeterministicIntegrityFailure(error: ApplicationError): boolean {
    return [
      'MEDIA_INTEGRITY_MISMATCH',
      'MEDIA_SIZE_EXCEEDED',
      'MEDIA_TYPE_NOT_ALLOWED',
      'MEDIA_VIDEO_DURATION_EXCEEDED',
      'MEDIA_AUDIO_TRACK_REQUIRED',
    ].includes(error.code);
  }

  private isQuotaConstraint(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      JSON.stringify(error).includes('media_evidence_active_quota_check')
    );
  }

  private async appendStatusEvent(
    transaction: Prisma.TransactionClient,
    media: MediaEvidence,
    eventType: string,
    fromStatus: string | null,
    context: {
      actorType: 'USER' | 'WORKER';
      actorUserId: string | null;
      requestId: string;
      safeMetadata?: Record<string, unknown>;
    },
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
        actorType: context.actorType,
        actorUserId: context.actorUserId,
        requestId: context.requestId,
        safeMetadata: (context.safeMetadata ?? {}) as Prisma.InputJsonValue,
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
        enrollmentId: media.enrollmentId,
        businessPurpose: media.businessPurpose,
        mediaType: media.mediaType,
        uploadStatus: media.uploadStatus,
      },
    });
  }
}
