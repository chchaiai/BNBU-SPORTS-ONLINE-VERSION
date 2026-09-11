import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/database/prisma.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';

export interface OrganizationProjection {
  id: string;
  organizationCode: string;
  legalName: string;
  displayName: string;
  timezone: string;
  defaultLocale: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async current(organizationId: string): Promise<OrganizationProjection> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (organization === null) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    if (organization.status !== 'ACTIVE') {
      throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    }
    return {
      id: organization.id,
      organizationCode: organization.organizationCode,
      legalName: organization.legalName,
      displayName: organization.displayName,
      timezone: organization.timezone,
      defaultLocale: organization.defaultLocale,
      status: organization.status,
      createdAt: organization.createdAt.toISOString(),
      updatedAt: organization.updatedAt.toISOString(),
      version: organization.version,
    };
  }
}
