import { Module } from '@nestjs/common';

import { ObjectStorageModule } from '../object-storage/object-storage.module.js';
import { RosterCsvParserService } from './roster-csv-parser.service.js';
import { RosterMultipartUploadService } from './roster-multipart-upload.service.js';

@Module({
  imports: [ObjectStorageModule],
  providers: [RosterMultipartUploadService, RosterCsvParserService],
  exports: [RosterMultipartUploadService, RosterCsvParserService, ObjectStorageModule],
})
export class RosterIngestionModule {}
