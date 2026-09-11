import { Controller, Get, Param, Query, Req } from '@nestjs/common';

import type { PagedResult } from '../../common/http/envelope.interceptor.js';
import type {
  AuthenticatedPrincipal,
  FoundationRequest,
} from '../../common/http/request-context.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { AuditLogListQueryDto, AuditLogPathDto } from './audit-logs.dto.js';
import { AuditLogsService, type AuditLogProjection } from './audit-logs.service.js';

@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogs: AuditLogsService) {}

  @Get()
  @OperationPolicy('listAuditLogs')
  list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: AuditLogListQueryDto,
    @Req() request: FoundationRequest,
  ): Promise<PagedResult<AuditLogProjection>> {
    return this.auditLogs.list(principal, query, request.requestId);
  }

  @Get(':auditLogId')
  @OperationPolicy('getAuditLog')
  get(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: AuditLogPathDto,
    @Req() request: FoundationRequest,
  ): Promise<AuditLogProjection> {
    return this.auditLogs.get(principal, path.auditLogId, request.requestId);
  }
}
