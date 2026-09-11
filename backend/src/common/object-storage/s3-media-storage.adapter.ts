import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import {
  GetObjectCommand,
  GetBucketLocationCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'node:stream';

import type { MediaConfig, RuntimeConfig } from '../config/environment.js';
import { RUNTIME_CONFIG } from '../config/runtime-config.module.js';
import { ApplicationError } from '../errors/application-error.js';
import { MediaStoragePort, type MediaObjectMetadata } from './media-storage.port.js';
import { storageCredentials } from './tencent-cvm-role-credential-provider.js';

const STORAGE_KEY_PATTERN = /^media\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/(image|video)$/;

@Injectable()
export class S3MediaStorageAdapter extends MediaStoragePort implements OnModuleDestroy {
  private client: S3Client | null = null;
  private signingClient: S3Client | null = null;

  constructor(@Inject(RUNTIME_CONFIG) private readonly runtimeConfig: RuntimeConfig) {
    super();
  }

  async checkHealth(): Promise<void> {
    const config = this.configuration();
    await this.storageCall(() =>
      this.s3().send(new GetBucketLocationCommand({ Bucket: config.storage.bucket })),
    );
  }

  async createUploadUrl(input: {
    storageKey: string;
    contentType: string;
    contentLength: number;
    expiresInSeconds: number;
  }): Promise<{ url: string; method: 'PUT'; requiredHeaders: Record<string, string> }> {
    this.assertStorageKey(input.storageKey);
    const config = this.configuration();
    const requiredHeaders = {
      'content-type': input.contentType,
      'content-length': String(input.contentLength),
    };
    const url = await this.storageCall(() =>
      getSignedUrl(
        this.signer(),
        new PutObjectCommand({
          Bucket: config.storage.bucket,
          Key: input.storageKey,
          ContentType: input.contentType,
          ContentLength: input.contentLength,
          CacheControl: 'private, no-store',
        }),
        { expiresIn: input.expiresInSeconds },
      ),
    );
    return { url, method: 'PUT', requiredHeaders };
  }

  async headPrivateObject(storageKey: string): Promise<MediaObjectMetadata> {
    this.assertStorageKey(storageKey);
    const config = this.configuration();
    const output = await this.storageCall(() =>
      this.s3().send(new HeadObjectCommand({ Bucket: config.storage.bucket, Key: storageKey })),
    );
    return {
      entityTag: output.ETag?.replaceAll('"', '') ?? null,
      contentLength: output.ContentLength ?? null,
      contentType: output.ContentType ?? null,
    };
  }

  async getPrivateObject(storageKey: string): Promise<Readable> {
    this.assertStorageKey(storageKey);
    const config = this.configuration();
    const output = await this.storageCall(() =>
      this.s3().send(new GetObjectCommand({ Bucket: config.storage.bucket, Key: storageKey })),
    );
    if (!(output.Body instanceof Readable)) {
      throw new ApplicationError('SYSTEM_SERVICE_UNAVAILABLE', 503, {
        dependency: 'MEDIA_STORAGE',
      });
    }
    return output.Body;
  }

  async createAccessUrl(input: {
    storageKey: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<string> {
    this.assertStorageKey(input.storageKey);
    const config = this.configuration();
    return this.storageCall(() =>
      getSignedUrl(
        this.signer(),
        new GetObjectCommand({
          Bucket: config.storage.bucket,
          Key: input.storageKey,
          ResponseContentType: input.contentType,
          ResponseCacheControl: 'private, no-store',
        }),
        { expiresIn: input.expiresInSeconds },
      ),
    );
  }

  onModuleDestroy(): void {
    this.client?.destroy();
    this.client = null;
    this.signingClient?.destroy();
    this.signingClient = null;
  }

  private configuration(): MediaConfig {
    if (this.runtimeConfig.media === null) {
      throw new ApplicationError('SYSTEM_SERVICE_UNAVAILABLE', 503, {
        dependency: 'MEDIA_STORAGE',
      });
    }
    return this.runtimeConfig.media;
  }

  private s3(): S3Client {
    if (this.client !== null) return this.client;
    const config = this.configuration().storage;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: storageCredentials(config.credentials),
    });
    return this.client;
  }

  private signer(): S3Client {
    const media = this.configuration();
    if (!media.publicEndpoint || media.publicEndpoint === media.storage.endpoint) return this.s3();
    this.signingClient ??= new S3Client({ endpoint: media.publicEndpoint, region: media.storage.region,
      forcePathStyle: media.storage.forcePathStyle, credentials: storageCredentials(media.storage.credentials) });
    return this.signingClient;
  }

  private assertStorageKey(storageKey: string): void {
    if (!STORAGE_KEY_PATTERN.test(storageKey) || storageKey.includes('..')) {
      throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
        invariant: 'MEDIA_STORAGE_KEY_INVALID',
      });
    }
  }

  private async storageCall<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error: unknown) {
      const status =
        typeof error === 'object' && error !== null && '$metadata' in error
          ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
          : undefined;
      if (status === 404) throw new ApplicationError('MEDIA_OBJECT_NOT_FOUND', 404);
      throw new ApplicationError('SYSTEM_SERVICE_UNAVAILABLE', 503, {
        dependency: 'MEDIA_STORAGE',
      });
    }
  }
}
