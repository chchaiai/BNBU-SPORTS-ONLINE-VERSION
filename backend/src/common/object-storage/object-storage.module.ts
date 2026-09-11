import { Module } from '@nestjs/common';

import { OBJECT_STORAGE_PORT } from './object-storage.port.js';
import { S3ObjectStorageAdapter } from './s3-object-storage.adapter.js';
import { MEDIA_STORAGE_PORT } from './media-storage.port.js';
import { S3MediaStorageAdapter } from './s3-media-storage.adapter.js';

@Module({
  providers: [
    S3ObjectStorageAdapter,
    { provide: OBJECT_STORAGE_PORT, useExisting: S3ObjectStorageAdapter },
    S3MediaStorageAdapter,
    { provide: MEDIA_STORAGE_PORT, useExisting: S3MediaStorageAdapter },
  ],
  exports: [OBJECT_STORAGE_PORT, MEDIA_STORAGE_PORT],
})
export class ObjectStorageModule {}
