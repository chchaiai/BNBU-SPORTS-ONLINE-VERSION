import { permitsSystemMode } from '../system-mode/system-mode-access.js';
import {
  Body,
  Controller,
  Get,
  Headers,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, ValidateIf, IsUUID, Min, Max, IsArray, ArrayMaxSize, ArrayUnique } from 'class-validator';
import { PrismaService } from '../../common/database/prisma.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import type {
  AuthenticatedPrincipal,
  FoundationRequest,
} from '../../common/http/request-context.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { Clock } from '../../common/time/clock.js';
import { IdGenerator } from '../../common/time/id-generator.js';
import { requireAdminAccess, ADMIN_PERMISSIONS, type AdminPermission } from './v81-admin-access.js';
import { AuditService } from '../../common/audit/audit.service.js';

class SubadminListQuery {
  @IsOptional() @IsUUID() after?: string;
}
class SubadminStatusInput {
  @IsIn(['ACTIVE', 'DISABLED']) status!: 'ACTIVE' | 'DISABLED';
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsBoolean() handoverCompleted?: boolean;
}
class SubadminPermissionsInput {
  @IsInt() @Min(1) @Max(2147483646) expectedVersion!: number;
  @IsArray() @ArrayMaxSize(8) @ArrayUnique() @IsIn(ADMIN_PERMISSIONS, { each: true }) permissions!: AdminPermission[];
}
type SubadminRow = {
  id: string;
  account: string;
  name: string;
  email: string;
  department: string | null;
  status: string;
  permissions: string[];
  version: number;
  updatedAt: Date;
};

