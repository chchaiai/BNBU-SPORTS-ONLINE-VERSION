import { Inject, Injectable } from '@nestjs/common';
import { requireUnsettledCourse } from '../../v8/v81-settlement-write-guard.js';

import { AuditService } from '../../../common/audit/audit.service.js';
import type { RuntimeConfig } from '../../../common/config/environment.js';
import { RUNTIME_CONFIG } from '../../../common/config/runtime-config.module.js';
import { ApplicationError } from '../../../common/errors/application-error.js';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service.js';
import { OutboxService } from '../../../common/outbox/outbox.service.js';
import type { JoinCapabilityPolicyContext } from '../../../common/policy/qr-join-policy-resolver.js';
import { QrJoinCryptoService } from '../../../common/security/qr-join-crypto.service.js';
import { SecureDigestService } from '../../../common/security/secure-digest.service.js';
import { Clock } from '../../../common/time/clock.js';
import { IdGenerator } from '../../../common/time/id-generator.js';
import { AuthService } from '../../auth/auth.service.js';
import { CourseInviteRepository } from '../../course-invites/domain/course-invite.repository.js';
import { permitsInviteCompletion } from '../../course-invites/domain/invite-timing.js';
import { JoinCapabilityRepository } from '../../join-capabilities/domain/join-capability.repository.js';
import type { NormalizedStudentIdentity } from '../../users/application/student-identity.js';
import { StudentIdentityResolver } from '../../users/application/student-identity-resolver.js';
import { EnrollmentEntity } from '../domain/enrollment.js';
import { EnrollmentRepository } from '../domain/enrollment.repository.js';
import { projectJoinResult, type JoinResultProjection } from './enrollment-projection.js';

interface JoinFacts {
  requestId: string;
  idempotencyKey: string | undefined;
  sourceIp?: string;
}

@Injectable()
export class QrJoinService {
  constructor(
    private readonly capabilities: JoinCapabilityRepository,
    private readonly invites: CourseInviteRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly identities: StudentIdentityResolver,
    private readonly auth: AuthService,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly crypto: QrJoinCryptoService,
    private readonly digest: SecureDigestService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    @Inject(RUNTIME_CONFIG) private readonly config: RuntimeConfig,
  ) {}

