import { Module } from '@nestjs/common';

import { ObjectStorageModule } from '../../common/object-storage/object-storage.module.js';
import { MediaPolicyResolver } from '../../common/policy/media-policy-resolver.js';
import { MediaService } from './application/media.service.js';
import { MediaValidator } from './application/media-validator.js';
import { MediaProcessingWorker } from './application/media-processing.worker.js';
import { PrismaMediaPolicyResolver } from './infrastructure/prisma-media-policy-resolver.js';
import { MediaController } from './interface/http/media.controller.js';

@Module({
  imports: [ObjectStorageModule],
  controllers: [MediaController],
  providers: [
    MediaService,
    MediaValidator,
    MediaProcessingWorker,
    { provide: MediaPolicyResolver, useClass: PrismaMediaPolicyResolver },
  ],
  exports: [MediaService, MediaPolicyResolver],
})
export class MediaModule {}
