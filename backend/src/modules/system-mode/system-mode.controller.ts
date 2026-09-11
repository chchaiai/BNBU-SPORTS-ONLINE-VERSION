import { Body, Controller, Get, Headers, Post, Query, Req } from '@nestjs/common';

import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import { SystemModeService, type SystemModeProjection } from './system-mode.service.js';
import { AllowSystemModes } from '../../common/policy/system-mode-policy.decorator.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import type {
  AuthenticatedPrincipal,
  FoundationRequest,
} from '../../common/http/request-context.js';
import { ChangeSystemModeInput, SystemModeHistoryQuery } from './system-mode.dto.js';

@Controller('system-mode')
export class SystemModeController {
  constructor(private readonly systemMode: SystemModeService) {}

  @Get()
  @OperationPolicy('getSystemMode')
  @AllowSystemModes('NORMAL', 'MAINTENANCE')
  getSystemMode(): Promise<SystemModeProjection> {
    return this.systemMode.getPublic();
  }

  @Get('announcement')
  @OperationPolicy('getV81MaintenanceAnnouncement')
  @AllowSystemModes('NORMAL', 'MAINTENANCE')
  announcement() {
    return this.systemMode.announcement();
  }

  @Get('history')
  @OperationPolicy('getV81SystemModeHistory')
  @AllowSystemModes('NORMAL', 'MAINTENANCE')
  history(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Query() query: SystemModeHistoryQuery) {
    return this.systemMode.history(principal, query.beforeVersion);
  }

  @Post('changes')
  @OperationPolicy('changeV81SystemMode')
  @AllowSystemModes('NORMAL', 'MAINTENANCE')
  change(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() input: ChangeSystemModeInput,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: FoundationRequest,
  ) {
    return this.systemMode.change(principal, input, {
      requestId: request.requestId,
      idempotencyKey: key,
    });
  }
}
