import { Inject, Injectable } from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service.js';
import type { RuntimeConfig } from '../../common/config/environment.js';
import { RUNTIME_CONFIG } from '../../common/config/runtime-config.module.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import {
  IdempotencyService,
  type IdempotentFailure,
  type IdempotencyStageOwner,
  type IdempotencyStageReservation,
} from '../../common/idempotency/idempotency.service.js';
import { OutboxService } from '../../common/outbox/outbox.service.js';
import { SecureDigestService } from '../../common/security/secure-digest.service.js';
import { Clock } from '../../common/time/clock.js';
import { IdGenerator } from '../../common/time/id-generator.js';
import {
  Prisma,
  type AccountRecoveryChallenge,
  type StudentSignInChallenge,
  type User,
} from '../../generated/prisma/client.js';
import { AuthService, type AuthProjection } from '../auth/auth.service.js';
import { PasswordHasherService } from '../auth/password-hasher.service.js';
import {
  attemptAuthChallengeVerification,
  type AuthChallengeSnapshot,
  type AuthChallengeStatus,
} from './auth-challenge.domain.js';
import { AuthCodeCrypto } from './auth-code.crypto.js';
import {
  AuthCodeDeliveryPort,
  AuthCodeDeliveryUnavailableError,
  type AuthCodeChannel,
  type AuthCodePurpose,
} from './auth-code-delivery.port.js';
import type {
  AccountRecoveryCompletionRequestDto,
  AccountRecoveryRequestDto,
  StudentSignInCodeRequestDto,
  StudentSignInCodeVerificationRequestDto,
} from './client-capabilities.dto.js';
import { evaluateDurableRateWindow } from './durable-rate-window.js';

const CODE_LENGTH = 6;
const CODE_TTL_MILLISECONDS = 10 * 60 * 1_000;
const MAX_CODE_ATTEMPTS = 5;
const AUTH_CODE_KEY_VERSION = 1;

interface PublicRequestContext {
  requestId: string;
  idempotencyKey: string | undefined;
  sourceIp?: string;
}

interface ChallengeStage {
  purpose: AuthCodePurpose;
  challengeId: string;
  organizationId: string;
  userId: string | null;
  requestedRole: 'STUDENT' | 'TEACHER' | 'ADMIN';
  recipient: string;
  channel: AuthCodeChannel;
  locale: 'zh-CN' | 'en';
  code: string;
  expiresAt: Date;
}

export interface StudentSignInCodeAcceptedProjection {
  challengeId: string;
  expiresAt: string;
}

export interface AccountRecoveryAcceptedProjection {
  recoveryId: string;
  expiresAt: string;
}

