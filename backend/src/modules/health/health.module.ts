import { Module } from '@nestjs/common';

import { ObjectStorageModule } from '../../common/object-storage/object-storage.module.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';
import { OutboxDiagnosticsService } from './outbox-diagnostics.service.js';

@Module({
  imports: [ObjectStorageModule],
  controllers: [HealthController],
  providers: [HealthService, OutboxDiagnosticsService],
})
export class HealthModule {}
