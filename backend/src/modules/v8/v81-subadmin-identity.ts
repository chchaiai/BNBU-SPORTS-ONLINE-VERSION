import { permitsSystemMode } from '../system-mode/system-mode-access.js';
import { Body, Controller, Headers, Injectable, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../common/database/prisma.service.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { SecureDigestService } from '../../common/security/secure-digest.service.js';
import { Clock } from '../../common/time/clock.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import type { AuthenticatedPrincipal, FoundationRequest } from '../../common/http/request-context.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuthCodeDeliveryPort } from '../client-capabilities/auth-code-delivery.port.js';
import { PasswordHasherService } from '../auth/password-hasher.service.js';
import { ADMIN_PERMISSIONS, requireAdminAccess, type AdminPermission } from './v81-admin-access.js';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
export class SubadminIdentityInput {
  @Transform(trim) @IsEmail() @MaxLength(254) email!: string;
  @IsIn(['zh-CN', 'en']) locale!: 'zh-CN' | 'en';
}
export class SubadminIdentityVerifyInput {
  @IsString() @Matches(/^\d{6}$/) code!: string;
  @IsInt() @Min(1) @Max(2147483646) expectedVersion!: number;
}
export class CreateVerifiedSubadminInput {
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsUUID() identityChallengeId?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined) @Transform(trim) @IsEmail() @MaxLength(254) email?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsBoolean() identityVerifiedByAdmin?: boolean;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(128) @Matches(/^[^\x00-\x20\x7f]+$/) account!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @Transform(trim) @IsString() @MaxLength(128) department!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(8) @ArrayUnique() @IsIn(ADMIN_PERMISSIONS, { each: true }) permissions!: AdminPermission[];
  @IsString() @MinLength(1) initialPassword!: string;
  @IsString() @MinLength(1) confirmPassword!: string;
}
type Facts = { requestId: string; key: string | undefined };
export class DeleteSubadminInput {
  @IsInt() @Min(1) @Max(2147483646) expectedVersion!: number;
  @IsBoolean() handoverCompleted!: boolean;
}
export class UpdateVerifiedSubadminInput {
  @IsInt() @Min(1) @Max(2147483646) expectedVersion!: number;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @Transform(trim) @IsString() @MaxLength(128) department!: string;
  @Transform(trim) @IsEmail() @MaxLength(254) email!: string;
  @IsArray() @ArrayMaxSize(8) @ArrayUnique() @IsIn(ADMIN_PERMISSIONS, { each: true }) permissions!: AdminPermission[];
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsUUID() identityChallengeId?: string;
}
type IdentityRow = { id: string; email: string; code_digest: string; status: string; attempts: number; version: number; expires_at: Date };

