import { Controller, Get } from '@nestjs/common';

import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import { type AdminHealthStatus, HealthService, type HealthStatus } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

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
  admin(): Promise<AdminHealthStatus> {
    return this.health.admin();
  }
}