@Injectable()
export class V81SubadminsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly audit: AuditService,
  ) {}
  async list(principal: AuthenticatedPrincipal, after?: string) {
    await requireAdminAccess(this.prisma, principal, 'SUPER');
    const rows = await this.prisma.$queryRaw<SubadminRow[]>`
      SELECT u.id,s.login_account AS account,p.full_name AS name,u.primary_email AS email,p.department_name AS department,
        u.status,a.permissions,a.version,u.updated_at AS "updatedAt"
      FROM v81_admin_access a JOIN users u ON u.id=a.user_id JOIN admin_profiles p ON p.user_id=u.id
        JOIN v81_account_security s ON s.user_id=u.id
      WHERE a.organization_id=${principal.organizationId}::uuid AND a.kind='SUB' AND u.deleted_at IS NULL
        AND (${after ?? null}::uuid IS NULL OR u.id>${after ?? null}::uuid)
      ORDER BY u.id LIMIT 51`;
    const items = rows.slice(0, 50);
    return {
      items: items.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() })),
      nextCursor: rows.length > 50 ? (items.at(-1)?.id ?? null) : null,
    };
  }
  async status(
    principal: AuthenticatedPrincipal,
    id: string,
    input: SubadminStatusInput,
    facts: { requestId: string; idempotencyKey: string | undefined },
  ) {
    if (input.status === 'DISABLED' && input.handoverCompleted !== true)
      throw new ApplicationError('VALIDATION_FAILED', 422, {
        reason: 'HANDOVER_CONFIRMATION_REQUIRED',
      });
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'setV81SubadminStatus',
        scope: id,
        key: facts.idempotencyKey,
        request: input,
        requestId: facts.requestId,
      },
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
        await requireAdminAccess(tx, principal, 'SUPER');
        const mode = await tx.systemPolicy.findUnique({
          where: { organizationId: principal.organizationId },
        });
        if (!permitsSystemMode(mode?.systemMode, principal.role)) throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
        const access = await tx.$queryRaw<
          { version: number; kind: string }[]
        >`SELECT version,kind FROM v81_admin_access WHERE user_id=${id}::uuid AND organization_id=${principal.organizationId}::uuid FOR UPDATE`;
        const user = await tx.user.findFirst({
          where: { id, organizationId: principal.organizationId, role: 'ADMIN', deletedAt: null },
        });
        if (!user || access[0]?.kind !== 'SUB')
          throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
        if (access[0].version !== input.expectedVersion)
          throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
        if (user.status === input.status)
          throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
        const now = this.clock.now();
        await tx.user.update({
          where: { id },
          data: {
            status: input.status,
            version: { increment: 1 },
            tokenVersion: { increment: 1 },
            updatedAt: now,
          },
        });
        await tx.$executeRaw`UPDATE v81_admin_access SET version=version+1 WHERE user_id=${id}::uuid`;
        await tx.authSession.updateMany({
          where: { userId: id, status: 'ACTIVE' },
          data: {
            status: 'REVOKED',
            revokedAt: now,
            revokeReasonCode: 'ACCOUNT_STATE',
            version: { increment: 1 },
          },
        });
        await tx.refreshToken.updateMany({
          where: { authSession: { userId: id }, revokedAt: null },
          data: { revokedAt: now },
        });
        await this.audit.append(tx, {
          organizationId: principal.organizationId,
          actorUserId: principal.userId,
          actorRoleSnapshot: 'ADMIN',
          permissionId: 'SUBADMIN-MANAGE',
          actionType: 'USER_STATUS_CHANGED',
          targetType: 'USER',
          targetId: id,
          requestId: facts.requestId,
          outcome: 'SUCCEEDED',
          safeMetadata: { previousStatus: user.status, nextStatus: input.status },
        });
        await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${this.ids.next()}::uuid,${principal.organizationId}::uuid,'SUBADMIN',${id}::uuid,'STATUS_CHANGED',${principal.userId}::uuid,${facts.requestId},${input.expectedVersion + 1},${JSON.stringify({ from: user.status, to: input.status, handoverCompleted: input.handoverCompleted ?? false })}::jsonb,${now},'SUCCEEDED')`;
        return this.idempotency.success({
          id,
          status: input.status,
          version: input.expectedVersion + 1,
          updatedAt: now.toISOString(),
        });
      },
    );
  }
  async permissions(principal: AuthenticatedPrincipal, id: string, input: SubadminPermissionsInput,
    facts: { requestId: string; idempotencyKey: string | undefined }) {
    return this.idempotency.execute({ organizationId: principal.organizationId, principalId: principal.userId,
      authSessionId: principal.sessionId, operationId: 'setV81SubadminPermissions', scope: id, request: input,
      requestId: facts.requestId, key: facts.idempotencyKey }, async tx => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
      await requireAdminAccess(tx, principal, 'SUPER');
      if (!permitsSystemMode((await tx.systemPolicy.findUnique({ where: { organizationId: principal.organizationId } }))?.systemMode, principal.role)) throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
      const rows = await tx.$queryRaw<{ version: number; permissions: AdminPermission[] }[]>`SELECT a.version,a.permissions
        FROM v81_admin_access a JOIN users u ON u.id=a.user_id AND u.organization_id=a.organization_id
        WHERE a.user_id=${id}::uuid AND a.organization_id=${principal.organizationId}::uuid AND a.kind='SUB'
          AND u.role='ADMIN' AND u.deleted_at IS NULL FOR UPDATE OF a,u`;
      const current = rows[0];
      if (!current) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      if (current.version !== input.expectedVersion) throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
      const permissions = ADMIN_PERMISSIONS.filter(permission => input.permissions.includes(permission)), now = this.clock.now();
      await tx.$executeRaw`UPDATE v81_admin_access SET permissions=${JSON.stringify(permissions)}::jsonb,version=version+1 WHERE user_id=${id}::uuid`;
      await tx.user.update({ where: { id }, data: { updatedAt: now, version: { increment: 1 } } });
      await this.audit.append(tx, { organizationId: principal.organizationId, actorUserId: principal.userId,
        actorRoleSnapshot: 'ADMIN', permissionId: 'SUBADMIN-MANAGE', actionType: 'USER_PROFILE_UPDATED', targetType: 'USER',
        targetId: id, requestId: facts.requestId, outcome: 'SUCCEEDED', safeMetadata: { changedFields: ['permissions'] } });
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${this.ids.next()}::uuid,${principal.organizationId}::uuid,'SUBADMIN',${id}::uuid,'PERMISSIONS_CHANGED',${principal.userId}::uuid,
          ${facts.requestId},${current.version + 1},${JSON.stringify({ from: current.permissions, to: permissions })}::jsonb,${now},'SUCCEEDED')`;
      return this.idempotency.success({ id, permissions, version: current.version + 1, updatedAt: now.toISOString() });
    });
  }
}

@Controller('admin/subadmins')
export class V81SubadminsController {
  constructor(private readonly service: V81SubadminsService) {}
  @Post(':id/permissions')
  @OperationPolicy('setV81SubadminPermissions')
  permissions(@CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) })) id: string,
    @Body() input: SubadminPermissionsInput, @Headers('idempotency-key') key: string | undefined, @Req() request: FoundationRequest) {
    return this.service.permissions(principal, id, input, { requestId: request.requestId, idempotencyKey: key });
  }
  @Get()
  @OperationPolicy('listV81Subadmins')
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Query() query: SubadminListQuery) {
    return this.service.list(principal, query.after);
  }
  @Post(':id/status')
  @OperationPolicy('setV81SubadminStatus')
  status(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param(
      'id',
      new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) }),
    )
    id: string,
    @Body() input: SubadminStatusInput,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: FoundationRequest,
  ) {
    return this.service.status(principal, id, input, {
      requestId: request.requestId,
      idempotencyKey: key,
    });
  }
}
