import { Injectable } from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';
import {
  IdempotencyService,
  type IdempotencyStageOwner,
  type IdempotencyStageReservation,
} from '../../common/idempotency/idempotency.service.js';
import { OutboxService } from '../../common/outbox/outbox.service.js';
import { SecureDigestService } from '../../common/security/secure-digest.service.js';
import { Clock } from '../../common/time/clock.js';
import { IdGenerator } from '../../common/time/id-generator.js';
import { AuthCodeCrypto } from '../client-capabilities/auth-code.crypto.js';
import {
  AuthCodeDeliveryPort,
  AuthCodeDeliveryUnavailableError,
} from '../client-capabilities/auth-code-delivery.port.js';
import type {
  EmailVerificationChallengeRequestDto,
  VerifyEmailChallengeRequestDto,
} from './users.dto.js';

const CODE_LENGTH = 6;
const CODE_TTL_MILLISECONDS = 10 * 60 * 1_000;
const MAX_CODE_ATTEMPTS = 5;
const MAX_REQUESTS_PER_WINDOW = 5;
const REQUEST_WINDOW_MILLISECONDS = 10 * 60 * 1_000;
const AUTH_CODE_KEY_VERSION = 1;

interface RequestFacts {
  requestId: string;
  idempotencyKey: string | undefined;
}

interface EmailChallengeStage {
  challengeId: string;
  organizationId: string;
  userId: string;
  mode: 'FIRST_BIND' | 'REBIND';
  locale: 'zh-CN' | 'en';
  currentEmail: string | null;
  targetEmail: string;
  currentEmailCode: string | null;
  newEmailCode: string;
  expiresAt: Date;
}

export interface EmailVerificationChallengeProjection {
  challengeId: string;
  mode: 'FIRST_BIND' | 'REBIND';
  expiresAt: string;
}