@Injectable()
export class ClientAuthenticationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly passwords: PasswordHasherService,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly digest: SecureDigestService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly crypto: AuthCodeCrypto,
    private readonly delivery: AuthCodeDeliveryPort,
    @Inject(RUNTIME_CONFIG) private readonly config: RuntimeConfig,
  ) {}

  async requestStudentSignInCode(
    input: StudentSignInCodeRequestDto,
    context: PublicRequestContext,
  ): Promise<StudentSignInCodeAcceptedProjection> {
    const organization = await this.resolveOrganization(input.organizationCode);
    const normalized = this.normalizeAccount(input.account);
    const accountDigest = this.accountDigest(input.channel, normalized);
    const user = await this.findUser(organization.id, normalized, 'STUDENT');
    const reservation = await this.reserveChallenge(
      'STUDENT_SIGN_IN',
      organization.id,
      user?.id ?? null,
      normalized,
      input.channel,
      input.locale,
      accountDigest,
      context,
    );
    if (reservation.kind === 'REPLAY') {
      return reservation.value;
    }
    return this.deliverStudentChallenge(reservation, context);
  }

  async verifyStudentSignInCode(
    input: StudentSignInCodeVerificationRequestDto,
    context: PublicRequestContext,
  ): Promise<AuthProjection> {
    const reference = await this.prisma.studentSignInChallenge.findUnique({
      where: { id: input.challengeId },
      select: { organizationId: true },
    });
    if (reference === null) throw this.invalidCode();
    return this.idempotency.execute(
      {
        organizationId: reference.organizationId,
        principalId: null,
        authSessionId: null,
        operationId: 'verifyStudentSignInCode',
        scope: `challenge:${input.challengeId}`,
        key: context.idempotencyKey,
        request: input,
        requestId: context.requestId,
      },
      async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM student_sign_in_challenges WHERE id = ${input.challengeId}::uuid FOR UPDATE`;
        const challenge = await transaction.studentSignInChallenge.findUnique({
          where: { id: input.challengeId },
          include: { user: true },
        });
        if (challenge?.organizationId !== reference.organizationId) {
          return this.idempotency.failure(this.invalidCode());
        }
        const attempted = attemptAuthChallengeVerification(
          this.snapshot(challenge),
          this.clock.now(),
          this.crypto.verifyCode(
            this.codeContext('STUDENT_SIGN_IN', challenge.id),
            input.code,
            challenge.codeDigest,
          ),
        );
        if (
          !attempted.accepted ||
          challenge.user?.role !== 'STUDENT' ||
          !['PENDING_CONTACT_BINDING', 'ACTIVE'].includes(challenge.user.status)
        ) {
          await this.updateStudentChallengeAttempt(transaction, challenge, attempted.next);
          return this.idempotency.failure(this.invalidCode());
        }
        const auth = await this.auth.establishStudentSession(transaction, challenge.user, {
          requestId: context.requestId,
          idempotencyKey: context.idempotencyKey ?? '',
          deviceIdHash: this.digest.digest('auth-device-id', input.deviceId),
          credentialType: 'OTP',
          permissionId: 'AUTH-STUDENT-CODE-VERIFY',
          ...(context.sourceIp === undefined ? {} : { sourceIp: context.sourceIp }),
        });
        await this.updateStudentChallengeAttempt(
          transaction,
          challenge,
          attempted.next,
          auth.sessionId,
        );
        await this.outbox.append(transaction, {
          organizationId: challenge.organizationId,
          aggregateType: 'STUDENT_SIGN_IN_CHALLENGE',
          aggregateId: challenge.id,
          eventType: 'STUDENT_SIGN_IN_CHALLENGE_CONSUMED',
          eventVersion: attempted.next.version,
          payload: {
            requestId: context.requestId,
            challengeId: challenge.id,
            authSessionId: auth.sessionId,
          },
        });
        return this.idempotency.success(auth, {
          principalId: challenge.user.id,
          authSessionId: auth.sessionId,
          resourceType: 'AUTH_SESSION',
          resourceId: auth.sessionId,
        });
      },
    );
  }

  async requestAccountRecovery(
    input: AccountRecoveryRequestDto,
    context: PublicRequestContext,
  ): Promise<AccountRecoveryAcceptedProjection> {
    const organization = await this.resolveOrganization(input.organizationCode);
    const recoveryMode = await this.prisma.systemPolicy.findUnique({
      where: { organizationId: organization.id },
    });
    if (input.requestedRole === 'TEACHER' && recoveryMode?.systemMode !== 'NORMAL')
      throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
    const normalized = this.normalizeAccount(input.account);
    const accountDigest = this.accountDigest(input.channel, normalized);
    const role = input.requestedRole as 'TEACHER' | 'ADMIN';
    const user = await this.findUser(organization.id, normalized, role);
    const reservation = await this.reserveRecoveryChallenge(
      organization.id,
      user?.id ?? null,
      role,
      normalized,
      input.channel,
      input.locale,
      accountDigest,
      context,
    );
    if (reservation.kind === 'REPLAY') {
      return reservation.value;
    }
    return this.deliverRecoveryChallenge(reservation, context);
  }

  async completeAccountRecovery(
    input: AccountRecoveryCompletionRequestDto,
    context: PublicRequestContext,
  ): Promise<null> {
    const reference = await this.prisma.accountRecoveryChallenge.findUnique({
      where: { id: input.recoveryId },
      select: { organizationId: true },
    });
    if (reference === null) throw this.invalidCode();
    const passwordHash = await this.passwords.hash(input.newPassword);
    return this.idempotency.execute(
      {
        organizationId: reference.organizationId,
        principalId: null,
        authSessionId: null,
        operationId: 'completeAccountRecovery',
        scope: `recovery:${input.recoveryId}`,
        key: context.idempotencyKey,
        request: input,
        requestId: context.requestId,
      },
      async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM account_recovery_challenges WHERE id = ${input.recoveryId}::uuid FOR UPDATE`;
        const challenge = await transaction.accountRecoveryChallenge.findUnique({
          where: { id: input.recoveryId },
          include: { user: true },
        });
        if (challenge?.organizationId !== reference.organizationId) {
          return this.idempotency.failure(this.invalidCode());
        }
        const recoveryMode = await transaction.systemPolicy.findUnique({
          where: { organizationId: challenge.organizationId },
        });
        if (challenge.requestedRole === 'TEACHER' && recoveryMode?.systemMode !== 'NORMAL')
          throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
        const attempted = attemptAuthChallengeVerification(
          this.snapshot(challenge),
          this.clock.now(),
          this.crypto.verifyCode(
            this.codeContext('ACCOUNT_RECOVERY', challenge.id),
            input.verificationCode,
            challenge.codeDigest,
          ),
        );
        const roleAllowed =
          challenge.requestedRole === 'TEACHER' || challenge.requestedRole === 'ADMIN';
        if (
          attempted.accepted &&
          roleAllowed &&
          challenge.user?.role === challenge.requestedRole &&
          challenge.user.deletedAt === null &&
          challenge.user.status === 'DISABLED'
        ) {
          await this.updateRecoveryChallengeAttempt(transaction, challenge, attempted.next);
          return this.idempotency.failure(new ApplicationError('AUTH_ACCOUNT_DISABLED', 403));
        }
        if (
          !attempted.accepted ||
          !roleAllowed ||
          challenge.user?.role !== challenge.requestedRole ||
          challenge.user.status !== 'ACTIVE' ||
          challenge.user.deletedAt !== null
        ) {
          await this.updateRecoveryChallengeAttempt(transaction, challenge, attempted.next);
          return this.idempotency.failure(this.invalidCode());
        }
        const now = this.clock.now();
        await this.updateRecoveryChallengeAttempt(transaction, challenge, attempted.next);
        await transaction.$executeRaw`INSERT INTO v81_account_security(user_id,organization_id,must_change_password,password_changed_at)
          VALUES(${challenge.user.id}::uuid,${challenge.organizationId}::uuid,false,${now}) ON CONFLICT(user_id) DO UPDATE SET must_change_password=false,password_changed_at=EXCLUDED.password_changed_at`;
        await transaction.$executeRaw`UPDATE v81_admin_access SET must_change_password=false,version=version+1 WHERE user_id=${challenge.user.id}::uuid AND must_change_password=true`;
        const updatedUser = await transaction.user.update({
          where: { id: challenge.user.id },
          data: {
            passwordHash,
            tokenVersion: { increment: 1 },
            version: { increment: 1 },
            updatedAt: now,
          },
        });
        await transaction.authSession.updateMany({
          where: {
            userId: challenge.user.id,
            organizationId: challenge.organizationId,
            status: 'ACTIVE',
          },
          data: {
            status: 'REVOKED',
            revokedAt: now,
            revokeReasonCode: 'CREDENTIAL_RECOVERED',
            version: { increment: 1 },
          },
        });
        await transaction.refreshToken.updateMany({
          where: {
            organizationId: challenge.organizationId,
            authSession: { userId: challenge.user.id },
            revokedAt: null,
          },
          data: { revokedAt: now },
        });
        await this.audit.append(transaction, {
          organizationId: challenge.organizationId,
          actorUserId: challenge.user.id,
          actorRoleSnapshot: challenge.requestedRole as 'TEACHER' | 'ADMIN',
          permissionId: 'AUTH-ACCOUNT-RECOVERY-COMPLETE',
          actionType: 'AUTH_CREDENTIAL_RECOVERED',
          targetType: 'USER',
          targetId: challenge.user.id,
          requestId: context.requestId,
          outcome: 'SUCCEEDED',
          safeMetadata: { requestedRole: challenge.requestedRole },
          ...(context.sourceIp === undefined ? {} : { sourceIp: context.sourceIp }),
        });
        await this.outbox.append(transaction, {
          organizationId: challenge.organizationId,
          aggregateType: 'USER',
          aggregateId: challenge.user.id,
          eventType: 'AUTH_CREDENTIAL_RECOVERED',
          eventVersion: updatedUser.version,
          payload: {
            requestId: context.requestId,
            userId: challenge.user.id,
            recoveryId: challenge.id,
          },
        });
        return this.idempotency.success(null, {
          principalId: challenge.user.id,
          resourceType: 'USER',
          resourceId: challenge.user.id,
        });
      },
    );
  }

  private async reserveChallenge(
    purpose: 'STUDENT_SIGN_IN',
    organizationId: string,
    userId: string | null,
    recipient: string,
    channelText: string,
    localeText: string,
    accountDigest: string,
    context: PublicRequestContext,
  ): Promise<IdempotencyStageReservation<ChallengeStage, StudentSignInCodeAcceptedProjection>> {
    const channel = channelText as AuthCodeChannel;
    const locale = localeText as 'zh-CN' | 'en';
    return this.idempotency.reserveStage<ChallengeStage, StudentSignInCodeAcceptedProjection>(
      {
        organizationId,
        principalId: userId,
        authSessionId: null,
        operationId: 'requestStudentSignInCode',
        scope: `${purpose}:${accountDigest}`,
        key: context.idempotencyKey,
        request: { organizationId, accountDigest, channel, locale },
        requestId: context.requestId,
      },
      async (transaction, stageContext) => {
        if (stageContext.isRecovery) return this.unrecoverableDeliveryFailure();
        const now = this.clock.now();
        const limited = await this.recordRateFacts(
          transaction,
          organizationId,
          purpose,
          accountDigest,
          context.sourceIp,
          now,
        );
        if (limited !== null) return limited;
        const challengeId = this.ids.next();
        const code = this.crypto.generateNumericCode(CODE_LENGTH);
        const expiresAt = new Date(now.getTime() + CODE_TTL_MILLISECONDS);
        await transaction.studentSignInChallenge.create({
          data: {
            id: challengeId,
            organizationId,
            userId,
            channel,
            locale,
            accountDigest,
            sourceIpDigest:
              context.sourceIp === undefined
                ? null
                : this.digest.digest('auth-code-source-ip', context.sourceIp),
            codeDigest: this.crypto.digestCode(this.codeContext(purpose, challengeId), code),
            codeKeyVersion: AUTH_CODE_KEY_VERSION,
            status: 'PENDING_DELIVERY',
            failedAttempts: 0,
            maxAttempts: MAX_CODE_ATTEMPTS,
            requestedAt: now,
            expiresAt,
            requestId: context.requestId,
          },
        });
        return this.idempotency.stage(
          {
            purpose,
            challengeId,
            organizationId,
            userId,
            requestedRole: 'STUDENT',
            recipient,
            channel,
            locale,
            code,
            expiresAt,
          },
          {
            resourceType: 'STUDENT_SIGN_IN_CHALLENGE',
            resourceId: challengeId,
            ...(userId === null ? {} : { principalId: userId }),
          },
        );
      },
    );
  }

  private async reserveRecoveryChallenge(
    organizationId: string,
    userId: string | null,
    requestedRole: 'TEACHER' | 'ADMIN',
    recipient: string,
    channelText: string,
    localeText: string,
    accountDigest: string,
    context: PublicRequestContext,
  ): Promise<IdempotencyStageReservation<ChallengeStage, AccountRecoveryAcceptedProjection>> {
    const purpose = 'ACCOUNT_RECOVERY' as const;
    const channel = channelText as AuthCodeChannel;
    const locale = localeText as 'zh-CN' | 'en';
    return this.idempotency.reserveStage<ChallengeStage, AccountRecoveryAcceptedProjection>(
      {
        organizationId,
        principalId: userId,
        authSessionId: null,
        operationId: 'requestAccountRecovery',
        scope: `${purpose}:${requestedRole}:${accountDigest}`,
        key: context.idempotencyKey,
        request: { organizationId, accountDigest, requestedRole, channel, locale },
        requestId: context.requestId,
      },
      async (transaction, stageContext) => {
        if (stageContext.isRecovery) return this.unrecoverableDeliveryFailure();
        const now = this.clock.now();
        const limited = await this.recordRateFacts(
          transaction,
          organizationId,
          purpose,
          accountDigest,
          context.sourceIp,
          now,
        );
        if (limited !== null) return limited;
        const challengeId = this.ids.next();
        const code = this.crypto.generateNumericCode(CODE_LENGTH);
        const expiresAt = new Date(now.getTime() + CODE_TTL_MILLISECONDS);
        await transaction.accountRecoveryChallenge.create({
          data: {
            id: challengeId,
            organizationId,
            userId,
            requestedRole,
            channel,
            locale,
            accountDigest,
            sourceIpDigest:
              context.sourceIp === undefined
                ? null
                : this.digest.digest('auth-code-source-ip', context.sourceIp),
            codeDigest: this.crypto.digestCode(this.codeContext(purpose, challengeId), code),
            codeKeyVersion: AUTH_CODE_KEY_VERSION,
            status: 'PENDING_DELIVERY',
            failedAttempts: 0,
            maxAttempts: MAX_CODE_ATTEMPTS,
            requestedAt: now,
            expiresAt,
            requestId: context.requestId,
          },
        });
        return this.idempotency.stage(
          {
            purpose,
            challengeId,
            organizationId,
            userId,
            requestedRole,
            recipient,
            channel,
            locale,
            code,
            expiresAt,
          },
          {
            resourceType: 'ACCOUNT_RECOVERY_CHALLENGE',
            resourceId: challengeId,
            ...(userId === null ? {} : { principalId: userId }),
          },
        );
      },
    );
  }

  private async deliverStudentChallenge(
    owner: IdempotencyStageOwner<ChallengeStage>,
    context: PublicRequestContext,
  ): Promise<StudentSignInCodeAcceptedProjection> {
    try {
      await this.deliver(owner.value);
    } catch (error: unknown) {
      return this.failStudentDelivery(owner, error);
    }
    return this.idempotency.completeStage(owner, async (transaction) => {
      await this.activateStudentChallenge(transaction, owner.value, context);
      return this.idempotency.success(
        { challengeId: owner.value.challengeId, expiresAt: owner.value.expiresAt.toISOString() },
        {
          ...(owner.value.userId === null ? {} : { principalId: owner.value.userId }),
          resourceType: 'STUDENT_SIGN_IN_CHALLENGE',
          resourceId: owner.value.challengeId,
        },
      );
    });
  }

  private async deliverRecoveryChallenge(
    owner: IdempotencyStageOwner<ChallengeStage>,
    context: PublicRequestContext,
  ): Promise<AccountRecoveryAcceptedProjection> {
    try {
      await this.deliver(owner.value);
    } catch (error: unknown) {
      return this.failRecoveryDelivery(owner, error);
    }
    return this.idempotency.completeStage(owner, async (transaction) => {
      await this.activateRecoveryChallenge(transaction, owner.value, context);
      return this.idempotency.success(
        { recoveryId: owner.value.challengeId, expiresAt: owner.value.expiresAt.toISOString() },
        {
          ...(owner.value.userId === null ? {} : { principalId: owner.value.userId }),
          resourceType: 'ACCOUNT_RECOVERY_CHALLENGE',
          resourceId: owner.value.challengeId,
        },
      );
    });
  }

  private deliver(stage: ChallengeStage): Promise<void> {
    return this.delivery.deliver({
      deliveryId: stage.challengeId,
      purpose: stage.purpose,
      channel: stage.channel,
      recipient: stage.recipient,
      locale: stage.locale,
      code: stage.code,
      expiresAt: stage.expiresAt,
    });
  }

  private async failStudentDelivery(
    owner: IdempotencyStageOwner<ChallengeStage>,
    error: unknown,
  ): Promise<never> {
    return this.idempotency.completeStage(owner, async (transaction) => {
      await transaction.studentSignInChallenge.update({
        where: { id: owner.value.challengeId },
        data: { status: 'DELIVERY_FAILED', version: { increment: 1 } },
      });
      return this.idempotency.failure(this.deliveryError(error));
    });
  }

  private async failRecoveryDelivery(
    owner: IdempotencyStageOwner<ChallengeStage>,
    error: unknown,
  ): Promise<never> {
    return this.idempotency.completeStage(owner, async (transaction) => {
      await transaction.accountRecoveryChallenge.update({
        where: { id: owner.value.challengeId },
        data: { status: 'DELIVERY_FAILED', version: { increment: 1 } },
      });
      return this.idempotency.failure(this.deliveryError(error));
    });
  }

  private async activateStudentChallenge(
    transaction: Prisma.TransactionClient,
    stage: ChallengeStage,
    context: PublicRequestContext,
  ): Promise<void> {
    const now = this.clock.now();
    await transaction.studentSignInChallenge.update({
      where: { id: stage.challengeId },
      data: {
        status: now >= stage.expiresAt ? 'EXPIRED' : 'ACTIVE',
        deliveredAt: now,
        version: { increment: 1 },
      },
    });
    await this.recordChallengeIssued(transaction, stage, context, 'AUTH-STUDENT-CODE-REQUEST');
  }

  private async activateRecoveryChallenge(
    transaction: Prisma.TransactionClient,
    stage: ChallengeStage,
    context: PublicRequestContext,
  ): Promise<void> {
    const now = this.clock.now();
    await transaction.accountRecoveryChallenge.update({
      where: { id: stage.challengeId },
      data: {
        status: now >= stage.expiresAt ? 'EXPIRED' : 'ACTIVE',
        deliveredAt: now,
        version: { increment: 1 },
      },
    });
    await this.recordChallengeIssued(transaction, stage, context, 'AUTH-ACCOUNT-RECOVERY-REQUEST');
  }

  private async recordChallengeIssued(
    transaction: Prisma.TransactionClient,
    stage: ChallengeStage,
    context: PublicRequestContext,
    permissionId: string,
  ): Promise<void> {
    await this.audit.append(transaction, {
      organizationId: stage.organizationId,
      actorUserId: stage.userId,
      actorRoleSnapshot:
        stage.userId !== null ? stage.requestedRole : null,
      permissionId,
      actionType: 'AUTH_CHALLENGE_ISSUED',
      targetType:
        stage.purpose === 'STUDENT_SIGN_IN'
          ? 'STUDENT_SIGN_IN_CHALLENGE'
          : 'ACCOUNT_RECOVERY_CHALLENGE',
      targetId: stage.challengeId,
      requestId: context.requestId,
      outcome: 'SUCCEEDED',
      safeMetadata: { challengePurpose: stage.purpose, deliveryChannel: stage.channel },
      ...(context.sourceIp === undefined ? {} : { sourceIp: context.sourceIp }),
    });
    await this.outbox.append(transaction, {
      organizationId: stage.organizationId,
      aggregateType:
        stage.purpose === 'STUDENT_SIGN_IN'
          ? 'STUDENT_SIGN_IN_CHALLENGE'
          : 'ACCOUNT_RECOVERY_CHALLENGE',
      aggregateId: stage.challengeId,
      eventType: 'AUTH_CHALLENGE_ISSUED',
      eventVersion: 2,
      payload: {
        requestId: context.requestId,
        challengeId: stage.challengeId,
        purpose: stage.purpose,
      },
    });
  }

  private async recordRateFacts(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    purpose: AuthCodePurpose,
    accountDigest: string,
    sourceIp: string | undefined,
    now: Date,
  ): Promise<IdempotentFailure | null> {
    const scopes = [
      { scopeType: 'ACCOUNT', scopeDigest: accountDigest },
      {
        scopeType: 'SOURCE',
        scopeDigest: this.digest.digest('auth-code-source-ip', sourceIp ?? 'unavailable'),
      },
    ];
    for (const scope of scopes) {
      const attempts = await transaction.authRateLimitFact.findMany({
        where: {
          organizationId,
          purpose,
          scopeType: scope.scopeType,
          scopeDigest: scope.scopeDigest,
        },
        orderBy: { occurredAt: 'desc' },
        take: this.config.authRateLimitMaxAttempts,
        select: { occurredAt: true },
      });
      const decision = evaluateDurableRateWindow(
        attempts.map(({ occurredAt }) => occurredAt),
        now,
        {
          windowSeconds: this.config.authRateLimitWindowSeconds,
          limit: this.config.authRateLimitMaxAttempts,
        },
      );
      if (!decision.allowed) {
        return this.idempotency.failure(
          new ApplicationError('AUTH_RATE_LIMITED', 429, {
            retryAfterSeconds: decision.retryAfterSeconds,
          }),
        );
      }
    }
    await transaction.authRateLimitFact.createMany({
      data: scopes.map((scope) => ({
        id: this.ids.next(),
        organizationId,
        purpose,
        ...scope,
        occurredAt: now,
      })),
    });
    return null;
  }

  private async resolveOrganization(organizationCode: string): Promise<{ id: string }> {
    const organization = await this.prisma.organization.findUnique({
      where: { organizationCode },
      select: { id: true, status: true },
    });
    if (organization?.status !== 'ACTIVE')
      throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    return organization;
  }

  private findUser(
    organizationId: string,
    account: string,
    role: 'STUDENT' | 'TEACHER' | 'ADMIN',
  ): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: {
        organizationId,
        role,
        status:
          role === 'STUDENT'
            ? { in: ['PENDING_CONTACT_BINDING', 'ACTIVE'] }
            : { in: ['ACTIVE', 'DISABLED'] },
        deletedAt: null,
        primaryEmailNormalized: account,
        ...(role === 'ADMIN'
          ? { OR: [{ emailVerifiedAt: { not: null } }, { emailIdentityScope: 'SUBADMIN' }] }
          : { emailVerifiedAt: { not: null } }),
      },
    });
  }

  private normalizeAccount(account: string): string {
    const normalized = account.trim().toLowerCase();
    if (normalized.length < 1 || normalized.length > 254)
      throw new ApplicationError('VALIDATION_FORMAT_INVALID', 422);
    return normalized;
  }

  private accountDigest(channel: string, normalized: string): string {
    return this.digest.digest('auth-code-account', `${channel}\0${normalized}`);
  }

  private codeContext(purpose: AuthCodePurpose, challengeId: string): string {
    return `${purpose}:${challengeId}`;
  }

  private snapshot(
    challenge: StudentSignInChallenge | AccountRecoveryChallenge,
  ): AuthChallengeSnapshot {
    return {
      status: challenge.status as AuthChallengeStatus,
      failedAttempts: challenge.failedAttempts,
      maxAttempts: challenge.maxAttempts,
      expiresAt: challenge.expiresAt,
      deliveredAt: challenge.deliveredAt,
      consumedAt: challenge.consumedAt,
      version: challenge.version,
    };
  }

  private async updateStudentChallengeAttempt(
    transaction: Prisma.TransactionClient,
    current: StudentSignInChallenge,
    next: AuthChallengeSnapshot,
    authSessionId?: string,
  ): Promise<void> {
    const result = await transaction.studentSignInChallenge.updateMany({
      where: { id: current.id, version: current.version },
      data: {
        status: next.status,
        failedAttempts: next.failedAttempts,
        deliveredAt: next.deliveredAt,
        consumedAt: next.consumedAt,
        version: next.version,
        ...(authSessionId === undefined ? {} : { authSessionId }),
      },
    });
    if (result.count !== 1) throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
  }

  private async updateRecoveryChallengeAttempt(
    transaction: Prisma.TransactionClient,
    current: AccountRecoveryChallenge,
    next: AuthChallengeSnapshot,
  ): Promise<void> {
    const result = await transaction.accountRecoveryChallenge.updateMany({
      where: { id: current.id, version: current.version },
      data: {
        status: next.status,
        failedAttempts: next.failedAttempts,
        deliveredAt: next.deliveredAt,
        consumedAt: next.consumedAt,
        version: next.version,
      },
    });
    if (result.count !== 1) throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
  }

  private invalidCode(): ApplicationError {
    return new ApplicationError('AUTH_VERIFICATION_CODE_INVALID', 401);
  }

  private deliveryError(error: unknown): ApplicationError {
    if (error instanceof AuthCodeDeliveryUnavailableError)
      return new ApplicationError('SYSTEM_SERVICE_UNAVAILABLE', 503);
    return new ApplicationError('SYSTEM_SERVICE_UNAVAILABLE', 503);
  }

  private unrecoverableDeliveryFailure(): IdempotentFailure {
    return this.idempotency.failure(
      new ApplicationError('SYSTEM_SERVICE_UNAVAILABLE', 503, {
        reason: 'AUTH_CODE_DELIVERY_RETRY_REQUIRED',
      }),
    );
  }
}
