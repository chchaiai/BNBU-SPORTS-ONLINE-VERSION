import { Module } from '@nestjs/common';

import { RosterIngestionModule } from '../../common/roster-ingestion/roster-ingestion.module.js';
import { RosterAlignmentService } from './application/roster-alignment.service.js';
import { RosterImportsService } from './application/roster-imports.service.js';
import { RosterController } from './interface/http/roster.controller.js';

@Module({
  imports: [RosterIngestionModule],
  controllers: [RosterController],
  providers: [RosterImportsService, RosterAlignmentService],
  exports: [RosterImportsService, RosterAlignmentService],
})
export class RosterModule {}