  async join(
    context: JoinCapabilityPolicyContext,
    facts: JoinFacts,
  ): Promise<JoinResultProjection> {
    if (facts.idempotencyKey === undefined) {
      throw new ApplicationError('VALIDATION_FAILED', 422, {
        fieldErrors: [
          {
            field: 'Idempotency-Key',
            code: 'INVALID',
            i18nKey: 'error.validation.failed',
            params: {},
          },
        ],
      });
    }
    const idempotencyKey = facts.idempotencyKey;
    const keyHash = this.digest.digest('idempotency-key', idempotencyKey);
    const reference = await this.idempotency.execute(
      {
        organizationId: context.organizationId,
        principalId: null,
        authSessionId: null,
        operationId: 'joinClassSectionWithInvite',
        scope: `${context.capabilityId}:${context.identityFingerprint}`,
        key: idempotencyKey,
        request: {
          capabilityId: context.capabilityId,
          inviteId: context.courseInviteId,
          identityFingerprint: context.identityFingerprint,
        },
        requestId: facts.requestId,
      },
      async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM organizations WHERE id=${context.organizationId}::uuid FOR NO KEY UPDATE`;
        const now = this.clock.now();
        const capability = await this.capabilities.lockById(context.capabilityId, transaction);
        if (
          capability?.organizationId !== context.organizationId ||
          capability.courseInviteId !== context.courseInviteId ||
          capability.classSectionId !== context.classSectionId ||
          capability.identityFingerprint !== context.identityFingerprint
        ) {
          return this.idempotency.failure(
            new ApplicationError('AUTH_JOIN_CAPABILITY_INVALID', 401),
          );
        }
        if (capability.status === 'CONSUMED') {
          if (
            capability.consumedIdempotencyKeyHash === keyHash &&
            capability.resultCiphertext !== null &&
            capability.resultReplayExpiresAt !== null &&
            capability.resultReplayExpiresAt > now
          ) {
            return this.idempotency.success(
              { capabilityId: capability.id },
              {
                ...(capability.consumedByUserId === null
                  ? {}
                  : { principalId: capability.consumedByUserId }),
                ...(capability.authSessionId === null
                  ? {}
                  : { authSessionId: capability.authSessionId }),
                resourceType: 'JOIN_CAPABILITY',
                resourceId: capability.id,
              },
            );
          }
          return this.idempotency.failure(
            new ApplicationError('AUTH_JOIN_CAPABILITY_ALREADY_USED', 409),
          );
        }
        if (capability.status === 'EXPIRED' || capability.expiresAt <= now) {
          return this.idempotency.failure(
            new ApplicationError('AUTH_JOIN_CAPABILITY_EXPIRED', 410),
          );
        }
        if (capability.status !== 'ACTIVE') {
          return this.idempotency.failure(
            new ApplicationError('AUTH_JOIN_CAPABILITY_INVALID', 401),
          );
        }

        const invite = await this.invites.findById(capability.courseInviteId, transaction);
        const section = await this.invites.lockClassSection(
          capability.organizationId,
          capability.classSectionId,
          transaction,
        );
        if (
          !invite || !permitsInviteCompletion(invite, capability.issuedAt, now) ||
          section?.status !== 'ACTIVE' ||
          !section.isEnrollmentOpen ||
          section.course.status !== 'ACTIVE' ||
          section.course.deletedAt !== null ||
          section.semester.status !== 'CURRENT' ||
          section.teacher.status !== 'ACTIVE' ||
          section.teacher.deletedAt !== null ||
          now > new Date(section.semester.endDate.getTime() + 86_400_000 - 1)
        ) {
          return this.idempotency.failure(
            new ApplicationError('COURSE_CLASS_SECTION_NOT_JOINABLE', 409),
          );
        }

        await requireUnsettledCourse(transaction, capability.organizationId, capability.classSectionId);
        const identity = this.crypto.decrypt<NormalizedStudentIdentity>(
          'join-identity-snapshot',
          capability.id,
          capability.encryptedIdentitySnapshot,
        );
        const fingerprint = this.crypto.identityFingerprint({
          organizationId: capability.organizationId,
          inviteId: capability.courseInviteId,
          ...identity,
        });
        if (fingerprint !== capability.identityFingerprint) {
          return this.idempotency.failure(
            new ApplicationError('AUTH_JOIN_CAPABILITY_INVALID', 401),
          );
        }
        const resolved = await this.identities.resolveOrCreate(
          capability.organizationId,
          identity,
          now,
          transaction,
        );
        const permanent = await this.enrollments.findForClassStudent(
          capability.classSectionId,
          resolved.profile.id,
          transaction,
        );
        if (permanent !== null) {
          return this.idempotency.failure(
            permanent.status === 'ACTIVE'
              ? new ApplicationError('ENROLLMENT_ALREADY_ACTIVE', 409)
              : new ApplicationError('ENROLLMENT_REJOIN_DISABLED', 409),
          );
        }
        const semesterActive = await this.enrollments.findActiveForSemesterStudent(
          capability.organizationId,
          section.semesterId,
          resolved.profile.id,
          transaction,
        );
        if (semesterActive !== null) {
          return this.idempotency.failure(
            new ApplicationError('ENROLLMENT_SEMESTER_CONFLICT', 409),
          );
        }

        const enrollment = EnrollmentEntity.create({
          id: this.ids.next(),
          organizationId: capability.organizationId,
          semesterId: section.semesterId,
          classSectionId: capability.classSectionId,
          studentId: resolved.profile.id,
          source: 'QR_CODE',
          sourceReferenceId: capability.courseInviteId,
          joinedAt: now,
          createdBy: resolved.user.id,
          updatedBy: resolved.user.id,
          createdAt: now,
          updatedAt: now,
        }).snapshot();
        await this.enrollments.create(enrollment, transaction);
        await this.enrollments.appendEvent(
          {
            id: this.ids.next(),
            organizationId: enrollment.organizationId,
            enrollmentId: enrollment.id,
            fromStatus: null,
            toStatus: 'ACTIVE',
            source: 'QR_JOIN',
            reason: null,
            actorUserId: resolved.user.id,
            actorRoleSnapshot: 'STUDENT',
            requestId: facts.requestId,
            idempotencyKeyReference: this.keyReference(idempotencyKey),
            occurredAt: now,
            enrollmentVersion: 1,
          },
          transaction,
        );
        const authSession = await this.auth.establishStudentSession(transaction, resolved.user, {
          requestId: facts.requestId,
          idempotencyKey,
          ...(facts.sourceIp === undefined ? {} : { sourceIp: facts.sourceIp }),
        });
        const view = await this.enrollments.findViewById(
          capability.organizationId,
          enrollment.id,
          transaction,
        );
        if (view === null) {
          return this.idempotency.failure(
            new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
              invariant: 'JOIN_ENROLLMENT_PROJECTION_REQUIRED',
            }),
          );
        }
        const result = projectJoinResult(view, authSession);
        const resultReplayExpiresAt = new Date(
          now.getTime() + this.config.qrJoinSecretReplaySeconds * 1_000,
        );
        const consumed = {
          ...capability,
          status: 'CONSUMED' as const,
          consumedAt: now,
          consumedByUserId: resolved.user.id,
          enrollmentId: enrollment.id,
          authSessionId: authSession.sessionId,
          resultCiphertext: this.crypto.encrypt('join-result-replay', capability.id, result),
          resultKeyVersion: this.crypto.keyVersion,
          resultReplayExpiresAt,
          consumedRequestId: facts.requestId,
          consumedIdempotencyKeyHash: keyHash,
          version: capability.version + 1,
        };
        if (!(await this.capabilities.consume(consumed, capability.version, transaction))) {
          return this.idempotency.failure(new ApplicationError('CONFLICT_VERSION_MISMATCH', 409));
        }

        await this.audit.append(transaction, {
          organizationId: enrollment.organizationId,
          actorUserId: resolved.user.id,
          actorRoleSnapshot: 'STUDENT',
          permissionId: 'ENROLLMENT-JOIN',
          actionType: 'ENROLLMENT_CREATED',
          targetType: 'ENROLLMENT',
          targetId: enrollment.id,
          requestId: facts.requestId,
          idempotencyKeyReference: this.keyReference(idempotencyKey),
          outcome: 'SUCCEEDED',
          safeMetadata: {
            classSectionId: enrollment.classSectionId,
            source: 'QR_CODE',
          },
          ...(facts.sourceIp === undefined ? {} : { sourceIp: facts.sourceIp }),
        });
        if (resolved.created) {
          await this.outbox.append(transaction, {
            organizationId: enrollment.organizationId,
            aggregateType: 'USER',
            aggregateId: resolved.user.id,
            eventType: 'STUDENT_IDENTITY_CREATED_V1',
            eventVersion: 1,
            payload: { userId: resolved.user.id, requestId: facts.requestId },
          });
        }
        await this.outbox.append(transaction, {
          organizationId: enrollment.organizationId,
          aggregateType: 'ENROLLMENT',
          aggregateId: enrollment.id,
          eventType: 'ENROLLMENT_CREATED_V1',
          eventVersion: 1,
          payload: {
            enrollmentId: enrollment.id,
            classSectionId: enrollment.classSectionId,
            source: 'QR_CODE',
            requestId: facts.requestId,
          },
        });
        return this.idempotency.success(
          { capabilityId: capability.id },
          {
            principalId: resolved.user.id,
            authSessionId: authSession.sessionId,
            resourceType: 'JOIN_CAPABILITY',
            resourceId: capability.id,
          },
        );
      },
    );
    return this.replay(reference.capabilityId, context, keyHash);
  }

  private async replay(
    capabilityId: string,
    context: JoinCapabilityPolicyContext,
    keyHash: string,
  ): Promise<JoinResultProjection> {
    const capability = await this.capabilities.findById(capabilityId);
    if (
      capability?.id !== context.capabilityId ||
      capability.organizationId !== context.organizationId ||
      capability.courseInviteId !== context.courseInviteId ||
      capability.identityFingerprint !== context.identityFingerprint ||
      capability.status !== 'CONSUMED' ||
      capability.consumedIdempotencyKeyHash !== keyHash ||
      capability.resultCiphertext === null ||
      capability.resultReplayExpiresAt === null ||
      capability.resultReplayExpiresAt <= this.clock.now()
    ) {
      throw new ApplicationError('AUTH_JOIN_CAPABILITY_ALREADY_USED', 409);
    }
    return this.crypto.decrypt<JoinResultProjection>(
      'join-result-replay',
      capability.id,
      capability.resultCiphertext,
    );
  }

  private keyReference(key: string): string {
    return this.digest.digest('idempotency-key-reference', key);
  }
}
