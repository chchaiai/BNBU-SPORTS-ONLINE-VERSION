import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { describe, it } from 'node:test';

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  PutObjectCommand,
  UploadPartCommand,
  type S3Client,
} from '@aws-sdk/client-s3';

import { validateEnvironment, type RuntimeConfig } from '../../src/common/config/environment.js';
import { ApplicationError } from '../../src/common/errors/application-error.js';
import { S3ObjectStorageAdapter } from '../../src/common/object-storage/s3-object-storage.adapter.js';
import { foundationEnvironment } from '../helpers/test-environment.js';

const MEBIBYTE = 1024 * 1024;

function runtimeConfig(): RuntimeConfig {
  return validateEnvironment({
    ...foundationEnvironment('postgresql://test:test@127.0.0.1:1/s3_adapter_test', 0),
    OBJECT_STORAGE_REQUIRED: 'true',
    OBJECT_STORAGE_ENDPOINT: 'http://object-storage.test:9000',
    OBJECT_STORAGE_REGION: 'us-east-1',
    OBJECT_STORAGE_BUCKET: 'stage13-private',
    OBJECT_STORAGE_ACCESS_KEY: 'synthetic-access-key',
    OBJECT_STORAGE_SECRET_KEY: 'synthetic-secret-key',
    OBJECT_STORAGE_FORCE_PATH_STYLE: 'true',
  }).RUNTIME_CONFIG as RuntimeConfig;
}

interface FakeClient {
  readonly config: {
    readonly endpoint: () => Promise<URL>;
    readonly forcePathStyle: true;
    readonly requestChecksumCalculation: () => Promise<'WHEN_REQUIRED'>;
    readonly requestHandler: object;
  };
  send(command: unknown): Promise<Record<string, unknown>>;
}

function adapterWithClient(client: FakeClient): S3ObjectStorageAdapter {
  const adapter = new S3ObjectStorageAdapter(runtimeConfig());
  (adapter as unknown as { client: S3Client }).client = client as unknown as S3Client;
  return adapter;
}

function chunkedBody(chunkCount: number, onChunk: () => void): Readable {
  return Readable.from(
    (function* () {
      for (let index = 0; index < chunkCount; index += 1) {
        onChunk();
        yield Buffer.alloc(MEBIBYTE, index);
      }
    })(),
  );
}

