import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'node:stream';

import type { RuntimeConfig, ObjectStorageConfig } from '../config/environment.js';
import { RUNTIME_CONFIG } from '../config/runtime-config.module.js';
import { ApplicationError } from '../errors/application-error.js';
import type {
  ObjectStoragePort,
  PutPrivateObjectInput,
  PutPrivateObjectResult,
} from './object-storage.port.js';
import { storageCredentials } from './tencent-cvm-role-credential-provider.js';

const STORAGE_KEY_PATTERN = /^[a-z0-9][a-z0-9/_.-]{0,511}$/;
const MULTIPART_PART_SIZE_BYTES = 5 * 1024 * 1024;

@Injectable()
export class S3ObjectStorageAdapter implements ObjectStoragePort, OnModuleDestroy {
  private client: S3Client | null = null;

  constructor(@Inject(RUNTIME_CONFIG) private readonly runtimeConfig: RuntimeConfig) {}

  async checkHealth(): Promise<void> {
    const { bucket } = this.configuration();
    await this.storageCall(() => this.s3().send(new HeadBucketCommand({ Bucket: bucket })));
  }

  async putPrivateObject(input: PutPrivateObjectInput): Promise<PutPrivateObjectResult> {
    this.assertStorageKey(input.storageKey);
    const { bucket } = this.configuration();
    const output = await this.storageCall(() =>
      new Upload({
        client: this.s3(),
        queueSize: 1,
        partSize: MULTIPART_PART_SIZE_BYTES,
        leavePartsOnError: false,
        params: {
          Bucket: bucket,
          Key: input.storageKey,
          Body: input.body,
          ContentType: input.contentType,
          CacheControl: 'private, no-store',
          ...(input.contentLength === undefined ? {} : { ContentLength: input.contentLength }),
        },
      }).done(),
    );
    return { entityTag: output.ETag?.replaceAll('"', '') ?? null };
  }

  async getPrivateObject(storageKey: string): Promise<Readable> {
    this.assertStorageKey(storageKey);
    const { bucket } = this.configuration();
    const output = await this.storageCall(() =>
      this.s3().send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: storageKey,
        }),
      ),
    );
    if (!(output.Body instanceof Readable)) {
      throw new ApplicationError('SYSTEM_SERVICE_UNAVAILABLE', 503, {
        dependency: 'OBJECT_STORAGE',
      });
    }
    return output.Body;
  }

  async deletePrivateObject(storageKey: string): Promise<void> {
    this.assertStorageKey(storageKey);
    const { bucket } = this.configuration();
    await this.storageCall(() =>
      this.s3().send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: storageKey,
        }),
      ),
    );
  }

  onModuleDestroy(): void {
    this.client?.destroy();
    this.client = null;
  }

  private configuration(): ObjectStorageConfig {
    if (this.runtimeConfig.objectStorage === null) {
      throw new ApplicationError('SYSTEM_SERVICE_UNAVAILABLE', 503, {
        dependency: 'OBJECT_STORAGE',
      });
    }
    return this.runtimeConfig.objectStorage;
  }

  private s3(): S3Client {
    if (this.client !== null) return this.client;
    const config = this.configuration();
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: storageCredentials(config.credentials),
    });
    return this.client;
  }

  private assertStorageKey(storageKey: string): void {
    if (
      !STORAGE_KEY_PATTERN.test(storageKey) ||
      storageKey.includes('//') ||
      storageKey.split('/').some((segment) => segment === '.' || segment === '..')
    ) {
      throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
        invariant: 'OBJECT_STORAGE_KEY_INVALID',
      });
    }
  }

  private unavailable(): never {
    throw new ApplicationError('SYSTEM_SERVICE_UNAVAILABLE', 503, {
      dependency: 'OBJECT_STORAGE',
    });
  }

  private async storageCall<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch {
      return this.unavailable();
    }
  }
}
