import { Module } from '@nestjs/common';

import { ObjectStorageModule } from '../../common/object-storage/object-storage.module.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

@Module({
  imports: [ObjectStorageModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