@Injectable()
export class V81SubadminIdentityService {
  constructor(private readonly prisma: PrismaService, private readonly idempotency: IdempotencyService,
    private readonly digest: SecureDigestService, private readonly clock: Clock,
    private readonly delivery: AuthCodeDeliveryPort, private readonly passwords: PasswordHasherService) {}
  private async guard(tx: Prisma.TransactionClient, p: AuthenticatedPrincipal) {
    await tx.$queryRaw`SELECT id FROM organizations WHERE id=${p.organizationId}::uuid FOR NO KEY UPDATE`;
    await requireAdminAccess(tx, p, 'SUPER');
    if (!permitsSystemMode((await tx.systemPolicy.findUnique({ where: { organizationId: p.organizationId } }))?.systemMode, p.role)) throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
  }
  private binding(p: AuthenticatedPrincipal, operationId: string, scope: string, request: unknown, f: Facts) {
    return { organizationId: p.organizationId, principalId: p.userId, authSessionId: p.sessionId,
      operationId, scope, request, requestId: f.requestId, key: f.key };
  }
  async issue(p: AuthenticatedPrincipal, input: SubadminIdentityInput, f: Facts) {
    const email = input.email.toLowerCase();
    const owner = await this.idempotency.reserveStage(this.binding(p, 'requestV81SubadminIdentity', email, { email, locale: input.locale }, f), async tx => {
      await this.guard(tx, p);
      const now = this.clock.now();
      const recent = await tx.$queryRaw<{ requested_at: Date; email: string }[]>`SELECT requested_at,email FROM v81_subadmin_identity_challenges
        WHERE organization_id=${p.organizationId}::uuid AND actor_id=${p.userId}::uuid AND requested_at>${new Date(now.getTime()-900000)} ORDER BY requested_at DESC`;
      if (recent.length >= 10 || recent.some(r => r.email === email && r.requested_at.getTime() > now.getTime()-60000))
        throw new ApplicationError('AUTH_RATE_LIMITED', 429, { retryAfterSeconds: 60 });
      if (await tx.user.findFirst({ where: { primaryEmailNormalized: email, role: { not: 'STUDENT' } } }))
        throw new ApplicationError('CONFLICT_RESOURCE_ALREADY_EXISTS', 409);
      const id = randomUUID(), code = String(randomInt(1000000)).padStart(6, '0'), expiresAt = new Date(now.getTime()+600000);
      await tx.$executeRaw`INSERT INTO v81_subadmin_identity_challenges(id,organization_id,actor_id,email,code_digest,status,requested_at,expires_at)
        VALUES(${id}::uuid,${p.organizationId}::uuid,${p.userId}::uuid,${email},${this.digest.digest('admin-identity:'+id,code)},'PENDING',${now},${expiresAt})`;
      return this.idempotency.stage({ id, code, email, expiresAt }, { principalId: p.userId, authSessionId: p.sessionId,
        resourceType: 'SUBADMIN_IDENTITY', resourceId: id });
    });
    if (owner.kind === 'REPLAY') return owner.value;
    let delivered = false;
    try { await this.delivery.deliver({ deliveryId: owner.value.id, purpose: 'ADMIN_IDENTITY_VERIFICATION', channel: 'EMAIL',
      recipient: email, locale: input.locale, code: owner.value.code, expiresAt: owner.value.expiresAt }); delivered = true; } catch { /* no provider details or OTP in logs */ }
    return this.idempotency.completeStage(owner, async tx => {
      await this.guard(tx, p);
      const valid = delivered && this.clock.now() < owner.value.expiresAt;
      if (valid) await tx.$executeRaw`UPDATE v81_subadmin_identity_challenges SET status='SUPERSEDED',version=version+1
        WHERE organization_id=${p.organizationId}::uuid AND actor_id=${p.userId}::uuid AND email=${email} AND status IN ('ACTIVE','VERIFIED')`;
      await tx.$executeRaw`UPDATE v81_subadmin_identity_challenges SET status=${valid ? 'ACTIVE' : 'FAILED'},version=version+1 WHERE id=${owner.value.id}::uuid`;
      if (!valid) return this.idempotency.failure(new ApplicationError('SYSTEM_SERVICE_UNAVAILABLE', 503));
      return this.idempotency.success({ id: owner.value.id, email, status: 'ACTIVE', version: 2, expiresAt: owner.value.expiresAt.toISOString() },
        { resourceType: 'SUBADMIN_IDENTITY', resourceId: owner.value.id });
    });
  }
  async verify(p: AuthenticatedPrincipal, id: string, input: SubadminIdentityVerifyInput, f: Facts) {
    return this.idempotency.execute(this.binding(p, 'verifyV81SubadminIdentity', id,
      { expectedVersion: input.expectedVersion, codeProof: this.digest.digest('admin-identity:'+id,input.code) }, f), async tx => {
      await this.guard(tx, p);
      const [row] = await tx.$queryRaw<IdentityRow[]>`SELECT * FROM v81_subadmin_identity_challenges
        WHERE id=${id}::uuid AND organization_id=${p.organizationId}::uuid AND actor_id=${p.userId}::uuid FOR UPDATE`;
      if (!row) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      if (row.version !== input.expectedVersion) throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
      if (row.status !== 'ACTIVE' || this.clock.now() >= row.expires_at) throw new ApplicationError('AUTH_VERIFICATION_CODE_INVALID', 401);
      const correct = timingSafeEqual(Buffer.from(row.code_digest,'hex'),Buffer.from(this.digest.digest('admin-identity:'+id,input.code),'hex'));
      const attempts = row.attempts + (correct ? 0 : 1), status = correct ? 'VERIFIED' : attempts >= 5 ? 'LOCKED' : 'ACTIVE';
      await tx.$executeRaw`UPDATE v81_subadmin_identity_challenges SET attempts=${attempts},status=${status},version=version+1,
        verified_at=${correct ? this.clock.now() : null} WHERE id=${id}::uuid`;
      if (!correct) return this.idempotency.failure(new ApplicationError('AUTH_VERIFICATION_CODE_INVALID', 401, { actualVersion: row.version+1 }));
      return this.idempotency.success({ id, email: row.email, status, version: row.version+1, expiresAt: row.expires_at.toISOString() },
        { resourceType: 'SUBADMIN_IDENTITY', resourceId: id });
    });
  }
  async create(p: AuthenticatedPrincipal, input: CreateVerifiedSubadminInput, f: Facts) {
    await requireAdminAccess(this.prisma, p, 'SUPER');
    const direct = input.email !== undefined;
    if (direct ? (input.identityChallengeId !== undefined || input.identityVerifiedByAdmin !== true)
      : (!input.identityChallengeId || input.identityVerifiedByAdmin !== undefined))
      throw new ApplicationError('VALIDATION_FAILED', 422);
    if (input.initialPassword !== input.confirmPassword) throw new ApplicationError('VALIDATION_FAILED', 422);
    const account = input.account.toLowerCase(), passwordHash = await this.passwords.hash(input.initialPassword);
    const { initialPassword, confirmPassword, ...safe } = input;
    return this.idempotency.execute(this.binding(p, 'createV81VerifiedSubadmin', input.identityChallengeId ?? account,
      { ...safe, account, passwordProof: this.digest.digest('subadmin-initial-password',initialPassword) }, f), async tx => {
      await this.guard(tx, p);
      await tx.$queryRaw`SELECT 1::integer AS acquired FROM pg_advisory_xact_lock(810053)`;
      const proof = direct ? null : (await tx.$queryRaw<IdentityRow[]>`SELECT * FROM v81_subadmin_identity_challenges
        WHERE id=${input.identityChallengeId!}::uuid AND organization_id=${p.organizationId}::uuid AND actor_id=${p.userId}::uuid FOR UPDATE`)[0];
      if (!direct && (!proof || proof.status !== 'VERIFIED' || this.clock.now() >= proof.expires_at))
        throw new ApplicationError('AUTH_VERIFICATION_CODE_INVALID', 401);
      const email = direct ? input.email!.toLowerCase() : proof!.email;
      const collision = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM users WHERE primary_email_normalized=${account}
        OR (primary_email_normalized=${email} AND role<>'STUDENT')
        UNION ALL SELECT user_id AS id FROM v81_account_security WHERE login_account=${account} LIMIT 1`;
      if (collision.length) throw new ApplicationError('CONFLICT_RESOURCE_ALREADY_EXISTS', 409);
      const id = randomUUID(), now = this.clock.now();
      await tx.user.create({ data: { id, organizationId: p.organizationId, role: 'ADMIN', status: 'ACTIVE', primaryEmail: email,
        primaryEmailNormalized: email, emailIdentityScope: 'SUBADMIN', emailVerifiedAt: direct ? null : now, passwordHash, createdAt: now, updatedAt: now } });
      await tx.adminProfile.create({ data: { id: randomUUID(), organizationId: p.organizationId, userId: id,
        employeeNumber: 'ADM-'+id.replaceAll('-','').slice(0,24), fullName: input.name, departmentName: input.department || null,
        status: 'ACTIVE', createdAt: now, updatedAt: now } });
      await tx.v81AccountSecurity.create({ data: { userId: id, organizationId: p.organizationId, loginAccount: account, mustChangePassword: true } });
      const permissions = ADMIN_PERMISSIONS.filter(permission => input.permissions.includes(permission));
      await tx.$executeRaw`INSERT INTO v81_admin_access(user_id,organization_id,kind,permissions) VALUES(${id}::uuid,${p.organizationId}::uuid,'SUB',${JSON.stringify(permissions)}::jsonb)`;
      if (proof) await tx.$executeRaw`UPDATE v81_subadmin_identity_challenges SET status='CONSUMED',consumed_by=${id}::uuid,version=version+1 WHERE id=${proof.id}::uuid`;
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${randomUUID()}::uuid,${p.organizationId}::uuid,'SUBADMIN',${id}::uuid,'CREATED',${p.userId}::uuid,${f.requestId},1,
        ${JSON.stringify({ identityChallengeId: proof?.id ?? null, identityVerificationMethod: direct ? 'SUPER_ADMIN_ATTESTATION' : 'EMAIL_CODE', permissions })}::jsonb,${now},'SUCCEEDED')`;
      return this.idempotency.success({ id, account, name: input.name, email, department: input.department || null,
        permissions, status: 'ACTIVE', version: 1, updatedAt: now.toISOString() }, { resourceType: 'SUBADMIN', resourceId: id });
    });
  }
  async update(p: AuthenticatedPrincipal, id: string, input: UpdateVerifiedSubadminInput, f: Facts) {
    const email = input.email.toLowerCase();
    return this.idempotency.execute(this.binding(p, 'updateV81VerifiedSubadmin', id, { ...input, email }, f), async tx => {
      await this.guard(tx, p);
      await tx.$queryRaw`SELECT 1::integer AS acquired FROM pg_advisory_xact_lock(810053)`;
      const [current] = await tx.$queryRaw<{ version: number; email: string; account: string; status: 'ACTIVE' | 'DISABLED' }[]>`
        SELECT a.version,u.primary_email_normalized AS email,s.login_account AS account,u.status
        FROM v81_admin_access a JOIN users u ON u.id=a.user_id AND u.organization_id=a.organization_id
        JOIN v81_account_security s ON s.user_id=u.id
        WHERE a.user_id=${id}::uuid AND a.organization_id=${p.organizationId}::uuid AND a.kind='SUB'
          AND u.role='ADMIN' AND u.deleted_at IS NULL FOR UPDATE OF a,u`;
      if (!current) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      if (current.version !== input.expectedVersion) throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
      const now = this.clock.now(), emailChanged = current.email !== email;
      if (emailChanged) {
        if (!input.identityChallengeId) throw new ApplicationError('AUTH_VERIFICATION_CODE_INVALID', 401);
        const [proof] = await tx.$queryRaw<IdentityRow[]>`SELECT * FROM v81_subadmin_identity_challenges
          WHERE id=${input.identityChallengeId}::uuid AND organization_id=${p.organizationId}::uuid AND actor_id=${p.userId}::uuid FOR UPDATE`;
        if (!proof || proof.email !== email || proof.status !== 'VERIFIED' || now >= proof.expires_at)
          throw new ApplicationError('AUTH_VERIFICATION_CODE_INVALID', 401);
        const collision = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM users WHERE primary_email_normalized=${email} AND role<>'STUDENT' AND id<>${id}::uuid
          UNION ALL SELECT user_id AS id FROM v81_account_security WHERE login_account=${email} AND user_id<>${id}::uuid LIMIT 1`;
        if (collision.length) throw new ApplicationError('CONFLICT_RESOURCE_ALREADY_EXISTS', 409);
        await tx.$executeRaw`UPDATE v81_subadmin_identity_challenges SET status='CONSUMED',consumed_by=${id}::uuid,version=version+1 WHERE id=${proof.id}::uuid`;
      } else if (input.identityChallengeId) throw new ApplicationError('VALIDATION_FAILED', 422);
      const permissions = ADMIN_PERMISSIONS.filter(permission => input.permissions.includes(permission));
      await tx.adminProfile.update({ where: { userId: id }, data: { fullName: input.name, departmentName: input.department || null,
        version: { increment: 1 }, updatedAt: now } });
      await tx.user.update({ where: { id }, data: { primaryEmail: email, primaryEmailNormalized: email,
        ...(emailChanged ? { emailVerifiedAt: now } : {}), version: { increment: 1 }, updatedAt: now } });
      await tx.$executeRaw`UPDATE v81_admin_access SET permissions=${JSON.stringify(permissions)}::jsonb,version=version+1 WHERE user_id=${id}::uuid`;
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${randomUUID()}::uuid,${p.organizationId}::uuid,'SUBADMIN',${id}::uuid,'PROFILE_UPDATED',${p.userId}::uuid,${f.requestId},${current.version+1},
          ${JSON.stringify({ changedFields: ['name','department','permissions',...(emailChanged ? ['email'] : [])], permissions })}::jsonb,${now},'SUCCEEDED')`;
      return this.idempotency.success({ id, account: current.account, name: input.name, email, department: input.department || null,
        permissions, status: current.status, version: current.version+1, updatedAt: now.toISOString() }, { resourceType: 'SUBADMIN', resourceId: id });
    });
  }
  async remove(p: AuthenticatedPrincipal, id: string, input: DeleteSubadminInput, f: Facts) {
    return this.idempotency.execute(this.binding(p, 'deleteV81Subadmin', id, input, f), async tx => {
      await this.guard(tx,p);
      if (!input.handoverCompleted) throw new ApplicationError('VALIDATION_FAILED',422);
      const [account] = await tx.$queryRaw<{ version: number; email: string }[]>`SELECT a.version,u.primary_email_normalized AS email
        FROM v81_admin_access a JOIN users u ON u.id=a.user_id AND u.organization_id=a.organization_id
        WHERE a.user_id=${id}::uuid AND a.organization_id=${p.organizationId}::uuid AND a.kind='SUB' AND u.role='ADMIN' FOR UPDATE OF a,u`;
      if (!account) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND',404);
      if (account.version !== input.expectedVersion) throw new ApplicationError('CONFLICT_VERSION_MISMATCH',409);
      const challenges = await tx.$queryRaw<{ id: string; email: string }[]>`SELECT id,email FROM v81_subadmin_identity_challenges
        WHERE organization_id=${p.organizationId}::uuid AND (actor_id=${id}::uuid OR consumed_by=${id}::uuid OR email=${account.email}
          OR email IN (SELECT email FROM v81_subadmin_identity_challenges WHERE consumed_by=${id}::uuid)) FOR UPDATE`;
      const hashes = [this.digest.digest('idempotency-scope',`updateV81VerifiedSubadmin\0${id}`)];
      for (const challenge of challenges) {
        hashes.push(this.digest.digest('idempotency-scope',`requestV81SubadminIdentity\0${challenge.email}`),
          this.digest.digest('idempotency-scope',`verifyV81SubadminIdentity\0${challenge.id}`),
          this.digest.digest('idempotency-scope',`createV81VerifiedSubadmin\0${challenge.id}`));
      }
      await tx.idempotencyRecord.deleteMany({ where: { organizationId:p.organizationId, OR:[{ principalId:id },
        { resourceType:'SUBADMIN',resourceId:id },{ scopeHash:{in:hashes} }] } });
      for (const challenge of challenges) await tx.$executeRaw`DELETE FROM v81_subadmin_identity_challenges WHERE id=${challenge.id}::uuid`;
      // Names are a fixed source-code allowlist; values are bound parameters.
      for (const table of ['v81_runtime_archive_capabilities','v81_account_deletion_challenges','email_verification_challenges',
        'account_recovery_challenges','student_sign_in_challenges','push_devices','user_preferences'])
        await tx.$executeRawUnsafe(`DELETE FROM ${table} WHERE user_id=$1::uuid AND organization_id=$2::uuid`,id,p.organizationId);
      await tx.$executeRaw`DELETE FROM join_capabilities WHERE organization_id=${p.organizationId}::uuid AND
        (consumed_by_user_id=${id}::uuid OR auth_session_id IN (SELECT id FROM auth_sessions WHERE user_id=${id}::uuid))`;
      await tx.$executeRaw`DELETE FROM refresh_tokens WHERE auth_session_id IN (SELECT id FROM auth_sessions WHERE user_id=${id}::uuid)`;
      await tx.authSession.deleteMany({where:{userId:id,organizationId:p.organizationId}});
      await tx.$executeRaw`DELETE FROM v81_account_security WHERE user_id=${id}::uuid`;
      await tx.$executeRaw`DELETE FROM v81_admin_access WHERE user_id=${id}::uuid`;
      await tx.adminProfile.delete({where:{userId:id}});
      await tx.user.delete({where:{id}});
      const now=this.clock.now();
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${randomUUID()}::uuid,${p.organizationId}::uuid,'SUBADMIN',${id}::uuid,'DELETED',${p.userId}::uuid,${f.requestId},${account.version+1},
        ${JSON.stringify({handoverCompleted:true})}::jsonb,${now},'SUCCEEDED')`;
      return this.idempotency.success({id,deleted:true,deletedAt:now.toISOString(),version:account.version+1});
    });
  }
}
const uuid = new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) });
@Controller('admin')
export class V81SubadminIdentityController {
  constructor(private readonly service: V81SubadminIdentityService) {}
  @Post('subadmins/:id/delete') @OperationPolicy('deleteV81Subadmin')
  remove(@CurrentPrincipal() p: AuthenticatedPrincipal, @Param('id',uuid) id: string, @Body() input: DeleteSubadminInput,
    @Headers('idempotency-key') key: string | undefined, @Req() request: FoundationRequest) {
    return this.service.remove(p,id,input,{key,requestId:request.requestId});
  }
  @Post('subadmins/:id/profile') @OperationPolicy('updateV81VerifiedSubadmin')
  update(@CurrentPrincipal() p: AuthenticatedPrincipal, @Param('id', uuid) id: string, @Body() input: UpdateVerifiedSubadminInput,
    @Headers('idempotency-key') key: string | undefined, @Req() request: FoundationRequest) {
    return this.service.update(p,id,input,{ key, requestId: request.requestId });
  }
  @Post('subadmin-identity-challenges') @OperationPolicy('requestV81SubadminIdentity')
  issue(@CurrentPrincipal() p: AuthenticatedPrincipal, @Body() input: SubadminIdentityInput,
    @Headers('idempotency-key') key: string | undefined, @Req() request: FoundationRequest) {
    return this.service.issue(p,input,{ key, requestId: request.requestId });
  }
  @Post('subadmin-identity-challenges/:id/verify') @OperationPolicy('verifyV81SubadminIdentity')
  verify(@CurrentPrincipal() p: AuthenticatedPrincipal, @Param('id', uuid) id: string, @Body() input: SubadminIdentityVerifyInput,
    @Headers('idempotency-key') key: string | undefined, @Req() request: FoundationRequest) {
    return this.service.verify(p,id,input,{ key, requestId: request.requestId });
  }
  @Post('subadmins') @OperationPolicy('createV81VerifiedSubadmin')
  create(@CurrentPrincipal() p: AuthenticatedPrincipal, @Body() input: CreateVerifiedSubadminInput,
    @Headers('idempotency-key') key: string | undefined, @Req() request: FoundationRequest) {
    return this.service.create(p,input,{ key, requestId: request.requestId });
  }
}
