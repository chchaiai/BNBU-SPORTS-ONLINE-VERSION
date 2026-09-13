import { Inject, Injectable } from '@nestjs/common';
import { requireUnsettledCourse } from '../../v8/v81-settlement-write-guard.js';

import { AuditService } from '../../../common/audit/audit.service.js';
import type { RuntimeConfig } from '../../../common/config/environment.js';
import { RUNTIME_CONFIG } from '../../../common/config/runtime-config.module.js';
import { ApplicationError } from '../../../common/errors/application-error.js';
import type { AuthenticatedPrincipal } from '../../../common/http/request-context.js';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service.js';
import { OutboxService } from '../../../common/outbox/outbox.service.js';
import type { CourseInvitePolicyContext } from '../../../common/policy/qr-join-policy-resolver.js';
import { QrJoinCryptoService } from '../../../common/security/qr-join-crypto.service.js';
import { SecureDigestService } from '../../../common/security/secure-digest.service.js';
import { Clock } from '../../../common/time/clock.js';
import { IdGenerator } from '../../../common/time/id-generator.js';
import { CourseInviteRepository } from '../domain/course-invite.repository.js';
import { CourseInviteEntity } from '../domain/course-invite.js';
import { resolveInviteExpiry } from '../domain/invite-timing.js';
import type { CreateCourseInviteRequestDto } from '../interface/http/course-invites.dto.js';
import {
  projectCourseInvitePreview,
  type CourseInvitePreviewProjection,
  type CourseInviteProjection,
} from './course-invite-projection.js';

interface MutationFacts {
  requestId: string;
  idempotencyKey: string | undefined;
}

@Injectable()
export class CourseInvitesService {
  constructor(
    private readonly repository: CourseInviteRepository,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly crypto: QrJoinCryptoService,
    private readonly digest: SecureDigestService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    @Inject(RUNTIME_CONFIG) private readonly config: RuntimeConfig,
  ) {}