describe('S3 object storage streaming uploads', () => {
  it('uploads an unknown-length stream in bounded multipart chunks without buffering the whole file', async () => {
    let chunksRead = 0;
    let chunksReadAtFirstPart: number | null = null;
    const uploadedPartSizes: number[] = [];
    let completedParts = 0;

    const client: FakeClient = {
      config: {
        endpoint: () => Promise.resolve(new URL('http://object-storage.test:9000')),
        forcePathStyle: true,
        requestChecksumCalculation: () => Promise.resolve('WHEN_REQUIRED'),
        requestHandler: {},
      },
      send(command): Promise<Record<string, unknown>> {
        if (command instanceof CreateMultipartUploadCommand) {
          assert.equal(command.input.CacheControl, 'private, no-store');
          assert.equal(command.input.ContentType, 'text/csv');
          assert.equal((command.input as { ContentLength?: number }).ContentLength, undefined);
          return Promise.resolve({ UploadId: 'synthetic-upload-id' });
        }
        if (command instanceof UploadPartCommand) {
          chunksReadAtFirstPart ??= chunksRead;
          const body = command.input.Body;
          assert.ok(body instanceof Uint8Array);
          uploadedPartSizes.push(body.byteLength);
          return Promise.resolve({ ETag: `"part-${String(command.input.PartNumber)}"` });
        }
        if (command instanceof CompleteMultipartUploadCommand) {
          completedParts = command.input.MultipartUpload?.Parts?.length ?? 0;
          return Promise.resolve({ ETag: '"final-etag"' });
        }
        return Promise.reject(
          new Error(`Unexpected S3 command: ${command?.constructor.name ?? 'unknown'}`),
        );
      },
    };

    const adapter = adapterWithClient(client);
    const result = await adapter.putPrivateObject({
      storageKey: 'roster-sources/section/import.csv',
      body: chunkedBody(12, () => {
        chunksRead += 1;
      }),
      contentType: 'text/csv',
    });

    assert.equal(result.entityTag, 'final-etag');
    assert.equal(chunksRead, 12);
    assert.ok(chunksReadAtFirstPart !== null && chunksReadAtFirstPart < chunksRead);
    assert.deepEqual(uploadedPartSizes, [5 * MEBIBYTE, 5 * MEBIBYTE, 2 * MEBIBYTE]);
    assert.equal(completedParts, 3);
  });

  it('uses the managed uploader for a small unknown-length stream', async () => {
    let putObjectBody: unknown;
    const client: FakeClient = {
      config: {
        endpoint: () => Promise.resolve(new URL('http://object-storage.test:9000')),
        forcePathStyle: true,
        requestChecksumCalculation: () => Promise.resolve('WHEN_REQUIRED'),
        requestHandler: {},
      },
      send(command): Promise<Record<string, unknown>> {
        try {
          assert.ok(command instanceof PutObjectCommand);
          putObjectBody = command.input.Body;
          assert.equal(command.input.CacheControl, 'private, no-store');
          assert.equal(command.input.ContentLength, undefined);
          return Promise.resolve({ ETag: '"single-etag"' });
        } catch (error) {
          return Promise.reject(
            error instanceof Error ? error : new Error('Unexpected test error'),
          );
        }
      },
    };

    const originalBody = Readable.from([Buffer.from('synthetic roster')]);
    const result = await adapterWithClient(client).putPrivateObject({
      storageKey: 'roster-sources/section/small.csv',
      body: originalBody,
      contentType: 'text/csv',
    });

    assert.equal(result.entityTag, 'single-etag');
    assert.ok(putObjectBody instanceof Uint8Array);
    assert.notEqual(putObjectBody, originalBody);
  });

  it('aborts a failed multipart upload and maps the failure to the stable dependency error', async () => {
    let uploadedParts = 0;
    let aborted = false;
    let completed = false;
    const client: FakeClient = {
      config: {
        endpoint: () => Promise.resolve(new URL('http://object-storage.test:9000')),
        forcePathStyle: true,
        requestChecksumCalculation: () => Promise.resolve('WHEN_REQUIRED'),
        requestHandler: {},
      },
      send(command): Promise<Record<string, unknown>> {
        if (command instanceof CreateMultipartUploadCommand) {
          return Promise.resolve({ UploadId: 'synthetic-failed-upload-id' });
        }
        if (command instanceof UploadPartCommand) {
          uploadedParts += 1;
          if (uploadedParts === 2) return Promise.reject(new Error('synthetic transport failure'));
          return Promise.resolve({ ETag: `"part-${String(command.input.PartNumber)}"` });
        }
        if (command instanceof AbortMultipartUploadCommand) {
          aborted = true;
          return Promise.resolve({});
        }
        if (command instanceof CompleteMultipartUploadCommand) {
          completed = true;
          return Promise.resolve({});
        }
        return Promise.reject(
          new Error(`Unexpected S3 command: ${command?.constructor.name ?? 'unknown'}`),
        );
      },
    };

    const operation = adapterWithClient(client).putPrivateObject({
      storageKey: 'roster-sources/section/failing.csv',
      body: chunkedBody(11, () => undefined),
      contentType: 'text/csv',
    });

    await assert.rejects(operation, (error: unknown) => {
      assert.ok(error instanceof ApplicationError);
      assert.equal(error.code, 'SYSTEM_SERVICE_UNAVAILABLE');
      assert.equal(error.status, 503);
      assert.deepEqual(error.details, { dependency: 'OBJECT_STORAGE' });
      return true;
    });
    assert.equal(aborted, true);
    assert.equal(completed, false);
  });
});
