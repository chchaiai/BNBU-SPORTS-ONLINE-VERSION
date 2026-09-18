import { randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service.js';
import type { RuntimeConfig } from '../../common/config/environment.js';
import { RUNTIME_CONFIG } from '../../common/config/runtime-config.module.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import type { AuthenticatedPrincipal, UserRole } from '../../common/http/request-context.js';
import {
  IdempotencyService,
  type IdempotentOutcome,
} from '../../common/idempotency/idempotency.service.js';
import { OutboxService } from '../../common/outbox/outbox.service.js';
import { RateLimitPort } from '../../common/rate-limit/rate-limit.port.js';
import { SecureDigestService } from '../../common/security/secure-digest.service.js';
import { Clock } from '../../common/time/clock.js';
import { IdGenerator } from '../../common/time/id-generator.js';
import { Prisma } from '../../generated/prisma/client.js';
import { projectUser, type UserProjection } from '../users/user-projection.js';
import type { LogoutRequest, PasswordLoginRequest, RefreshRequest } from './auth.dto.js';
import { PasswordHasherService } from './password-hasher.service.js';
import { TokenService } from './token.service.js';

const LOGIN_PERMISSION = 'AUTH-PASSWORD-LOGIN';
const REFRESH_PERMISSION = 'AUTH-REFRESH';
const LOGOUT_PERMISSION = 'AUTH-LOGOUT';

export interface AuthProjection {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  user: UserProjection;
}

interface RequestFacts {
  requestId: string;
  idempotencyKey: string | undefined;
  sourceIp?: string;
}

export interface EstablishStudentSessionFacts {
  requestId: string;
  idempotencyKey: string;
  sourceIp?: string;
  deviceIdHash?: string;
  credentialType?: 'QR_JOIN' | 'OTP';
  permissionId?: 'ENROLLMENT-JOIN' | 'AUTH-STUDENT-CODE-VERIFY';
}

interface StudentSessionUser {
  id: string;
  organizationId: string;
  role: string;
  status: string;
  primaryEmail: string | null;
  emailVerifiedAt: Date | null;
  tokenVersion: number;
  version: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordHasherService,
    private readonly tokens: TokenService,
    private readonly rateLimits: RateLimitPort,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly digest: SecureDigestService,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
    @Inject(RUNTIME_CONFIG) private readonly config: RuntimeConfig,
  ) {}

  async establishStudentSession(
    transaction: Prisma.TransactionClient,
    user: StudentSessionUser,
    facts: EstablishStudentSessionFacts,
  ): Promise<AuthProjection> {
    if (user.role !== 'STUDENT' || !['PENDING_CONTACT_BINDING', 'ACTIVE'].includes(user.status)) {
      throw new ApplicationError('USER_IDENTITY_CONFLICT', 409);
    }
    const now = this.clock.now();
    const sessionId = this.idGenerator.next();
    const tokenFamilyId = this.idGenerator.next();
    const refreshTokenId = this.idGenerator.next();
    const refreshToken = this.createRefreshToken();
    const absoluteExpiresAt = new Date(now.getTime() + this.tokenAbsoluteTtlMilliseconds());
    const idleExpiresAt = new Date(now.getTime() + this.tokenIdleTtlMilliseconds());
    const access = await this.tokens.issue({
      userId: user.id,
      organizationId: user.organizationId,
      role: 'STUDENT',
      sessionId,
      tokenVersion: user.tokenVersion,
    });

    await transaction.authSession.create({
      data: {
        id: sessionId,
        organizationId: user.organizationId,
        userId: user.id,
        deviceIdHash: facts.deviceIdHash ?? null,
        status: 'ACTIVE',
        tokenFamilyId,
        createdAt: now,
        lastSeenAt: now,
        absoluteExpiresAt,
        idleExpiresAt,
      },
    });
    await transaction.refreshToken.create({
      data: {
        id: refreshTokenId,
        organizationId: user.organizationId,
        authSessionId: sessionId,
        tokenHash: this.digest.digest('refresh-token', refreshToken),
        issuedAt: now,
        expiresAt: idleExpiresAt,
      },
    });
    const updatedUser = await transaction.user.update({
      where: { id: user.id },
      data: { lastAuthenticatedAt: now, updatedAt: now },
    });
    await this.audit.append(transaction, {
      organizationId: user.organizationId,
      actorUserId: user.id,
      actorRoleSnapshot: 'STUDENT',
      permissionId: facts.permissionId ?? 'ENROLLMENT-JOIN',
      actionType: 'AUTHENTICATION_SUCCEEDED',
      targetType: 'AUTH_SESSION',
      targetId: sessionId,
      requestId: facts.requestId,
      idempotencyKeyReference: this.idempotencyKeyReference(facts.idempotencyKey),
      outcome: 'SUCCEEDED',
      safeMetadata: { credentialType: facts.credentialType ?? 'QR_JOIN' },
      ...(facts.sourceIp === undefined ? {} : { sourceIp: facts.sourceIp }),
    });
    await this.outbox.append(transaction, {
      organizationId: user.organizationId,
      aggregateType: 'AUTH_SESSION',
      aggregateId: sessionId,
      eventType: 'STUDENT_SESSION_ESTABLISHED_V1',
      eventVersion: 1,
      payload: { requestId: facts.requestId, userId: user.id, sessionId },
    });
    return this.authProjection(
      sessionId,
      access.token,
      refreshToken,
      access.expiresAt,
      idleExpiresAt,
      updatedUser,
    );
  }

  async passwordLogin(input: PasswordLoginRequest, facts: RequestFacts): Promise<AuthProjection> {
    const account = input.account.trim().toLowerCase();
    await this.enforceRateLimit([
      `login:account:${this.digest.digest('auth-rate-account', account)}`,
      `login:source:${this.digest.digest('auth-rate-source', facts.sourceIp ?? 'unavailable')}`,
    ]);

    const accountUsers = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT u.id FROM users u LEFT JOIN v81_account_security s ON s.user_id=u.id LEFT JOIN v81_admin_access a ON a.user_id=u.id
      WHERE u.deleted_at IS NULL AND ((a.kind='SUB' AND s.login_account=${account}) OR
        (a.kind IS DISTINCT FROM 'SUB' AND u.primary_email_normalized=${account})) LIMIT 2`;
    const candidates = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        id: { in: accountUsers.map((row) => row.id) },
      },
      take: 2,
    });
    const user = candidates.length === 1 ? candidates[0] : undefined;
    const passwordAccepted = await this.passwords.verify(
      user?.passwordHash ?? null,
      input.password,
    );
    if (
      user === undefined ||
      !passwordAccepted ||
      (user.role !== 'TEACHER' && user.role !== 'ADMIN') ||
      user.status === 'LOCKED'
    ) {
      if (user !== undefined) {
        await this.recordAuthenticationFailure(user, facts, 'AUTH_CREDENTIAL_INVALID');
      }
      throw new ApplicationError('AUTH_CREDENTIAL_INVALID', 401);
    }
    if (user.status === 'DISABLED') {
      await this.recordAuthenticationFailure(user, facts, 'AUTH_ACCOUNT_DISABLED');
      throw new ApplicationError('AUTH_ACCOUNT_DISABLED', 403);
    }
    if (user.status !== 'ACTIVE') {
      throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
        invariant: 'USER_STATUS_UNSUPPORTED',
      });
    }

    const currentPolicy = await this.prisma.systemPolicy.findUnique({
      where: { organizationId: user.organizationId },
    });
    if (currentPolicy?.systemMode !== 'NORMAL' && user.role !== 'ADMIN') {
      throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
    }
    const credentialDigest = this.digest.digest('auth-password-proof', input.password);
    return this.idempotency.execute(
      {
        organizationId: user.organizationId,
        principalId: user.id,
        authSessionId: null,
        operationId: 'passwordLogin',
        scope: `${user.organizationId}:${user.id}`,
        key: facts.idempotencyKey,
        request: { accountDigest: this.digest.digest('auth-account', account), credentialDigest },
        requestId: facts.requestId,
      },
      async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM organizations WHERE id=${user.organizationId}::uuid FOR SHARE`;
        const loginPolicy = await transaction.systemPolicy.findUnique({
          where: { organizationId: user.organizationId },
        });
        if (loginPolicy?.systemMode !== 'NORMAL' && user.role !== 'ADMIN') {
          throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
        }
        const now = this.clock.now();
        const sessionId = this.idGenerator.next();
        const tokenFamilyId = this.idGenerator.next();
        const refreshTokenId = this.idGenerator.next();
        const refreshToken = this.createRefreshToken();
        const absoluteExpiresAt = new Date(now.getTime() + this.tokenAbsoluteTtlMilliseconds());
        const idleExpiresAt = new Date(now.getTime() + this.tokenIdleTtlMilliseconds());
        const access = await this.tokens.issue({
          userId: user.id,
          organizationId: user.organizationId,
          role: this.role(user.role),
          sessionId,
          tokenVersion: user.tokenVersion,
        });

        await transaction.authSession.create({
          data: {
            id: sessionId,
            organizationId: user.organizationId,
            userId: user.id,
            status: 'ACTIVE',
            tokenFamilyId,
            createdAt: now,
            lastSeenAt: now,
            absoluteExpiresAt,
            idleExpiresAt,
          },
        });
        await transaction.refreshToken.create({
          data: {
            id: refreshTokenId,
            organizationId: user.organizationId,
            authSessionId: sessionId,
            tokenHash: this.digest.digest('refresh-token', refreshToken),
            issuedAt: now,
            expiresAt: idleExpiresAt,
          },
        });
        const updatedUser = await transaction.user.update({
          where: { id: user.id },
          data: { lastAuthenticatedAt: now, updatedAt: now },
        });
        const idempotencyKeyReference = this.idempotencyKeyReference(facts.idempotencyKey);
        await this.audit.append(transaction, {
          organizationId: user.organizationId,
          actorUserId: user.id,
          actorRoleSnapshot: this.role(user.role),
          permissionId: LOGIN_PERMISSION,
          actionType: 'AUTHENTICATION_SUCCEEDED',
          targetType: 'AUTH_SESSION',
          targetId: sessionId,
          requestId: facts.requestId,
          idempotencyKeyReference,
          outcome: 'SUCCEEDED',
          safeMetadata: { credentialType: 'PASSWORD' },
          ...(facts.sourceIp === undefined ? {} : { sourceIp: facts.sourceIp }),
        });
        await this.outbox.append(transaction, {
          organizationId: user.organizationId,
          aggregateType: 'AUTH_SESSION',
          aggregateId: sessionId,
          eventType: 'AUTH_SESSION_CREATED',
          eventVersion: 1,
          payload: { requestId: facts.requestId, userId: user.id, sessionId },
        });

        return this.idempotency.success(
          this.authProjection(
            sessionId,
            access.token,
            refreshToken,
            access.expiresAt,
            idleExpiresAt,
            updatedUser,
          ),
          { principalId: user.id, authSessionId: sessionId },
        );
      },
    );
  }

  async refresh(input: RefreshRequest, facts: RequestFacts): Promise<AuthProjection> {
    const tokenHash = this.digest.digest('refresh-token', input.refreshToken);
    await this.enforceRateLimit([
      `refresh:token:${tokenHash}`,
      `refresh:source:${this.digest.digest('auth-rate-source', facts.sourceIp ?? 'unavailable')}`,
    ]);
    const reference = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { organizationId: true, authSessionId: true },
    });
    if (reference === null) throw new ApplicationError('AUTH_CREDENTIAL_INVALID', 401);

    return this.idempotency.execute(
      {
        organizationId: reference.organizationId,
        principalId: null,
        authSessionId: reference.authSessionId,
        operationId: 'refreshSession',
        scope: `${reference.organizationId}:${reference.authSessionId}`,
        key: facts.idempotencyKey,
        request: { tokenHash },
        requestId: facts.requestId,
      },
      (transaction) => this.rotateRefreshToken(transaction, tokenHash, facts),
    );
  }

  async logout(
    principal: AuthenticatedPrincipal,
    input: LogoutRequest | undefined,
    facts: RequestFacts,
  ): Promise<null> {
    const refreshTokenHash =
      input === undefined ? undefined : this.digest.digest('refresh-token', input.refreshToken);
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'logoutSession',
        scope: `${principal.organizationId}:${principal.sessionId}`,
        key: facts.idempotencyKey,
        request: { refreshTokenHash: refreshTokenHash ?? null },
        requestId: facts.requestId,
      },
      async (transaction) => {
        const session = await transaction.authSession.findUnique({
          where: { id: principal.sessionId },
        });
        if (
          session?.organizationId !== principal.organizationId ||
          session?.userId !== principal.userId
        ) {
          return this.idempotency.failure(
            new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404),
          );
        }
        if (refreshTokenHash !== undefined) {
          const owned = await transaction.refreshToken.findUnique({
            where: { tokenHash: refreshTokenHash },
            select: { authSessionId: true, organizationId: true },
          });
          if (
            owned?.authSessionId !== principal.sessionId ||
            owned?.organizationId !== principal.organizationId
          ) {
            return this.idempotency.failure(
              new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404),
            );
          }
        }
        if (session.status === 'REVOKED') {
          return this.idempotency.success(null, {
            principalId: principal.userId,
            authSessionId: principal.sessionId,
          });
        }
        if (session.status !== 'ACTIVE') {
          return this.idempotency.failure(new ApplicationError('AUTH_SESSION_REVOKED', 401));
        }

        const now = this.clock.now();
        await transaction.authSession.update({
          where: { id: session.id },
          data: {
            status: 'REVOKED',
            revokedAt: now,
            revokeReasonCode: 'LOGOUT',
            version: { increment: 1 },
          },
        });
        await transaction.refreshToken.updateMany({
          where: { authSessionId: session.id, revokedAt: null },
          data: { revokedAt: now },
        });
        await this.audit.append(transaction, {
          organizationId: principal.organizationId,
          actorUserId: principal.userId,
          actorRoleSnapshot: principal.role,
          permissionId: LOGOUT_PERMISSION,
          actionType: 'AUTH_SESSION_REVOKED',
          targetType: 'AUTH_SESSION',
          targetId: session.id,
          requestId: facts.requestId,
          idempotencyKeyReference: this.idempotencyKeyReference(facts.idempotencyKey),
          outcome: 'SUCCEEDED',
          safeMetadata: { revokeSource: 'LOGOUT' },
          ...(facts.sourceIp === undefined ? {} : { sourceIp: facts.sourceIp }),
        });
        await this.outbox.append(transaction, {
          organizationId: principal.organizationId,
          aggregateType: 'AUTH_SESSION',
          aggregateId: session.id,
          eventType: 'AUTH_SESSION_REVOKED',
          eventVersion: session.version + 1,
          payload: { requestId: facts.requestId, userId: principal.userId, sessionId: session.id },
        });
        return this.idempotency.success(null, {
          principalId: principal.userId,
          authSessionId: principal.sessionId,
        });
      },
    );
  }

  private async rotateRefreshToken(
    transaction: Prisma.TransactionClient,
    tokenHash: string,
    facts: RequestFacts,
  ): Promise<IdempotentOutcome<AuthProjection>> {
    await transaction.$queryRaw<{ id: string }[]>`
      SELECT id FROM refresh_tokens WHERE token_hash = ${tokenHash} FOR UPDATE
    `;
    const current = await transaction.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        authSession: { include: { user: true, organization: true } },
      },
    });
    if (current === null) {
      return this.idempotency.failure(new ApplicationError('AUTH_CREDENTIAL_INVALID', 401));
    }
    const session = current.authSession;
    const user = session.user;
    const references = { principalId: user.id, authSessionId: session.id };
    const now = this.clock.now();

    if (current.consumedAt !== null) {
      await transaction.refreshToken.updateMany({
        where: { authSessionId: session.id, revokedAt: null },
        data: { revokedAt: now },
      });
      await transaction.refreshToken.update({
        where: { id: current.id },
        data: { reuseDetectedAt: current.reuseDetectedAt ?? now },
      });
      if (session.status === 'ACTIVE') {
        await transaction.authSession.update({
          where: { id: session.id },
          data: {
            status: 'REVOKED',
            revokedAt: now,
            revokeReasonCode: 'REFRESH_TOKEN_REUSE',
            version: { increment: 1 },
          },
        });
        await this.audit.append(transaction, {
          organizationId: session.organizationId,
          actorUserId: user.id,
          actorRoleSnapshot: this.role(user.role),
          permissionId: REFRESH_PERMISSION,
          actionType: 'AUTH_SESSION_REVOKED',
          targetType: 'AUTH_SESSION',
          targetId: session.id,
          requestId: facts.requestId,
          idempotencyKeyReference: this.idempotencyKeyReference(facts.idempotencyKey),
          outcome: 'REJECTED',
          reasonCode: 'AUTH_SESSION_REVOKED',
          safeMetadata: { revokeSource: 'REFRESH_TOKEN_REUSE' },
          ...(facts.sourceIp === undefined ? {} : { sourceIp: facts.sourceIp }),
        });
        await this.outbox.append(transaction, {
          organizationId: session.organizationId,
          aggregateType: 'AUTH_SESSION',
          aggregateId: session.id,
          eventType: 'AUTH_REFRESH_TOKEN_REUSE_DETECTED',
          eventVersion: session.version + 1,
          payload: { requestId: facts.requestId, userId: user.id, sessionId: session.id },
        });
      }
      return this.idempotency.failure(
        new ApplicationError('AUTH_SESSION_REVOKED', 401),
        references,
      );
    }
    if (current.revokedAt !== null || session.status !== 'ACTIVE') {
      return this.idempotency.failure(
        new ApplicationError('AUTH_SESSION_REVOKED', 401),
        references,
      );
    }
    if (user.deletedAt !== null || user.status === 'DISABLED' || user.status === 'LOCKED') {
      await this.revokeSession(transaction, session.id, now, 'ACCOUNT_STATE');
      await this.audit.append(transaction, {
        organizationId: session.organizationId,
        actorUserId: user.id,
        actorRoleSnapshot: this.role(user.role),
        permissionId: REFRESH_PERMISSION,
        actionType: 'AUTH_SESSION_REVOKED',
        targetType: 'AUTH_SESSION',
        targetId: session.id,
        requestId: facts.requestId,
        idempotencyKeyReference: this.idempotencyKeyReference(facts.idempotencyKey),
        outcome: 'REJECTED',
        reasonCode: user.status === 'LOCKED' ? 'AUTH_CREDENTIAL_INVALID' : 'AUTH_ACCOUNT_DISABLED',
        safeMetadata: { revokeSource: 'ACCOUNT_STATE' },
        ...(facts.sourceIp === undefined ? {} : { sourceIp: facts.sourceIp }),
      });
      await this.outbox.append(transaction, {
        organizationId: session.organizationId,
        aggregateType: 'AUTH_SESSION',
        aggregateId: session.id,
        eventType: 'AUTH_SESSION_REVOKED',
        eventVersion: session.version + 1,
        payload: { requestId: facts.requestId, userId: user.id, sessionId: session.id },
      });
      return this.idempotency.failure(
        user.status === 'LOCKED'
          ? new ApplicationError('AUTH_CREDENTIAL_INVALID', 401)
          : new ApplicationError('AUTH_ACCOUNT_DISABLED', 403),
        references,
      );
    }
    if (
      !['PENDING_CONTACT_BINDING', 'ACTIVE'].includes(user.status) ||
      session.organization.status !== 'ACTIVE'
    ) {
      return this.idempotency.failure(
        new ApplicationError('AUTH_CREDENTIAL_INVALID', 401),
        references,
      );
    }
    if (
      current.expiresAt <= now ||
      session.idleExpiresAt <= now ||
      session.absoluteExpiresAt <= now
    ) {
      await transaction.authSession.update({
        where: { id: session.id },
        data: { status: 'EXPIRED', version: { increment: 1 } },
      });
      return this.idempotency.failure(
        new ApplicationError('AUTH_CREDENTIAL_INVALID', 401),
        references,
      );
    }

    const refreshPolicy = await transaction.systemPolicy.findUnique({
      where: { organizationId: user.organizationId },
    });
    if (refreshPolicy?.systemMode !== 'NORMAL' && user.role !== 'ADMIN') {
      return this.idempotency.failure(new ApplicationError('SYSTEM_MAINTENANCE', 503), references);
    }
    const nextToken = this.createRefreshToken();
    const nextTokenId = this.idGenerator.next();
    const idleCandidate = new Date(now.getTime() + this.tokenIdleTtlMilliseconds());
    const nextIdleExpiresAt =
      idleCandidate <= session.absoluteExpiresAt ? idleCandidate : session.absoluteExpiresAt;
    const access = await this.tokens.issue({
      userId: user.id,
      organizationId: user.organizationId,
      role: this.role(user.role),
      sessionId: session.id,
      tokenVersion: user.tokenVersion,
    });
    await transaction.refreshToken.create({
      data: {
        id: nextTokenId,
        organizationId: session.organizationId,
        authSessionId: session.id,
        tokenHash: this.digest.digest('refresh-token', nextToken),
        parentTokenId: current.id,
        issuedAt: now,
        expiresAt: nextIdleExpiresAt,
      },
    });
    await transaction.refreshToken.update({
      where: { id: current.id },
      data: { consumedAt: now, replacedByTokenId: nextTokenId },
    });
    await transaction.authSession.update({
      where: { id: session.id },
      data: { lastSeenAt: now, idleExpiresAt: nextIdleExpiresAt, version: { increment: 1 } },
    });
    await this.audit.append(transaction, {
      organizationId: session.organizationId,
      actorUserId: user.id,
      actorRoleSnapshot: this.role(user.role),
      permissionId: REFRESH_PERMISSION,
      actionType: 'AUTHENTICATION_SUCCEEDED',
      targetType: 'AUTH_SESSION',
      targetId: session.id,
      requestId: facts.requestId,
      idempotencyKeyReference: this.idempotencyKeyReference(facts.idempotencyKey),
      outcome: 'SUCCEEDED',
      safeMetadata: { credentialType: 'REFRESH_TOKEN' },
      ...(facts.sourceIp === undefined ? {} : { sourceIp: facts.sourceIp }),
    });
    await this.outbox.append(transaction, {
      organizationId: session.organizationId,
      aggregateType: 'AUTH_SESSION',
      aggregateId: session.id,
      eventType: 'AUTH_REFRESH_TOKEN_ROTATED',
      eventVersion: session.version + 1,
      payload: { requestId: facts.requestId, userId: user.id, sessionId: session.id },
    });
    return this.idempotency.success(
      this.authProjection(
        session.id,
        access.token,
        nextToken,
        access.expiresAt,
        nextIdleExpiresAt,
        user,
      ),
      references,
    );
  }

  private async revokeSession(
    transaction: Prisma.TransactionClient,
    sessionId: string,
    now: Date,
    reason: string,
  ): Promise<void> {
    await transaction.authSession.updateMany({
      where: { id: sessionId, status: 'ACTIVE' },
      data: {
        status: 'REVOKED',
        revokedAt: now,
        revokeReasonCode: reason,
        version: { increment: 1 },
      },
    });
    await transaction.refreshToken.updateMany({
      where: { authSessionId: sessionId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  private async recordAuthenticationFailure(
    user: {
      id: string;
      organizationId: string;
      role: string;
    },
    facts: RequestFacts,
    reasonCode: 'AUTH_CREDENTIAL_INVALID' | 'AUTH_ACCOUNT_DISABLED',
  ): Promise<void> {
    await this.prisma.$transaction((transaction) =>
      this.audit.append(transaction, {
        organizationId: user.organizationId,
        actorUserId: user.id,
        actorRoleSnapshot: this.role(user.role),
        permissionId: LOGIN_PERMISSION,
        actionType: 'AUTHENTICATION_FAILED',
        targetType: 'USER',
        targetId: user.id,
        requestId: facts.requestId,
        outcome: 'REJECTED',
        reasonCode,
        safeMetadata: { credentialType: 'PASSWORD' },
        ...(facts.sourceIp === undefined ? {} : { sourceIp: facts.sourceIp }),
      }),
    );
  }

  private async enforceRateLimit(keys: readonly string[]): Promise<void> {
    const decision = await this.rateLimits.consume({
      purpose: 'AUTHENTICATION',
      keys,
      windowSeconds: this.config.authRateLimitWindowSeconds,
      maximumAttempts: this.config.authRateLimitMaxAttempts,
    });
    if (!decision.allowed) {
      throw new ApplicationError('AUTH_RATE_LIMITED', 429, {
        retryAfterSeconds: decision.retryAfterSeconds,
      });
    }
  }

  private createRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private tokenAbsoluteTtlMilliseconds(): number {
    return this.tokens.refreshAbsoluteTtlSeconds * 1_000;
  }

  private tokenIdleTtlMilliseconds(): number {
    return this.tokens.refreshIdleTtlSeconds * 1_000;
  }

  private idempotencyKeyReference(key: string | undefined): string | null {
    return key === undefined ? null : this.digest.digest('idempotency-key', key);
  }

  private role(role: string): UserRole {
    if (role === 'STUDENT' || role === 'TEACHER' || role === 'ADMIN') return role;
    throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
      invariant: 'USER_ROLE_UNSUPPORTED',
    });
  }

  private authProjection(
    sessionId: string,
    accessToken: string,
    refreshToken: string,
    accessTokenExpiresAt: Date,
    refreshTokenExpiresAt: Date,
    user: Parameters<typeof projectUser>[0],
  ): AuthProjection {
    return {
      sessionId,
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
      refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString(),
      user: projectUser(user),
    };
  }
}
