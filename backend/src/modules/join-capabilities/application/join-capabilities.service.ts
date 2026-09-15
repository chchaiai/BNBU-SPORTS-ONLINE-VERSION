import { isStudentSchoolEmail } from '../../../common/security/student-school-email.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import { Injectable } from '@nestjs/common';

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
import { INVITE_GRACE_MS, permitsInviteCompletion } from '../../course-invites/domain/invite-timing.js';
import { JoinCapabilityRepository } from '../domain/join-capability.repository.js';
import { JoinCapabilityEntity } from '../domain/join-capability.js';
import type { IssueJoinCapabilityRequestDto } from '../interface/http/join-capabilities.dto.js';
import type { JoinCapabilityProjection } from './join-capability-projection.js';

interface IssueFacts {
  authenticatedUserId?: string;
  requestId: string;
  idempotencyKey: string | undefined;
  sourceIp: string | undefined;
}

@Injectable()
export class JoinCapabilitiesService {
  constructor(
    private readonly repository: JoinCapabilityRepository,
    private readonly prisma: PrismaService,
    private readonly invites: CourseInviteRepository,
    private readonly identities: StudentIdentityResolver,
    private readonly normalizer: StudentIdentityNormalizer,
    private readonly idempotency: IdempotencyService,
    private readonly crypto: QrJoinCryptoService,
    private readonly rateLimits: QrJoinPublicRateLimitService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async issue(
    invite: CourseInvitePolicyContext,
    input: IssueJoinCapabilityRequestDto,
    facts: IssueFacts,
  ): Promise<JoinCapabilityProjection> {
    let proof: { email: string; challengeId: string; organizationId: string; userId: string | null; verifiedAt: string; expiresAt: string } | null = null;
    if (input.joinEmailProof) {
      try { proof = this.crypto.decrypt('join-email-proof', invite.inviteId, input.joinEmailProof); }
      catch { throw new ApplicationError('AUTH_JOIN_CAPABILITY_INVALID', 401); }
      if (!proof || !isStudentSchoolEmail(proof.email) || proof.organizationId !== invite.organizationId || Date.parse(proof.expiresAt) <= this.clock.now().getTime() ||
          !Number.isFinite(Date.parse(proof.verifiedAt)) || Date.parse(proof.verifiedAt) >= invite.expiresAt.getTime())
        throw new ApplicationError('AUTH_JOIN_CAPABILITY_INVALID', 401);
      const challenge = await this.prisma.studentSignInChallenge.findUnique({ where: { id: proof.challengeId } });
      if (challenge?.status !== 'CONSUMED' || challenge.organizationId !== invite.organizationId)
        throw new ApplicationError('AUTH_JOIN_CAPABILITY_INVALID', 401);
    }
    const owner = facts.authenticatedUserId ?? proof?.userId ?? undefined;
    const user = owner ? await this.prisma.user.findFirst({ where: { id: owner, organizationId: invite.organizationId,
      role: 'STUDENT', status: { in: ['ACTIVE','PENDING_CONTACT_BINDING'] }, deletedAt: null } }) : null;
    if (!proof && (!user?.emailVerifiedAt || !isStudentSchoolEmail(user.primaryEmailNormalized)))
      throw new ApplicationError('AUTH_REQUIRED', 401);
    if (proof && user?.emailVerifiedAt && user.primaryEmailNormalized !== proof.email)
      throw new ApplicationError('USER_IDENTITY_CONFLICT', 409);
    const identity = { ...this.normalizer.normalize(input),
      ...(owner ? { authenticatedUserId: owner } : {}),
      ...(proof ? { verifiedEmail: proof.email, verificationChallengeId: proof.challengeId } : {}) };
    if (!identity.collegeName || !identity.majorName) throw new ApplicationError('USER_PROFILE_INVALID', 422);
    const identityFingerprint = this.crypto.identityFingerprint({
      organizationId: invite.organizationId,
      inviteId: invite.inviteId,
      ...identity,
    });
    await this.rateLimits.enforce([
      `qr:issue:identity:${identityFingerprint}`,
      `qr:issue:source-identity:${this.crypto.opaqueReference('source-identity', `${facts.sourceIp ?? 'unavailable'}\0${identityFingerprint}`)}`,
    ]);
    const existing = await this.identities.validateExisting(invite.organizationId, identity);
    if ((existing?.user.emailVerifiedAt && owner !== existing.user.id) ||
        (owner && existing?.user.id !== owner)) {
      throw new ApplicationError('AUTH_REQUIRED', 401);
    }

    if (existing && !owner) throw new ApplicationError('AUTH_REQUIRED', 401);
    const registeredAt = proof ? new Date(proof.verifiedAt) : null;
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
          !currentInvite || !permitsInviteCompletion(currentInvite, registeredAt ?? now, now) ||
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
        if (currentInvite.expiresAt <= now && await transaction.joinCapability.findFirst({ where: {
          courseInviteId: invite.inviteId, identityFingerprint,
        } })) return this.idempotency.failure(new ApplicationError('COURSE_CLASS_SECTION_NOT_JOINABLE', 409));
        await this.identities.validateExisting(invite.organizationId, identity, transaction);
        const capabilityId = this.ids.next();
        const issued = this.crypto.issueToken('join-capability', capabilityId);
        const expiresAt = new Date(currentInvite.expiresAt.getTime() + INVITE_GRACE_MS);
        const replayExpiresAt = expiresAt;
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
          issuedAt: registeredAt ?? now,
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
