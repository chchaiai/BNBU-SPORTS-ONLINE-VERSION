var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { PrismaService } from '../../../common/database/prisma.service.js';
import { Injectable } from '@nestjs/common';
import { ApplicationError } from '../../../common/errors/application-error.js';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service.js';
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
let JoinCapabilitiesService = class JoinCapabilitiesService {
    repository;
    prisma;
    invites;
    identities;
    normalizer;
    idempotency;
    crypto;
    rateLimits;
    clock;
    ids;
    constructor(repository, prisma, invites, identities, normalizer, idempotency, crypto, rateLimits, clock, ids) {
        this.repository = repository;
        this.prisma = prisma;
        this.invites = invites;
        this.identities = identities;
        this.normalizer = normalizer;
        this.idempotency = idempotency;
        this.crypto = crypto;
        this.rateLimits = rateLimits;
        this.clock = clock;
        this.ids = ids;
    }
    async issue(invite, input, facts) {
        let proof = null;
        if (input.joinEmailProof) {
            try {
                proof = this.crypto.decrypt('join-email-proof', invite.inviteId, input.joinEmailProof);
            }
            catch {
                throw new ApplicationError('AUTH_JOIN_CAPABILITY_INVALID', 401);
            }
            if (!proof || proof.organizationId !== invite.organizationId || Date.parse(proof.expiresAt) <= this.clock.now().getTime() ||
                !Number.isFinite(Date.parse(proof.verifiedAt)) || Date.parse(proof.verifiedAt) >= invite.expiresAt.getTime())
                throw new ApplicationError('AUTH_JOIN_CAPABILITY_INVALID', 401);
            const challenge = await this.prisma.studentSignInChallenge.findUnique({ where: { id: proof.challengeId } });
            if (challenge?.status !== 'CONSUMED' || challenge.organizationId !== invite.organizationId)
                throw new ApplicationError('AUTH_JOIN_CAPABILITY_INVALID', 401);
        }
        const owner = facts.authenticatedUserId ?? proof?.userId ?? undefined;
        const user = owner ? await this.prisma.user.findFirst({ where: { id: owner, organizationId: invite.organizationId,
                role: 'STUDENT', status: { in: ['ACTIVE', 'PENDING_CONTACT_BINDING'] }, deletedAt: null } }) : null;
        if (!proof && (!user?.emailVerifiedAt || !user.primaryEmailNormalized?.includes('bnbu')))
            throw new ApplicationError('AUTH_REQUIRED', 401);
        if (proof && user?.emailVerifiedAt && user.primaryEmailNormalized !== proof.email)
            throw new ApplicationError('USER_IDENTITY_CONFLICT', 409);
        const identity = { ...this.normalizer.normalize(input),
            ...(owner ? { authenticatedUserId: owner } : {}),
            ...(proof ? { verifiedEmail: proof.email, verificationChallengeId: proof.challengeId } : {}) };
        if (!identity.collegeName || !identity.majorName)
            throw new ApplicationError('USER_PROFILE_INVALID', 422);
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
        if (existing && !owner)
            throw new ApplicationError('AUTH_REQUIRED', 401);
        const registeredAt = proof ? new Date(proof.verifiedAt) : null;
        const reference = await this.idempotency.execute({
            organizationId: invite.organizationId,
            principalId: null,
            authSessionId: null,
            operationId: 'issueJoinCapability',
            scope: invite.inviteId,
            key: facts.idempotencyKey,
            request: { inviteId: invite.inviteId, identityFingerprint },
            requestId: facts.requestId,
        }, async (transaction) => {
            const now = this.clock.now();
            const lockedSection = await this.invites.lockClassSection(invite.organizationId, invite.classSectionId, transaction);
            const currentInvite = await this.invites.findById(invite.inviteId, transaction);
            if (lockedSection === null ||
                !currentInvite || !permitsInviteCompletion(currentInvite, registeredAt ?? now, now) ||
                lockedSection.status !== 'ACTIVE' ||
                !lockedSection.isEnrollmentOpen ||
                lockedSection.teacher.status !== 'ACTIVE' ||
                lockedSection.teacher.deletedAt !== null ||
                lockedSection.course.status !== 'ACTIVE' ||
                lockedSection.course.deletedAt !== null ||
                lockedSection.semester.status !== 'CURRENT' ||
                now > new Date(lockedSection.semester.endDate.getTime() + 86_400_000 - 1)) {
                return this.idempotency.failure(new ApplicationError('COURSE_CLASS_SECTION_NOT_JOINABLE', 409));
            }
            if (currentInvite.expiresAt <= now && await transaction.joinCapability.findFirst({ where: {
                    courseInviteId: invite.inviteId, identityFingerprint,
                } }))
                return this.idempotency.failure(new ApplicationError('COURSE_CLASS_SECTION_NOT_JOINABLE', 409));
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
                encryptedIdentitySnapshot: this.crypto.encrypt('join-identity-snapshot', capabilityId, identity),
                identityKeyVersion: this.crypto.keyVersion,
                issuedAt: registeredAt ?? now,
                expiresAt,
                createdRequestId: facts.requestId,
            });
            await this.repository.create(capability.snapshot(), transaction);
            return this.idempotency.success({ capabilityId }, { resourceType: 'JOIN_CAPABILITY', resourceId: capabilityId });
        });
        const capability = await this.repository.findById(reference.capabilityId);
        if (capability?.organizationId !== invite.organizationId ||
            capability.courseInviteId !== invite.inviteId ||
            capability.identityFingerprint !== identityFingerprint ||
            capability.secretCiphertext === null ||
            capability.secretReplayExpiresAt === null ||
            capability.secretReplayExpiresAt <= this.clock.now()) {
            throw new ApplicationError('CONFLICT_UNSUPPORTED_RESOURCE_STATE', 409, {
                reason: 'JOIN_CAPABILITY_REPLAY_WINDOW_EXPIRED',
            });
        }
        const secret = this.crypto.decrypt('join-capability-issuance', capability.id, capability.secretCiphertext);
        return {
            joinCapability: secret.token,
            classSectionId: capability.classSectionId,
            expiresAt: capability.expiresAt.toISOString(),
        };
    }
};
JoinCapabilitiesService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [JoinCapabilityRepository,
        PrismaService,
        CourseInviteRepository,
        StudentIdentityResolver,
        StudentIdentityNormalizer,
        IdempotencyService,
        QrJoinCryptoService,
        QrJoinPublicRateLimitService,
        Clock,
        IdGenerator])
], JoinCapabilitiesService);
export { JoinCapabilitiesService };
//# sourceMappingURL=join-capabilities.service.js.map