import { Inject, Injectable } from '@nestjs/common';

import type { RuntimeConfig } from '../../../common/config/environment.js';
import { RUNTIME_CONFIG } from '../../../common/config/runtime-config.module.js';
import { ApplicationError } from '../../../common/errors/application-error.js';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service.js';
import type { CourseInvitePolicyContext } from '../../../common/policy/qr-join-policy-resolver.js';
import { QrJoinPublicRateLimitService } from '../../../common/rate-limit/qr-join-public-rate-limit.service.js';
import { QrJoinCryptoService } from '../../../common/security/qr-join-crypto.service.js';
import { Clock } from '../../../common/time/clock.js';
import { IdGenerator } from '../../../common/time/id-generator.js';
import { StudentIdentityNormalizer } from '../../users/application/student-identity-normalizer.js';
import { StudentIdentityResolver } from '../../users/application/student-identity-resolver.js';
import { CourseInviteRepository } from '../../course-invites/domain/course-invite.repository.js';
import { JoinCapabilityRepository } from '../domain/join-capability.repository.js';
import { JoinCapabilityEntity } from '../domain/join-capability.js';
import type { IssueJoinCapabilityRequestDto } from '../interface/http/join-capabilities.dto.js';
import type { JoinCapabilityProjection } from './join-capability-projection.js';

interface IssueFacts {
  requestId: string;
  idempotencyKey: string | undefined;
  sourceIp: string | undefined;
}

@Injectable()
export class JoinCapabilitiesService {
  constructor(
    private readonly repository: JoinCapabilityRepository,
    private readonly invites: CourseInviteRepository,
    private readonly identities: StudentIdentityResolver,
    private readonly normalizer: StudentIdentityNormalizer,
    private readonly idempotency: IdempotencyService,
    private readonly crypto: QrJoinCryptoService,
    private readonly rateLimits: QrJoinPublicRateLimitService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    @Inject(RUNTIME_CONFIG) private readonly config: RuntimeConfig,
  ) {}

  async issue(
    invite: CourseInvitePolicyContext,
    input: IssueJoinCapabilityRequestDto,
    facts: IssueFacts,
  ): Promise<JoinCapabilityProjection> {
    const identity = this.normalizer.normalize(input);
    const identityFingerprint = this.crypto.identityFingerprint({
      organizationId: invite.organizationId,
      inviteId: invite.inviteId,
      ...identity,
    });
    await this.rateLimits.enforce([
      `qr:issue:identity:${identityFingerprint}`,
      `qr:issue:source-identity:${this.crypto.opaqueReference('source-identity', `${facts.sourceIp ?? 'unavailable'}\0${identityFingerprint}`)}`,
    ]);
    await this.identities.validateExisting(invite.organizationId, identity);

    const reference = await this.idempotency.execute(
      {
        organizationId: invite.organizationId,
        principalId: null,
        authSessionId: null,
        operationId: 'issueJoinCapability',
        scope: invite.inviteId,
        key: facts.idempotencyKey,
        request: { inviteId: invite.inviteId, identityFingerprint },
        requestId: facts.requestId,
      },
      async (transaction) => {
        const now = this.clock.now();
        const lockedSection = await this.invites.lockClassSection(
          invite.organizationId,
          invite.classSectionId,
          transaction,
        );
        const currentInvite = await this.invites.findById(invite.inviteId, transaction);
        if (
          lockedSection === null ||
          currentInvite?.status !== 'ACTIVE' ||
          currentInvite.expiresAt <= now ||
          lockedSection.status !== 'ACTIVE' ||
          !lockedSection.isEnrollmentOpen ||
          lockedSection.teacher.status !== 'ACTIVE' ||
          lockedSection.teacher.deletedAt !== null ||
          lockedSection.course.status !== 'ACTIVE' ||
          lockedSection.course.deletedAt !== null ||
          lockedSection.semester.status !== 'CURRENT' ||
          now > new Date(lockedSection.semester.endDate.getTime() + 86_400_000 - 1)
        ) {
          return this.idempotency.failure(
            new ApplicationError('COURSE_CLASS_SECTION_NOT_JOINABLE', 409),
          );
        }
        await this.identities.validateExisting(invite.organizationId, identity, transaction);
        const capabilityId = this.ids.next();
        const issued = this.crypto.issueToken('join-capability', capabilityId);
        const configuredExpiry = new Date(
          now.getTime() + this.config.joinCapabilityTtlSeconds * 1_000,
        );
        const expiresAt =
          configuredExpiry <= currentInvite.expiresAt ? configuredExpiry : currentInvite.expiresAt;
        const replayExpiresAt = new Date(
          now.getTime() + this.config.qrJoinSecretReplaySeconds * 1_000,
        );
        const capability = JoinCapabilityEntity.issue({
          id: capabilityId,
          organizationId: invite.organizationId,
          courseInviteId: invite.inviteId,
          classSectionId: invite.classSectionId,
          tokenHash: issued.tokenHash,
          secretCiphertext: this.crypto.encrypt('join-capability-issuance', capabilityId, {
            token: issued.token,
          }),
          secretKeyVersion: this.crypto.keyVersion,
          secretReplayExpiresAt: replayExpiresAt,
          identityFingerprint,
          deviceChallengeHash: null,
          encryptedIdentitySnapshot: this.crypto.encrypt(
            'join-identity-snapshot',
            capabilityId,
            identity,
          ),
          identityKeyVersion: this.crypto.keyVersion,
          issuedAt: now,
          expiresAt,
          createdRequestId: facts.requestId,
        });
        await this.repository.create(capability.snapshot(), transaction);
        return this.idempotency.success(
          { capabilityId },
          { resourceType: 'JOIN_CAPABILITY', resourceId: capabilityId },
        );
      },
    );

    const capability = await this.repository.findById(reference.capabilityId);
    if (
      capability?.organizationId !== invite.organizationId ||
      capability.courseInviteId !== invite.inviteId ||
      capability.identityFingerprint !== identityFingerprint ||
      capability.secretCiphertext === null ||
      capability.secretReplayExpiresAt === null ||
      capability.secretReplayExpiresAt <= this.clock.now()
    ) {
      throw new ApplicationError('CONFLICT_UNSUPPORTED_RESOURCE_STATE', 409, {
        reason: 'JOIN_CAPABILITY_REPLAY_WINDOW_EXPIRED',
      });
    }
    const secret = this.crypto.decrypt<{ token: string }>(
      'join-capability-issuance',
      capability.id,
      capability.secretCiphertext,
    );
    return {
      joinCapability: secret.token,
      classSectionId: capability.classSectionId,
      expiresAt: capability.expiresAt.toISOString(),
    };
  }
}
