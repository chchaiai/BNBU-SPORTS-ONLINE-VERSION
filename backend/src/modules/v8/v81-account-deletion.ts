import { Body, Controller, Headers, HttpCode, Injectable, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { IsIn, IsInt, Matches, Max, Min } from 'class-validator';
import { randomInt, randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/database/prisma.service.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { SecureDigestService } from '../../common/security/secure-digest.service.js';
import { Clock } from '../../common/time/clock.js';
import { AuthCodeDeliveryPort } from '../client-capabilities/auth-code-delivery.port.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import type { AuthenticatedPrincipal, FoundationRequest } from '../../common/http/request-context.js';

class DeletionChallengeInput {
  @IsInt() @Min(1) @Max(2147483647) expectedVersion!: number;
  @IsIn(['zh-CN', 'en']) locale!: 'zh-CN' | 'en';
}
class DeletionConfirmInput {
  @IsInt() @Min(1) @Max(2147483647) expectedVersion!: number;
  @Matches(/^\d{6}$/) verificationCode!: string;
}
type DeletionStage = { id: string; code: string; recipient: string; emailDigest: string; expiresAt: Date; userVersion: number };
type DeletionChallengeResponse = { challengeId: string; mode: 'STUDENT_EMAIL_OTP'; expiresAt: string; version: number };

@Injectable()
export class V81AccountDeletionService {
  constructor(private readonly prisma: PrismaService, private readonly idempotency: IdempotencyService,
    private readonly digest: SecureDigestService, private readonly clock: Clock, private readonly delivery: AuthCodeDeliveryPort) {}
  async confirm(p: AuthenticatedPrincipal, id: string, input: DeletionConfirmInput, requestId: string) {
    if (p.role !== 'STUDENT') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    // The deletion removes this subject's idempotency records and sessions too.
    // Serialize on the organization and commit failed attempts before returning an error.
    const outcome = await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${p.organizationId}::uuid FOR UPDATE`;
      if ((await tx.systemPolicy.findUnique({ where: { organizationId: p.organizationId } }))?.systemMode !== 'NORMAL')
        throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
      const [challenge] = await tx.$queryRaw<{ id: string; version: number; status: string; expires_at: Date;
        expected_user_version: number; email_digest: string; code_digest: string; failed_attempts: number }[]>`
        SELECT * FROM v81_account_deletion_challenges WHERE id=${id}::uuid AND organization_id=${p.organizationId}::uuid
          AND user_id=${p.userId}::uuid AND auth_session_id=${p.sessionId}::uuid FOR UPDATE`;
      const now = this.clock.now();
      const user = await tx.user.findFirst({ where: { id: p.userId, organizationId: p.organizationId, role: 'STUDENT', status: 'ACTIVE', deletedAt: null } });
      const session = await tx.authSession.findUnique({ where: { id: p.sessionId } });
      if (!challenge || challenge.status !== 'ACTIVE' || challenge.expires_at <= now || !user?.emailVerifiedAt ||
          session?.status !== 'ACTIVE' || user.version !== challenge.expected_user_version ||
          this.digest.digest('account-deletion-email', user.primaryEmailNormalized ?? '') !== challenge.email_digest)
        return { error: new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403, { currentState: 'ACCOUNT_DELETION_REAUTH_REQUIRED' }) };
      if (challenge.version !== input.expectedVersion)
        return { error: new ApplicationError('CONFLICT_VERSION_MISMATCH', 409, { actualVersion: challenge.version }) };
      if (this.digest.digest('account-deletion-code:' + id, input.verificationCode) !== challenge.code_digest) {
        const locked = challenge.failed_attempts + 1 >= 5;
        await tx.$executeRaw`UPDATE v81_account_deletion_challenges SET failed_attempts=failed_attempts+1,version=version+1,
          status=${locked ? 'LOCKED' : 'ACTIVE'} WHERE id=${id}::uuid`;
        return { error: new ApplicationError('VALIDATION_FAILED', 422,
          { currentState: locked ? 'ACCOUNT_DELETION_REAUTH_REQUIRED' : 'ACCOUNT_DELETION_CODE_INVALID', actualVersion: challenge.version + 1 }) };
      }
      const student = await tx.studentProfile.findFirst({ where: { userId: p.userId, organizationId: p.organizationId } });
      if (!student) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      await tx.$executeRaw`UPDATE v81_account_deletion_challenges SET status='CONSUMED',version=version+1 WHERE id=${id}::uuid`;
      await tx.$queryRaw`SELECT set_config('bnbu.self_erasure_challenge',${id},true)`;
      const [result] = await tx.$queryRaw<{ counts: Record<string, number> }[]>`
        SELECT erase_v81_student(${p.organizationId}::uuid,${student.id}::uuid,${p.userId}::uuid) AS counts`;
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${randomUUID()}::uuid,${p.organizationId}::uuid,'STUDENT',${student.id}::uuid,'ACCOUNT_AND_HISTORY_DELETED',${p.userId}::uuid,${requestId},${student.version + 1},
        ${JSON.stringify({ source: 'STUDENT_SELF_SERVICE', deletedCounts: result?.counts ?? {}, mediaCleanup: 'QUEUED' })}::jsonb,${now},'SUCCEEDED')`;
      return { data: { status: 'DELETED' as const, deletedAt: now.toISOString(), allSessionsRevoked: true, newRegistrationRequired: true } };
    }, { timeout: 60000 });
    if (outcome.error) throw outcome.error;
    return outcome.data;
  }
  async challenge(p: AuthenticatedPrincipal, input: DeletionChallengeInput, requestId: string, key?: string): Promise<DeletionChallengeResponse> {
    if (p.role !== 'STUDENT') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    const owner = await this.idempotency.reserveStage<DeletionStage, DeletionChallengeResponse>({ organizationId: p.organizationId,
      principalId: p.userId, authSessionId: p.sessionId, operationId: 'requestCurrentUserAccountDeletionChallenge', scope: p.userId,
      request: input, requestId, key }, async (tx, context) => {
      if (context.isRecovery) return this.idempotency.failure(new ApplicationError('SYSTEM_SERVICE_UNAVAILABLE', 503, { reason: 'DELETION_DELIVERY_RETRY_REQUIRED' }));
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${p.organizationId}::uuid FOR NO KEY UPDATE`;
      await tx.$queryRaw`SELECT id FROM users WHERE id=${p.userId}::uuid FOR UPDATE`;
      if ((await tx.systemPolicy.findUnique({ where: { organizationId: p.organizationId } }))?.systemMode !== 'NORMAL')
        throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
      const user = await tx.user.findFirst({ where: { id: p.userId, organizationId: p.organizationId, role: 'STUDENT', status: 'ACTIVE', deletedAt: null } });
      if (!user) throw new ApplicationError('USER_NOT_FOUND', 404);
      if (user.version !== input.expectedVersion) throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
      if (!user.primaryEmail || !user.primaryEmailNormalized || !user.emailVerifiedAt) throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403, { reason: 'CURRENT_VERIFIED_EMAIL_REQUIRED' });
      const now = this.clock.now(), recent = await tx.$queryRaw<{ requested_at: Date }[]>`SELECT requested_at FROM v81_account_deletion_challenges
        WHERE user_id=${p.userId}::uuid AND organization_id=${p.organizationId}::uuid AND requested_at>${new Date(now.getTime() - 900000)} ORDER BY requested_at DESC`;
      if (recent.length >= 3 || (recent[0] && recent[0].requested_at.getTime() > now.getTime() - 60000))
        return this.idempotency.failure(new ApplicationError('AUTH_RATE_LIMITED', 429, { retryAfterSeconds: recent.length >= 3 ? 900 : 60 }));
      const id = randomUUID(), code = String(randomInt(1000000)).padStart(6, '0'), expiresAt = new Date(now.getTime() + 600000);
      const emailDigest = this.digest.digest('account-deletion-email', user.primaryEmailNormalized);
      await tx.$executeRaw`INSERT INTO v81_account_deletion_challenges(id,organization_id,user_id,auth_session_id,expected_user_version,email_digest,code_digest,status,requested_at,expires_at,request_id)
        VALUES(${id}::uuid,${p.organizationId}::uuid,${p.userId}::uuid,${p.sessionId}::uuid,${user.version},${emailDigest},
          ${this.digest.digest('account-deletion-code:' + id, code)},'PENDING',${now},${expiresAt},${requestId})`;
      return this.idempotency.stage({ id, code, recipient: user.primaryEmail, emailDigest, expiresAt, userVersion: user.version },
        { principalId: p.userId, authSessionId: p.sessionId, resourceType: 'ACCOUNT_DELETION_CHALLENGE', resourceId: id });
    });
    if (owner.kind === 'REPLAY') return owner.value;
    let delivered = false;
    try { await this.delivery.deliver({ deliveryId: owner.value.id, purpose: 'ACCOUNT_DELETION', channel: 'EMAIL', recipient: owner.value.recipient,
      locale: input.locale, code: owner.value.code, expiresAt: owner.value.expiresAt }); delivered = true; } catch { /* Persist explicit failure below; never log delivery content. */ }
    return this.idempotency.completeStage(owner, async tx => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${p.organizationId}::uuid FOR NO KEY UPDATE`;
      const now = this.clock.now(), user = await tx.user.findFirst({ where: { id: p.userId, organizationId: p.organizationId, status: 'ACTIVE', deletedAt: null } });
      const session = await tx.authSession.findUnique({ where: { id: p.sessionId } });
      const valid = delivered && now < owner.value.expiresAt && user?.version === owner.value.userVersion && !!user.emailVerifiedAt &&
        this.digest.digest('account-deletion-email', user.primaryEmailNormalized ?? '') === owner.value.emailDigest && session?.status === 'ACTIVE' &&
        (await tx.systemPolicy.findUnique({ where: { organizationId: p.organizationId } }))?.systemMode === 'NORMAL';
      if (valid) await tx.$executeRaw`UPDATE v81_account_deletion_challenges SET status='SUPERSEDED',version=version+1 WHERE user_id=${p.userId}::uuid AND status='ACTIVE'`;
      await tx.$executeRaw`UPDATE v81_account_deletion_challenges SET status=${valid ? 'ACTIVE' : 'FAILED'},version=version+1,delivered_at=${delivered ? now : null} WHERE id=${owner.value.id}::uuid`;
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at)
        VALUES(${randomUUID()}::uuid,${p.organizationId}::uuid,'ACCOUNT_DELETION_CHALLENGE',${owner.value.id}::uuid,${valid ? 'ISSUED' : 'FAILED'},${p.userId}::uuid,${requestId},2,'{}'::jsonb,${now})`;
      if (!valid) return this.idempotency.failure(new ApplicationError('SYSTEM_SERVICE_UNAVAILABLE', 503, { reason: 'DELETION_CHALLENGE_NOT_ACTIVATED' }));
      return this.idempotency.success({ challengeId: owner.value.id, mode: 'STUDENT_EMAIL_OTP' as const, expiresAt: owner.value.expiresAt.toISOString(), version: 2 });
    });
  }
}
@Controller('me/account-deletion-challenges')
export class V81AccountDeletionController {
  constructor(private readonly service: V81AccountDeletionService) {}
  @Post() @OperationPolicy('requestCurrentUserAccountDeletionChallenge')
  challenge(@CurrentPrincipal() p: AuthenticatedPrincipal, @Body() input: DeletionChallengeInput,
    @Headers('idempotency-key') key: string | undefined, @Req() request: FoundationRequest) {
    return this.service.challenge(p, input, request.requestId, key);
  }
  @Post(':id/confirm') @HttpCode(200) @OperationPolicy('confirmCurrentUserAccountDeletion')
  confirm(@CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param('id', new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) })) id: string,
    @Body() input: DeletionConfirmInput, @Req() request: FoundationRequest) {
    return this.service.confirm(p, id, input, request.requestId);
  }
}
