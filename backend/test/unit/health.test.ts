import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { RuntimeConfig } from '../../src/common/config/environment.js';
import { ApplicationError } from '../../src/common/errors/application-error.js';
import { HealthService } from '../../src/modules/health/health.service.js';

function service(
  options: {
    compatible?: boolean;
    objectStorageConfigured?: boolean;
    mediaStorageConfigured?: boolean;
    objectStorageHealth?: () => Promise<void>;
    mediaStorageHealth?: () => Promise<void>;
    queueCount?: () => Promise<number>;
  } = {},
) {
  const objectStorageConfigured = options.objectStorageConfigured ?? true;
  const mediaStorageConfigured = options.mediaStorageConfigured ?? true;
  const runtimeConfig = {
    objectStorage: objectStorageConfigured ? {} : null,
    media: mediaStorageConfigured ? {} : null,
  } as RuntimeConfig;
  const migrations = {
    check: () =>
      Promise.resolve({
        compatible: options.compatible ?? true,
        reason:
          options.compatible === false ? ('DATABASE_UNAVAILABLE' as const) : ('READY' as const),
      }),
  };
  const prisma = {
    outboxEvent: { count: options.queueCount ?? (() => Promise.resolve(3)) },
  };
  const objectStorage = {
    checkHealth: options.objectStorageHealth ?? (() => Promise.resolve()),
  };
  const mediaStorage = {
    checkHealth: options.mediaStorageHealth ?? (() => Promise.resolve()),
  };
  const clock = { now: () => new Date('2026-08-13T12:00:00.000Z') };
  const logger = { warn: () => undefined };

  return new HealthService(
    migrations as never,
    prisma as never,
    runtimeConfig,
    objectStorage as never,
    mediaStorage as never,
    clock,
    logger as never,
  );
}

describe('HealthService', () => {
  it('preserves the published public readiness projection', async () => {
    const result = await service().ready();
    assert.deepEqual(result, {
      kind: 'READY',
      status: 'UP',
      checkedAt: '2026-08-13T12:00:00.000Z',
    });
  });

  it('reports measured database, queue, object-storage and media-storage health to admins', async () => {
    const result = await service().admin();
    assert.equal(result.status, 'UP');
    assert.equal(result.dependencies.notificationQueue.backlog, 3);
    assert.equal(result.dependencies.database.status, 'UP');
    assert.equal(result.dependencies.objectStorage.status, 'UP');
    assert.equal(result.dependencies.mediaStorage.status, 'UP');
  });

  it('marks optional storage as not configured without probing it', async () => {
    let objectStorageCalls = 0;
    let mediaStorageCalls = 0;
    const result = await service({
      objectStorageConfigured: false,
      mediaStorageConfigured: false,
      objectStorageHealth: () => {
        objectStorageCalls += 1;
        return Promise.resolve();
      },
      mediaStorageHealth: () => {
        mediaStorageCalls += 1;
        return Promise.resolve();
      },
    }).admin();
    assert.equal(result.status, 'DEGRADED');
    assert.equal(result.dependencies.objectStorage.status, 'NOT_CONFIGURED');
    assert.equal(result.dependencies.mediaStorage.status, 'NOT_CONFIGURED');
    assert.equal(objectStorageCalls, 0);
    assert.equal(mediaStorageCalls, 0);
  });

  it('preserves the public readiness failure while attributing database failure in admin health', async () => {
    await assert.rejects(service({ compatible: false }).ready(), ApplicationError);
    const result = await service({ compatible: false }).admin();
    assert.equal(result.status, 'DOWN');
    assert.equal(result.dependencies.database.status, 'DOWN');
  });

  it('reports a MinIO failure without leaking adapter error details', async () => {
    const result = await service({
      objectStorageHealth: () =>
        Promise.reject(new Error('synthetic secret endpoint must not escape')),
    }).admin();
    assert.equal(result.status, 'DEGRADED');
    assert.deepEqual(Object.keys(result.dependencies.objectStorage).sort(), [
      'latencyMs',
      'status',
    ]);
    assert.equal(result.dependencies.objectStorage.status, 'DOWN');
  });
});