@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly digest: SecureDigestService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly crypto: AuthCodeCrypto,
    private readonly delivery: AuthCodeDeliveryPort,
  ) {}

  async requestChallenge(
    principal: AuthenticatedPrincipal,
    input: EmailVerificationChallengeRequestDto,
    facts: RequestFacts,
  ): Promise<EmailVerificationChallengeProjection> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: principal.userId,
        organizationId: principal.organizationId,
        deletedAt: null,
      },
    });
    if (user === null) throw new ApplicationError('USER_NOT_FOUND', 404);
    if (user.version !== input.expectedVersion) {
      throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409, {
        expectedVersion: input.expectedVersion,
        actualVersion: user.version,
      });
    }
    if (!['PENDING_CONTACT_BINDING', 'ACTIVE'].includes(user.status)) {
      throw new ApplicationError('USER_STATUS_NOT_ACTIVE', 409, { currentState: user.status });
    }

    const targetEmail = input.email.trim();
    const targetEmailNormalized = targetEmail.toLowerCase();
    if (principal.role === 'STUDENT' && !targetEmailNormalized.includes('bnbu')) {
      throw new ApplicationError('VALIDATION_FAILED', 422, {
        fieldErrors: [{ field: 'email', code: 'BNBU_EMAIL_REQUIRED', i18nKey: 'error.validation.failed', params: {} }],
      });
    }
    const mode = user.emailVerifiedAt === null ? 'FIRST_BIND' : 'REBIND';
    if (mode === 'REBIND' && user.primaryEmailNormalized === targetEmailNormalized) {
      throw new ApplicationError('CONFLICT_RESOURCE_ALREADY_EXISTS', 409, {
        resourceType: 'VERIFIED_EMAIL',
      });
    }
    const occupied = await this.prisma.user.findFirst({
      where: {
        organizationId: principal.organizationId,
        primaryEmailNormalized: targetEmailNormalized,
        emailIdentityScope: 'PRIMARY',
        id: { not: principal.userId },
        deletedAt: null,
      },
      select: { id: true },
    });
    if (occupied !== null) {
      throw new ApplicationError('CONFLICT_RESOURCE_ALREADY_EXISTS', 409, {
        resourceType: 'VERIFIED_EMAIL',
      });
    }

    const reservation = await this.reserveChallenge(
      principal,
      user,
      targetEmail,
      targetEmailNormalized,
      mode,
      input.locale as 'zh-CN' | 'en',
      facts,
    );
    if (reservation.kind === 'REPLAY') return reservation.value;
    return this.deliverChallenge(reservation, facts);
  }

  async verifyChallenge(
    principal: AuthenticatedPrincipal,
    challengeId: string,
    input: VerifyEmailChallengeRequestDto,
    facts: RequestFacts,
  ): Promise<void> {
    await this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'verifyCurrentUserEmailChallenge',
        scope: `email-verification:${challengeId}`,
        key: facts.idempotencyKey,
        request: {
          challengeId,
          currentCodeDigest:
            input.currentEmailCode === undefined
              ? null
              : this.digest.digest('email-verification-code-proof', input.currentEmailCode),
          newCodeDigest: this.digest.digest('email-verification-code-proof', input.newEmailCode),
        },
        requestId: facts.requestId,
      },
      async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM email_verification_challenges WHERE id = ${challengeId}::uuid FOR UPDATE`;
        await transaction.$queryRaw`SELECT id FROM users WHERE id = ${principal.userId}::uuid FOR UPDATE`;
        const challenge = await transaction.emailVerificationChallenge.findFirst({
          where: {
            id: challengeId,
            organizationId: principal.organizationId,
            userId: principal.userId,
          },
          include: { user: true },
        });
        if (challenge === null) {
          return this.idempotency.failure(this.invalidCode());
        }

        const now = this.clock.now();
        const active = challenge.status === 'ACTIVE' && challenge.expiresAt > now;
        const currentAccepted =
          challenge.mode === 'FIRST_BIND'
            ? input.currentEmailCode === undefined
            : input.currentEmailCode !== undefined &&
              challenge.currentEmailCodeDigest !== null &&
              this.crypto.verifyCode(
                this.codeContext('CURRENT', challenge.id),
                input.currentEmailCode,
                challenge.currentEmailCodeDigest,
              );
        const newAccepted = this.crypto.verifyCode(
          this.codeContext('NEW', challenge.id),
          input.newEmailCode,
          challenge.newEmailCodeDigest,
        );
        if (!active || !currentAccepted || !newAccepted) {
          const failedAttempts = Math.min(challenge.failedAttempts + 1, challenge.maxAttempts);
          await transaction.emailVerificationChallenge.update({
            where: { id: challenge.id },
            data: {
              status:
                challenge.expiresAt <= now
                  ? 'EXPIRED'
                  : failedAttempts >= challenge.maxAttempts
                    ? 'LOCKED'
                    : challenge.status,
              failedAttempts,
              version: { increment: 1 },
            },
          });
          return this.idempotency.failure(this.invalidCode());
        }
        if (challenge.user.version !== challenge.expectedUserVersion) {
          return this.idempotency.failure(
            new ApplicationError('CONFLICT_VERSION_MISMATCH', 409, {
              expectedVersion: challenge.expectedUserVersion,
              actualVersion: challenge.user.version,
            }),
          );
        }
        if (!['PENDING_CONTACT_BINDING', 'ACTIVE'].includes(challenge.user.status)) {
          return this.idempotency.failure(
            new ApplicationError('USER_STATUS_NOT_ACTIVE', 409, {
              currentState: challenge.user.status,
            }),
          );
        }
        const occupied = await transaction.user.findFirst({
          where: {
            organizationId: principal.organizationId,
            primaryEmailNormalized: challenge.targetEmailNormalized,
            emailIdentityScope: 'PRIMARY',
            id: { not: principal.userId },
            deletedAt: null,
          },
          select: { id: true },
        });
        if (occupied !== null) {
          return this.idempotency.failure(
            new ApplicationError('CONFLICT_RESOURCE_ALREADY_EXISTS', 409, {
              resourceType: 'VERIFIED_EMAIL',
            }),
          );
        }

        const updatedUser = await transaction.user.update({
          where: { id: principal.userId },
          data: {
            primaryEmail: challenge.targetEmail,
            primaryEmailNormalized: challenge.targetEmailNormalized,
            emailVerifiedAt: now,
            ...(challenge.user.status === 'PENDING_CONTACT_BINDING' ? { status: 'ACTIVE' } : {}),
            version: { increment: 1 },
            updatedAt: now,
          },
        });
        await transaction.emailVerificationChallenge.update({
          where: { id: challenge.id },
          data: { status: 'CONSUMED', consumedAt: now, version: { increment: 1 } },
        });

        const otherSessions = await transaction.authSession.findMany({
          where: {
            userId: principal.userId,
            organizationId: principal.organizationId,
            id: { not: principal.sessionId },
            status: 'ACTIVE',
          },
          select: { id: true },
        });
        const otherSessionIds = otherSessions.map((session) => session.id);
        if (otherSessionIds.length > 0) {
          await transaction.authSession.updateMany({
            where: { id: { in: otherSessionIds } },
            data: {
              status: 'REVOKED',
              revokedAt: now,
              revokeReasonCode: 'EMAIL_REBOUND',
              version: { increment: 1 },
            },
          });
          await transaction.refreshToken.updateMany({
            where: { authSessionId: { in: otherSessionIds }, revokedAt: null },
            data: { revokedAt: now },
          });
        }

        await this.audit.append(transaction, {
          organizationId: principal.organizationId,
          actorUserId: principal.userId,
          actorRoleSnapshot: principal.role,
          permissionId: 'USER-EMAIL-VERIFY',
          actionType: 'USER_PROFILE_UPDATED',
          targetType: 'USER',
          targetId: principal.userId,
          requestId: facts.requestId,
          idempotencyKeyReference: this.digest.digest(
            'idempotency-key-reference',
            facts.idempotencyKey ?? '',
          ),
          outcome: 'SUCCEEDED',
          safeMetadata: {
            changedFields: ['primaryEmail', 'emailVerifiedAt', 'status'],
          },
        });
        await this.outbox.append(transaction, {
          organizationId: principal.organizationId,
          aggregateType: 'USER',
          aggregateId: principal.userId,
          eventType: 'USER_EMAIL_VERIFIED_V1',
          eventVersion: updatedUser.version,
          payload: {
            requestId: facts.requestId,
            userId: principal.userId,
            challengeId: challenge.id,
            otherSessionsRevoked: otherSessionIds.length,
          },
        });
        return this.idempotency.success(undefined, {
          principalId: principal.userId,
          authSessionId: principal.sessionId,
          resourceType: 'USER',
          resourceId: principal.userId,
        });
      },
    );
  }

  private reserveChallenge(
    principal: AuthenticatedPrincipal,
    user: {
      id: string;
      organizationId: string;
      primaryEmail: string | null;
      primaryEmailNormalized: string | null;
      emailVerifiedAt: Date | null;
      version: number;
    },
    targetEmail: string,
    targetEmailNormalized: string,
    mode: 'FIRST_BIND' | 'REBIND',
    locale: 'zh-CN' | 'en',
    facts: RequestFacts,
  ): Promise<
    IdempotencyStageReservation<EmailChallengeStage, EmailVerificationChallengeProjection>
  > {
    const targetDigest = this.digest.digest('email-verification-target', targetEmailNormalized);
    return this.idempotency.reserveStage(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'requestCurrentUserEmailChallenge',
        scope: `email-verification:${principal.userId}`,
        key: facts.idempotencyKey,
        request: { targetDigest, mode, locale, expectedVersion: user.version },
        requestId: facts.requestId,
      },
      async (transaction, stageContext) => {
        if (stageContext.isRecovery) {
          return this.idempotency.failure(
            new ApplicationError('SYSTEM_SERVICE_UNAVAILABLE', 503, {
              reason: 'EMAIL_VERIFICATION_DELIVERY_RETRY_REQUIRED',
            }),
          );
        }
        const now = this.clock.now();
        const recentCount = await transaction.emailVerificationChallenge.count({
          where: {
            organizationId: principal.organizationId,
            userId: principal.userId,
            requestedAt: { gte: new Date(now.getTime() - REQUEST_WINDOW_MILLISECONDS) },
          },
        });
        if (recentCount >= MAX_REQUESTS_PER_WINDOW) {
          return this.idempotency.failure(
            new ApplicationError('AUTH_RATE_LIMITED', 429, {
              retryAfterSeconds: Math.ceil(REQUEST_WINDOW_MILLISECONDS / 1_000),
            }),
          );
        }
        if (mode === 'REBIND' && (user.primaryEmail === null || user.emailVerifiedAt === null)) {
          return this.idempotency.failure(
            new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
              invariant: 'CURRENT_VERIFIED_EMAIL_REQUIRED_FOR_REBIND',
            }),
          );
        }
        const challengeId = this.ids.next();
        const currentEmailCode =
          mode === 'REBIND' ? this.crypto.generateNumericCode(CODE_LENGTH) : null;
        const newEmailCode = this.crypto.generateNumericCode(CODE_LENGTH);
        const expiresAt = new Date(now.getTime() + CODE_TTL_MILLISECONDS);
        await transaction.emailVerificationChallenge.create({
          data: {
            id: challengeId,
            organizationId: principal.organizationId,
            userId: principal.userId,
            mode,
            locale,
            targetEmail,
            targetEmailNormalized,
            currentEmailCodeDigest:
              currentEmailCode === null
                ? null
                : this.crypto.digestCode(
                    this.codeContext('CURRENT', challengeId),
                    currentEmailCode,
                  ),
            newEmailCodeDigest: this.crypto.digestCode(
              this.codeContext('NEW', challengeId),
              newEmailCode,
            ),
            codeKeyVersion: AUTH_CODE_KEY_VERSION,
            status: 'PENDING_DELIVERY',
            failedAttempts: 0,
            maxAttempts: MAX_CODE_ATTEMPTS,
            expectedUserVersion: user.version,
            requestedAt: now,
            expiresAt,
            requestId: facts.requestId,
          },
        });
        return this.idempotency.stage(
          {
            challengeId,
            organizationId: principal.organizationId,
            userId: principal.userId,
            mode,
            locale,
            currentEmail: user.primaryEmail,
            targetEmail,
            currentEmailCode,
            newEmailCode,
            expiresAt,
          },
          {
            principalId: principal.userId,
            authSessionId: principal.sessionId,
            resourceType: 'EMAIL_VERIFICATION_CHALLENGE',
            resourceId: challengeId,
          },
        );
      },
    );
  }

  private async deliverChallenge(
    owner: IdempotencyStageOwner<EmailChallengeStage>,
    facts: RequestFacts,
  ): Promise<EmailVerificationChallengeProjection> {
    try {
      if (owner.value.mode === 'REBIND') {
        await this.delivery.deliver({
          deliveryId: `${owner.value.challengeId}:current`,
          purpose: 'EMAIL_REBIND_CURRENT',
          channel: 'EMAIL',
          recipient: owner.value.currentEmail ?? '',
          locale: owner.value.locale,
          code: owner.value.currentEmailCode ?? '',
          expiresAt: owner.value.expiresAt,
        });
      }
      await this.delivery.deliver({
        deliveryId: `${owner.value.challengeId}:new`,
        purpose: owner.value.mode === 'FIRST_BIND' ? 'EMAIL_FIRST_BIND' : 'EMAIL_REBIND_NEW',
        channel: 'EMAIL',
        recipient: owner.value.targetEmail,
        locale: owner.value.locale,
        code: owner.value.newEmailCode,
        expiresAt: owner.value.expiresAt,
      });
    } catch (error: unknown) {
      return this.failDelivery(owner, error);
    }
    return this.idempotency.completeStage(owner, async (transaction) => {
      const now = this.clock.now();
      await transaction.emailVerificationChallenge.update({
        where: { id: owner.value.challengeId },
        data: {
          status: now >= owner.value.expiresAt ? 'EXPIRED' : 'ACTIVE',
          deliveredAt: now,
          version: { increment: 1 },
        },
      });
      await this.outbox.append(transaction, {
        organizationId: owner.value.organizationId,
        aggregateType: 'EMAIL_VERIFICATION_CHALLENGE',
        aggregateId: owner.value.challengeId,
        eventType: 'EMAIL_VERIFICATION_CHALLENGE_ISSUED_V1',
        eventVersion: 2,
        payload: {
          requestId: facts.requestId,
          challengeId: owner.value.challengeId,
          userId: owner.value.userId,
          mode: owner.value.mode,
        },
      });
      return this.idempotency.success(
        {
          challengeId: owner.value.challengeId,
          mode: owner.value.mode,
          expiresAt: owner.value.expiresAt.toISOString(),
        },
        {
          principalId: owner.value.userId,
          resourceType: 'EMAIL_VERIFICATION_CHALLENGE',
          resourceId: owner.value.challengeId,
        },
      );
    });
  }

  private async failDelivery(
    owner: IdempotencyStageOwner<EmailChallengeStage>,
    error: unknown,
  ): Promise<never> {
    return this.idempotency.completeStage(owner, async (transaction) => {
      await transaction.emailVerificationChallenge.update({
        where: { id: owner.value.challengeId },
        data: { status: 'FAILED', version: { increment: 1 } },
      });
      return this.idempotency.failure(
        new ApplicationError('SYSTEM_SERVICE_UNAVAILABLE', 503, {
          reason:
            error instanceof AuthCodeDeliveryUnavailableError
              ? 'EMAIL_DELIVERY_NOT_CONFIGURED'
              : 'EMAIL_DELIVERY_FAILED',
        }),
      );
    });
  }

  private codeContext(target: 'CURRENT' | 'NEW', challengeId: string): string {
    return `EMAIL_VERIFICATION:${target}:${challengeId}`;
  }

  private invalidCode(): ApplicationError {
    return new ApplicationError('AUTH_VERIFICATION_CODE_INVALID', 401);
  }
}