  async createOrRotate(
    principal: AuthenticatedPrincipal,
    classSectionId: string,
    input: CreateCourseInviteRequestDto,
    facts: MutationFacts,
  ): Promise<CourseInviteProjection> {
    const normalizedExpiry = this.normalizeRequestedExpiry(input.expiresAt);
    const reference = await this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'createCourseInvite',
        scope: `${principal.organizationId}:${principal.userId}:${classSectionId}`,
        key: facts.idempotencyKey,
        request: { classSectionId, expiresAt: normalizedExpiry,
          ...(input.expiresInMinutes === undefined ? {} : { expiresInMinutes: input.expiresInMinutes }) },
        requestId: facts.requestId,
      },
      async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
        const now = this.clock.now();
        const section = await this.repository.lockClassSection(
          principal.organizationId,
          classSectionId,
          transaction,
        );
        if (section === null) {
          return this.idempotency.failure(
            new ApplicationError('COURSE_CLASS_SECTION_NOT_FOUND', 404),
          );
        }
        if (section.teacher.userId !== principal.userId) {
          return this.idempotency.failure(
            new ApplicationError('PERMISSION_COURSE_SCOPE_DENIED', 403),
          );
        }
        await requireUnsettledCourse(transaction, principal.organizationId, classSectionId);
        this.assertJoinable(section, now);
        const expiresAt = resolveInviteExpiry({ expiresAt: normalizedExpiry,
          ...(input.expiresInMinutes === undefined ? {} : { expiresInMinutes: input.expiresInMinutes }) }, now, section.semester.endDate);
        const inviteId = this.ids.next();
        const issued = this.crypto.issueToken('course-invite', inviteId);
        const replayExpiresAt = new Date(
          now.getTime() + this.config.qrJoinSecretReplaySeconds * 1_000,
        );
        const nextVersion = await this.repository.nextVersion(classSectionId, transaction);
        const next = CourseInviteEntity.create({
          id: inviteId,
          organizationId: principal.organizationId,
          classSectionId,
          versionNumber: nextVersion,
          tokenHash: issued.tokenHash,
          secretCiphertext: this.crypto.encrypt('course-invite-issuance', inviteId, {
            token: issued.token,
          }),
          secretKeyVersion: this.crypto.keyVersion,
          secretReplayExpiresAt: replayExpiresAt,
          createdBy: principal.userId,
          createdAt: now,
          expiresAt,
        });
        const active = await this.repository.findActive(classSectionId, transaction);
        if (active !== null) {
          const prior = CourseInviteEntity.restore(active);
          prior.revoke(inviteId, principal.userId, now);
          const changed = await this.repository.update(
            prior.snapshot(),
            active.rowVersion,
            transaction,
          );
          if (!changed) {
            return this.idempotency.failure(new ApplicationError('CONFLICT_VERSION_MISMATCH', 409));
          }
        }
        await this.repository.create(next.snapshot(), transaction);
        await this.audit.append(transaction, {
          organizationId: principal.organizationId,
          actorUserId: principal.userId,
          actorRoleSnapshot: principal.role,
          permissionId: 'COURSE-INVITE-CREATE',
          actionType: 'COURSE_INVITE_CHANGED',
          targetType: 'COURSE_INVITE',
          targetId: inviteId,
          requestId: facts.requestId,
          idempotencyKeyReference: this.keyReference(facts.idempotencyKey),
          outcome: 'SUCCEEDED',
          safeMetadata: { classSectionId },
        });
        await this.outbox.append(transaction, {
          organizationId: principal.organizationId,
          aggregateType: 'COURSE_INVITE',
          aggregateId: inviteId,
          eventType: 'COURSE_INVITE_ROTATED_V1',
          eventVersion: 1,
          payload: {
            inviteId,
            classSectionId,
            previousInviteId: active?.id ?? null,
            requestId: facts.requestId,
          },
        });
        return this.idempotency.success(
          { inviteId },
          {
            principalId: principal.userId,
            authSessionId: principal.sessionId,
            resourceType: 'COURSE_INVITE',
            resourceId: inviteId,
          },
        );
      },
    );

    const invite = await this.repository.findById(reference.inviteId);
    if (
      invite?.organizationId !== principal.organizationId ||
      invite.classSectionId !== classSectionId ||
      invite.secretCiphertext === null ||
      invite.secretReplayExpiresAt === null ||
      invite.secretReplayExpiresAt <= this.clock.now()
    ) {
      throw new ApplicationError('CONFLICT_UNSUPPORTED_RESOURCE_STATE', 409, {
        reason: 'COURSE_INVITE_REPLAY_WINDOW_EXPIRED',
      });
    }
    const secret = this.crypto.decrypt<{ token: string }>(
      'course-invite-issuance',
      invite.id,
      invite.secretCiphertext,
    );
    return {
      inviteToken: secret.token,
      classSectionId: invite.classSectionId,
      expiresAt: invite.expiresAt.toISOString(),
    };
  }

  preview(context: CourseInvitePolicyContext): CourseInvitePreviewProjection {
    return projectCourseInvitePreview(context);
  }

  private assertJoinable(
    section: Awaited<ReturnType<CourseInviteRepository['lockClassSection']>> & {},
    now: Date,
  ): void {
    if (
      section.status !== 'ACTIVE' ||
      !section.isEnrollmentOpen ||
      section.teacher.status !== 'ACTIVE' ||
      section.teacher.deletedAt !== null ||
      section.course.status !== 'ACTIVE' ||
      section.course.deletedAt !== null ||
      section.semester.status !== 'CURRENT' ||
      now > this.semesterEnd(section.semester.endDate)
    ) {
      throw new ApplicationError('COURSE_CLASS_SECTION_NOT_JOINABLE', 409);
    }
  }

  private normalizeRequestedExpiry(value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new ApplicationError('VALIDATION_FORMAT_INVALID', 422, { field: 'expiresAt' });
    }
    return date.toISOString();
  }

  private semesterEnd(value: Date): Date {
    return new Date(value.getTime() + 86_400_000 - 1);
  }

  private keyReference(key: string | undefined): string | null {
    return key === undefined ? null : this.digest.digest('idempotency-key-reference', key);
  }
}
