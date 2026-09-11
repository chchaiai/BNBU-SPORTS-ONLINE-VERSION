import { Module } from '@nestjs/common';

import { SystemModeController } from './system-mode.controller.js';
import { SystemModeGuard } from './system-mode.guard.js';
import { SystemModeService } from './system-mode.service.js';

@Module({
  controllers: [SystemModeController],
  providers: [SystemModeService, SystemModeGuard],
  exports: [SystemModeService, SystemModeGuard],
})
export class SystemModeModule {}
