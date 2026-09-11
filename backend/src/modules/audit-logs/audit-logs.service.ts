import { Injectable } from '@nestjs/common';

import { AuditService, projectSafeAuditMetadata } from '../../common/audit/audit.service.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { pagedResult, type PagedResult } from '../../common/http/envelope.interceptor.js';
import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';
import { ScopedCursorService } from '../../common/pagination/scoped-cursor.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { AuditLogListQueryDto } from './audit-logs.dto.js';

export interface AuditLogProjection {
  id: string;
  organizationId: string;
  actorUserId: string | null;
  actorRoleSnapshot: string | null;
  permissionId: string;
  actionType: string;
  targetType: string;
  targetId: string | null;
  requestId: string;
  idempotencyKeyReference: string | null;
  outcome: string;
  reasonCode: string | null;
  safeMetadata: Record<string, unknown>;
  sourceIpHash: string | null;
  deviceFingerprintHash: string | null;
  occurredAt: string;
}

@Injectable()
export class AuditLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cursors: ScopedCursorService,
  ) {}

  async list(
    principal: AuthenticatedPrincipal,
    input: AuditLogListQueryDto,
    requestId: string,
  ): Promise<PagedResult<AuditLogProjection>> {
    this.assertAdmin(principal);
    const from = input.occurredAtFrom === undefined ? undefined : new Date(input.occurredAtFrom);
    const to = input.occurredAtTo === undefined ? undefined : new Date(input.occurredAtTo);
    if (from !== undefined && to !== undefined && from > to) {
      throw new ApplicationError('VALIDATION_FAILED', 422, {
        fieldErrors: [{ field: 'occurredAtTo', code: 'INVALID' }],
      });
    }
    const filters = {
      q: input.q ?? null,
      actorUserId: input.actorUserId ?? null,
      action: input.action ?? null,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      occurredAtFrom: input.occurredAtFrom ?? null,
      occurredAtTo: input.occurredAtTo ?? null,
    };
    const binding = {
      resource: 'AUDIT_LOG' as const,
      organizationId: principal.organizationId,
      principalId: principal.userId,
      role: principal.role,
      filters,
      sort: input.sort,
      limit: input.limit,
    };
    const position = this.cursors.decode(input.cursor, binding);
    const descending = input.sort === '-occurredAt';
    const where: Prisma.AuditLogWhereInput = {
      organizationId: principal.organizationId,
      ...(input.actorUserId === undefined ? {} : { actorUserId: input.actorUserId }),
      ...(input.action === undefined ? {} : { actionType: input.action }),
      ...(input.targetType === undefined ? {} : { targetType: input.targetType }),
      ...(input.targetId === undefined ? {} : { targetId: input.targetId }),
      ...(from === undefined && to === undefined
        ? {}
        : {
            occurredAt: {
              ...(from === undefined ? {} : { gte: from }),
              ...(to === undefined ? {} : { lte: to }),
            },
          }),
      ...(input.q === undefined
        ? {}
        : {
            OR: [
              { requestId: { contains: input.q, mode: 'insensitive' } },
              { permissionId: { contains: input.q, mode: 'insensitive' } },
              { actionType: { contains: input.q, mode: 'insensitive' } },
              { targetType: { contains: input.q, mode: 'insensitive' } },
              { reasonCode: { contains: input.q, mode: 'insensitive' } },
            ],
          }),
      ...(position === null
        ? {}
        : {
            AND: [
              {
                OR: [
                  {
                    occurredAt: descending
                      ? { lt: new Date(position.value) }
                      : { gt: new Date(position.value) },
                  },
                  {
                    occurredAt: new Date(position.value),
                    id: descending ? { lt: position.id } : { gt: position.id },
                  },
                ],
              },
            ],
          }),
    };
    const rows = await this.prisma.$transaction(async (transaction) => {
      const snapshot = await transaction.auditLog.findMany({
        where,
        orderBy: [{ occurredAt: descending ? 'desc' : 'asc' }, { id: descending ? 'desc' : 'asc' }],
        take: input.limit + 1,
      });
      await this.audit.append(transaction, {
        organizationId: principal.organizationId,
        actorUserId: principal.userId,
        actorRoleSnapshot: principal.role,
        permissionId: 'AUDIT-LOG-LIST',
        actionType: 'AUDIT_LOG_READ',
        targetType: 'AUDIT_LOG_COLLECTION',
        targetId: null,
        requestId,
        outcome: 'SUCCEEDED',
        safeMetadata: { readKind: 'LIST', resultCount: Math.min(snapshot.length, input.limit) },
      });
      return snapshot;
    });
    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    const last = page.at(-1);
    return pagedResult(
      page.map((row) => this.project(row)),
      {
        nextCursor:
          hasMore && last !== undefined
            ? this.cursors.encode(binding, { value: last.occurredAt.toISOString(), id: last.id })
            : null,
        hasMore,
        limit: input.limit,
      },
    );
  }

  async get(
    principal: AuthenticatedPrincipal,
    auditLogId: string,
    requestId: string,
  ): Promise<AuditLogProjection> {
    this.assertAdmin(principal);
    const row = await this.prisma.$transaction(async (transaction) => {
      const snapshot = await transaction.auditLog.findFirst({
        where: { id: auditLogId, organizationId: principal.organizationId },
      });
      if (snapshot === null) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      await this.audit.append(transaction, {
        organizationId: principal.organizationId,
        actorUserId: principal.userId,
        actorRoleSnapshot: principal.role,
        permissionId: 'AUDIT-LOG-READ',
        actionType: 'AUDIT_LOG_READ',
        targetType: 'AUDIT_LOG',
        targetId: snapshot.id,
        requestId,
        outcome: 'SUCCEEDED',
        safeMetadata: { readKind: 'GET', resultCount: 1 },
      });
      return snapshot;
    });
    return this.project(row);
  }

  private assertAdmin(principal: AuthenticatedPrincipal): void {
    if (principal.role !== 'ADMIN') {
      throw new ApplicationError('PERMISSION_AUDIT_SCOPE_DENIED', 403);
    }
  }

  private project(row: {
    id: string;
    organizationId: string;
    actorUserId: string | null;
    actorRoleSnapshot: string | null;
    permissionId: string;
    actionType: string;
    targetType: string;
    targetId: string | null;
    requestId: string;
    idempotencyKeyReference: string | null;
    outcome: string;
    reasonCode: string | null;
    safeMetadata: unknown;
    sourceIpHash: string | null;
    deviceFingerprintHash: string | null;
    occurredAt: Date;
  }): AuditLogProjection {
    return {
      ...row,
      safeMetadata: projectSafeAuditMetadata(row.actionType, row.safeMetadata),
      occurredAt: row.occurredAt.toISOString(),
    };
  }
}
