import { Controller, Get } from '@nestjs/common';

import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OrganizationsService, type OrganizationProjection } from './organizations.service.js';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get('current')
  @OperationPolicy('getCurrentOrganization')
  current(@CurrentPrincipal() principal: AuthenticatedPrincipal): Promise<OrganizationProjection> {
    return this.organizations.current(principal.organizationId);
  }
}
