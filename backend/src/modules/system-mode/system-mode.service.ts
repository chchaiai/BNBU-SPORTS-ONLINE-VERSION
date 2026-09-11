import { Inject, Injectable } from '@nestjs/common';
import { RUNTIME_CONFIG } from '../../common/config/runtime-config.module.js';
import type { RuntimeConfig } from '../../common/config/environment.js';

import { PrismaService } from '../../common/database/prisma.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { SYSTEM_MODES, type SystemMode } from '../../common/policy/system-mode-policy.decorator.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { Clock } from '../../common/time/clock.js';
import { IdGenerator } from '../../common/time/id-generator.js';
import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';
import type { ChangeSystemModeInput } from './system-mode.dto.js';
import { requireAdminAccess } from '../v8/v81-admin-access.js';

export interface SystemModeProjection {
  mode: SystemMode;
  policyVersion: number;
  updatedAt: string;
}

@Injectable()
export class SystemModeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    @Inject(RUNTIME_CONFIG) private readonly config: RuntimeConfig,
  ) {}

  async announcement(organizationId?: string) {
    if (!organizationId && this.config.publicOrganizationCode) {
      const organization = await this.prisma.organization.findUnique({ where: { organizationCode: this.config.publicOrganizationCode } });
      if (!organization || organization.status !== 'ACTIVE') throw new ApplicationError('SYSTEM_SERVICE_UNAVAILABLE', 503);
      organizationId = organization.id;
    }
    const events = organizationId
      ? await this.prisma.$queryRaw<
          { facts: unknown }[]
        >`SELECT facts FROM v81_events WHERE organization_id=${organizationId}::uuid AND resource_type='SYSTEM_MODE' ORDER BY occurred_at DESC,version DESC LIMIT 1`
      : await this.prisma.$queryRaw<
          { facts: unknown }[]
        >`SELECT facts FROM v81_events e JOIN organizations o ON o.id=e.organization_id WHERE o.status='ACTIVE' AND e.resource_type='SYSTEM_MODE' ORDER BY e.occurred_at DESC,e.version DESC LIMIT 1`;
    const mode = organizationId
      ? await this.getForOrganization(organizationId)
      : await this.getPublic();
    const latest = events[0]?.facts as Record<string, unknown> | undefined;
    return {
      ...mode,
      announcement:
        mode.mode === 'MAINTENANCE' && latest
          ? {
              titleZh: latest.titleZh,
              titleEn: latest.titleEn,
              bodyZh: latest.bodyZh,
              bodyEn: latest.bodyEn,
              estimatedRecoveryAt: latest.estimatedRecoveryAt,
            }
          : null,
    };
  }

  async history(principal: AuthenticatedPrincipal, beforeVersion?: number) {
    await requireAdminAccess(this.prisma, principal, 'SYSTEM_MODE');
    if (beforeVersion !== undefined) return this.prisma.$queryRaw`SELECT id,actor_id,version,facts,occurred_at FROM v81_events
      WHERE organization_id=${principal.organizationId}::uuid AND resource_type='SYSTEM_MODE' AND version < ${beforeVersion}
      ORDER BY version DESC LIMIT 100`;
    return this.prisma.$queryRaw`SELECT id,actor_id,version,facts,occurred_at FROM v81_events
      WHERE organization_id=${principal.organizationId}::uuid AND resource_type='SYSTEM_MODE'
      ORDER BY version DESC LIMIT 100`;
  }

  async change(
    principal: AuthenticatedPrincipal,
    input: ChangeSystemModeInput,
    facts: { requestId: string; idempotencyKey: string | undefined },
  ) {
    if (
      !input.reason.trim() ||
      (input.mode === 'MAINTENANCE' &&
        [input.titleZh, input.titleEn, input.bodyZh, input.bodyEn, input.estimatedRecoveryAt].some(
          (v) => !v?.trim(),
        ))
    ) {
      throw new ApplicationError('VALIDATION_FAILED', 422);
    }
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'changeV81SystemMode',
        scope: principal.organizationId,
        key: facts.idempotencyKey,
        request: input,
        requestId: facts.requestId,
      },
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
        await requireAdminAccess(tx, principal, 'SYSTEM_MODE');
        const policy = await tx.systemPolicy.findUniqueOrThrow({
          where: { organizationId: principal.organizationId },
        });
        if (policy.version !== input.expectedVersion)
          throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
        if (policy.systemMode === input.mode)
          throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
        const now = this.clock.now();
        if (input.mode === 'MAINTENANCE') {
          await tx.$executeRaw`INSERT INTO v81_interruptions(id,organization_id,kind,started_at,reason)
          VALUES(${this.ids.next()}::uuid,${principal.organizationId}::uuid,'MAINTENANCE',${now},${input.reason})`;
        } else {
          await tx.$executeRaw`UPDATE v81_interruptions SET ended_at=${now},version=version+1
          WHERE organization_id=${principal.organizationId}::uuid AND kind='MAINTENANCE' AND ended_at IS NULL`;
        }
        const event = {
          from: policy.systemMode,
          to: input.mode,
          reason: input.reason,
          announcementPublished: input.mode === 'MAINTENANCE',
          ...(input.mode === 'MAINTENANCE'
            ? {
                titleZh: input.titleZh,
                titleEn: input.titleEn,
                bodyZh: input.bodyZh,
                bodyEn: input.bodyEn,
                estimatedRecoveryAt: input.estimatedRecoveryAt,
              }
            : {}),
        };
        const updated = await tx.systemPolicy.update({
          where: { organizationId: principal.organizationId },
          data: {
            systemMode: input.mode,
            version: policy.version + 1,
            changedBy: principal.userId,
            changeReason: input.reason,
            updatedAt: now,
          },
        });
        await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at)
        VALUES(${this.ids.next()}::uuid,${principal.organizationId}::uuid,'SYSTEM_MODE',${principal.organizationId}::uuid,'SYSTEM_MODE_CHANGED',${principal.userId}::uuid,${facts.requestId},${updated.version},${JSON.stringify(event)}::jsonb,${now})`;
        await this.audit.append(tx, {
          organizationId: principal.organizationId,
          actorUserId: principal.userId,
          actorRoleSnapshot: 'ADMIN',
          permissionId: 'SYSTEM-MODE',
          actionType: 'SYSTEM_MODE_CHANGED',
          targetType: 'SYSTEM_POLICY',
          targetId: principal.organizationId,
          requestId: facts.requestId,
          outcome: 'SUCCEEDED',
          safeMetadata: { previousMode: policy.systemMode, nextMode: input.mode },
        });
        await tx.$executeRaw`INSERT INTO notifications(id,organization_id,recipient_user_id,notification_type,title,body,created_at)
        SELECT gen_random_uuid(),u.organization_id,u.id,'SYSTEM_MODE',
          CASE WHEN p.locale='en' THEN ${input.mode === 'NORMAL' ? 'System restored' : (input.titleEn ?? '')} ELSE ${input.mode === 'NORMAL' ? '系统已恢复' : (input.titleZh ?? '')} END,
          CASE WHEN p.locale='en' THEN ${input.mode === 'NORMAL' ? 'Refresh the current system status to continue.' : (input.bodyEn ?? '')} ELSE ${input.mode === 'NORMAL' ? '请刷新当前系统状态后继续操作。' : (input.bodyZh ?? '')} END,${now}
        FROM users u LEFT JOIN user_preferences p ON p.user_id=u.id
        WHERE u.organization_id=${principal.organizationId}::uuid AND u.status='ACTIVE' AND u.deleted_at IS NULL`;
        return this.idempotency.success(
          this.project(updated.systemMode, updated.version, updated.updatedAt),
        );
      },
    );
  }

  async getForOrganization(organizationId: string): Promise<SystemModeProjection> {
    const policy = await this.prisma.systemPolicy.findUnique({
      where: { organizationId },
      include: { organization: { select: { status: true } } },
    });
    if (policy?.organization.status !== 'ACTIVE') {
      throw new ApplicationError('SYSTEM_SERVICE_UNAVAILABLE', 503);
    }
    return this.project(policy.systemMode, policy.version, policy.updatedAt);
  }

  async getPublic(): Promise<SystemModeProjection> {
    const policies = await this.prisma.systemPolicy.findMany({
      where: { organization: { status: 'ACTIVE', ...(this.config.publicOrganizationCode ? { organizationCode: this.config.publicOrganizationCode } : {}) } },
      orderBy: { organizationId: 'asc' },
    });
    if (policies.length === 0 || new Set(policies.map(({ systemMode }) => systemMode)).size !== 1) {
      throw new ApplicationError('SYSTEM_SERVICE_UNAVAILABLE', 503, {
        reason: 'PUBLIC_SYSTEM_MODE_SCOPE_UNAVAILABLE',
      });
    }
    const policy = policies[0];
    if (policy === undefined) throw new ApplicationError('SYSTEM_SERVICE_UNAVAILABLE', 503);
    const policyVersion = Math.max(...policies.map(({ version }) => version));
    const updatedAt = new Date(
      Math.max(...policies.map(({ updatedAt: value }) => value.getTime())),
    );
    return this.project(policy.systemMode, policyVersion, updatedAt);
  }

  private project(mode: string, version: number, updatedAt: Date): SystemModeProjection {
    if (!SYSTEM_MODES.includes(mode as SystemMode)) {
      throw new ApplicationError('SYSTEM_SERVICE_UNAVAILABLE', 503, {
        reason: 'UNKNOWN_SYSTEM_MODE',
      });
    }
    return { mode: mode as SystemMode, policyVersion: version, updatedAt: updatedAt.toISOString() };
  }
}
