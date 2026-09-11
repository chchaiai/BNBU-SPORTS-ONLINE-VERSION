import { Inject, Injectable } from '@nestjs/common';
import type { RuntimeConfig } from '../../common/config/environment.js';
import { RUNTIME_CONFIG } from '../../common/config/runtime-config.module.js';
import { RateLimitPort } from '../../common/rate-limit/rate-limit.port.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { SecureDigestService } from '../../common/security/secure-digest.service.js';
import { Clock } from '../../common/time/clock.js';
import { IdGenerator } from '../../common/time/id-generator.js';
import { PasswordHasherService } from './password-hasher.service.js';
import type { ChangeOwnPasswordInput } from './auth.dto.js';

@Injectable()
export class AccountSecurityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordHasherService,
    private readonly idempotency: IdempotencyService,
    private readonly digest: SecureDigestService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly rateLimits: RateLimitPort,
    @Inject(RUNTIME_CONFIG) private readonly config: RuntimeConfig,
  ) {}

  async status(principal: AuthenticatedPrincipal) {
    if (principal.role === 'TEACHER') {
      const policy = await this.prisma.systemPolicy.findUnique({
        where: { organizationId: principal.organizationId },
      });
      if (policy?.systemMode !== 'NORMAL') throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
    }
    const rows = await this.prisma.$queryRaw<
      {
        version: number;
        must_change_password: boolean;
        kind: string | null;
        permissions: unknown;
      }[]
    >`
      SELECT u.version,coalesce(s.must_change_password,true) OR coalesce(a.must_change_password,false) AS must_change_password,a.kind,a.permissions
      FROM users u LEFT JOIN v81_account_security s ON s.user_id=u.id LEFT JOIN v81_admin_access a ON a.user_id=u.id
      WHERE u.id=${principal.userId}::uuid AND u.organization_id=${principal.organizationId}::uuid AND u.status='ACTIVE' AND u.deleted_at IS NULL`;
    const row = rows[0];
    if (!row || principal.role === 'STUDENT')
      throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    return {
      userId: principal.userId,
      version: row.version,
      mustChangePassword: row.must_change_password,
      adminKind: row.kind,
      permissions: row.permissions ?? [],
    };
  }

  async change(
    principal: AuthenticatedPrincipal,
    input: ChangeOwnPasswordInput,
    facts: { requestId: string; idempotencyKey: string | undefined },
  ) {
    if (
      principal.role === 'STUDENT' ||
      input.newPassword.length === 0 ||
      input.newPassword !== input.confirmPassword
    ) {
      throw new ApplicationError('VALIDATION_FAILED', 422);
    }
    const limit = await this.rateLimits.consume({
      purpose: 'AUTHENTICATION',
      keys: [`own-password:${this.digest.digest('own-password-actor', principal.userId)}`],
      windowSeconds: this.config.authRateLimitWindowSeconds,
      maximumAttempts: this.config.authRateLimitMaxAttempts,
    });
    if (!limit.allowed)
      throw new ApplicationError('AUTH_RATE_LIMITED', 429, {
        retryAfterSeconds: limit.retryAfterSeconds,
      });
    const hash = await this.passwords.hash(input.newPassword);
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'changeOwnV81Password',
        scope: principal.userId,
        key: facts.idempotencyKey,
        requestId: facts.requestId,
        request: {
          expectedVersion: input.expectedVersion,
          currentProof: this.digest.digest('own-password-current', input.currentPassword),
          newProof: this.digest.digest('own-password-new', input.newPassword),
        },
      },
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
        await tx.$queryRaw`SELECT id FROM users WHERE id=${principal.userId}::uuid FOR NO KEY UPDATE`;
        const user = await tx.user.findUniqueOrThrow({ where: { id: principal.userId } });
        const activeSession = await tx.authSession.findUnique({
          where: { id: principal.sessionId },
        });
        const checkedAt = this.clock.now();
        if (
          activeSession?.userId !== user.id ||
          activeSession.organizationId !== principal.organizationId ||
          activeSession.status !== 'ACTIVE' ||
          activeSession.absoluteExpiresAt <= checkedAt ||
          activeSession.idleExpiresAt <= checkedAt ||
          user.tokenVersion !== principal.tokenVersion
        )
          throw new ApplicationError('AUTH_SESSION_REVOKED', 401);
        if (
          user.organizationId !== principal.organizationId ||
          user.status !== 'ACTIVE' ||
          user.deletedAt
        )
          throw new ApplicationError('AUTH_ACCOUNT_DISABLED', 403);
        const mode = await tx.systemPolicy.findUnique({
          where: { organizationId: principal.organizationId },
        });
        if (principal.role === 'TEACHER' && mode?.systemMode !== 'NORMAL')
          throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
        if (user.version !== input.expectedVersion)
          throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
        if (!(await this.passwords.verify(user.passwordHash, input.currentPassword)))
          throw new ApplicationError('AUTH_CREDENTIAL_INVALID', 401);
        const now = this.clock.now();
        await tx.user.update({
          where: { id: user.id },
          data: { passwordHash: hash, version: { increment: 1 }, updatedAt: now },
        });
        await tx.$executeRaw`INSERT INTO v81_account_security(user_id,organization_id,must_change_password,password_changed_at)
        VALUES(${user.id}::uuid,${user.organizationId}::uuid,false,${now}) ON CONFLICT(user_id) DO UPDATE SET must_change_password=false,password_changed_at=EXCLUDED.password_changed_at`;
        await tx.$executeRaw`UPDATE v81_admin_access SET must_change_password=false,version=version+1 WHERE user_id=${user.id}::uuid AND must_change_password=true`;
        await tx.authSession.updateMany({
          where: { userId: user.id, id: { not: principal.sessionId }, status: 'ACTIVE' },
          data: {
            status: 'REVOKED',
            revokedAt: now,
            revokeReasonCode: 'SELF_PASSWORD_CHANGED',
            version: { increment: 1 },
          },
        });
        await tx.refreshToken.updateMany({
          where: {
            authSession: { userId: user.id },
            authSessionId: { not: principal.sessionId },
            revokedAt: null,
          },
          data: { revokedAt: now },
        });
        await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at)
        VALUES(${this.ids.next()}::uuid,${user.organizationId}::uuid,'ACCOUNT_SECURITY',${user.id}::uuid,'OWN_PASSWORD_CHANGED',${user.id}::uuid,${facts.requestId},${user.version + 1},'{}'::jsonb,${now})`;
        return this.idempotency.success({
          userId: user.id,
          version: user.version + 1,
          mustChangePassword: false,
        });
      },
    );
  }
}
