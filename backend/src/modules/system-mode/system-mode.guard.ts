import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ApplicationError } from '../../common/errors/application-error.js';
import type { FoundationRequest } from '../../common/http/request-context.js';
import {
  SYSTEM_MODE_ALLOWLIST_METADATA,
  type SystemMode,
} from '../../common/policy/system-mode-policy.decorator.js';
import { SystemModeService } from './system-mode.service.js';

@Injectable()
export class SystemModeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly systemMode: SystemModeService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FoundationRequest>();
    if (
      request.method === 'OPTIONS' ||
      ['getHealthLive', 'getHealthReady'].includes(request.operationId ?? '')
    ) {
      return true;
    }

    const explicit = this.reflector.getAllAndOverride<readonly SystemMode[]>(
      SYSTEM_MODE_ALLOWLIST_METADATA,
      [context.getHandler(), context.getClass()],
    );
    const allowed = explicit ?? (['NORMAL'] as const);
    const organizationId = request.principal?.organizationId ?? request.resourceOrganizationId;
    const projection =
      organizationId === undefined
        ? await this.systemMode.getPublic()
        : await this.systemMode.getForOrganization(organizationId);
    if (allowed.includes(projection.mode)) return true;
    if (projection.mode === 'MAINTENANCE' && request.principal?.role === 'ADMIN') return true;
    if (projection.mode === 'MAINTENANCE') throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
    throw new ApplicationError('SYSTEM_MODE_UNSUPPORTED', 503);
  }
}
