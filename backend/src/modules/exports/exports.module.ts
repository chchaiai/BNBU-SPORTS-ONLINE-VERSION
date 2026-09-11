import { Module } from '@nestjs/common';

import { ExportsController } from './exports.controller.js';
import { ExportsService } from './exports.service.js';

@Module({ controllers: [ExportsController], providers: [ExportsService] })
export class ExportsModule {}
