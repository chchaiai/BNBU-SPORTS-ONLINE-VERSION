import { Controller, Get, Query } from '@nestjs/common';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';
import { OutboxDiagnosticsService, OutboxQuery } from './outbox-diagnostics.service.js';

import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import { type AdminHealthStatus, HealthService, type HealthStatus } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService, private readonly outbox:OutboxDiagnosticsService) {}

  @Get('admin/outbox')
  @OperationPolicy('listAdminOutboxEvents')
  listOutbox(@CurrentPrincipal() principal:AuthenticatedPrincipal,@Query() query:OutboxQuery){return this.outbox.list(principal,query);}

  @Get('live')
  @OperationPolicy('getHealthLive')
  live(): HealthStatus {
    return this.health.live();
  }

  @Get('ready')
  @OperationPolicy('getHealthReady')
  ready(): Promise<HealthStatus> {
    return this.health.ready();
  }

  @Get('admin')
  @OperationPolicy('getAdminHealth')
  admin(@CurrentPrincipal() principal:AuthenticatedPrincipal): Promise<AdminHealthStatus> {
    return this.health.admin(principal.organizationId);
  }
}
