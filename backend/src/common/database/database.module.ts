import { Global, Module } from '@nestjs/common';

import { MigrationCompatibilityService } from './migration-compatibility.service.js';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [PrismaService, MigrationCompatibilityService],
  exports: [PrismaService, MigrationCompatibilityService],
})
export class DatabaseModule {}
