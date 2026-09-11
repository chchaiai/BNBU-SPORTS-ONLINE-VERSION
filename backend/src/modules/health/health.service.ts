import { Inject, Injectable } from '@nestjs/common';

import type { RuntimeConfig } from '../../common/config/environment.js';
import { RUNTIME_CONFIG } from '../../common/config/runtime-config.module.js';
import { MigrationCompatibilityService } from '../../common/database/migration-compatibility.service.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { JsonLoggerService } from '../../common/logging/json-logger.service.js';
import {
  MEDIA_STORAGE_PORT,
  MediaStoragePort,
} from '../../common/object-storage/media-storage.port.js';
import {
  OBJECT_STORAGE_PORT,
  type ObjectStoragePort,
} from '../../common/object-storage/object-storage.port.js';
import { Clock } from '../../common/time/clock.js';

export interface HealthStatus {
  kind: 'LIVE' | 'READY';
  status: 'UP';
  checkedAt: string;
}

export interface AdminHealthDependencyStatus {
  status: 'UP' | 'DOWN' | 'NOT_CONFIGURED';
  latencyMs: number | null;
  backlog?: number;
}

export interface AdminHealthStatus {
  kind: 'ADMIN';
  status: 'UP' | 'DEGRADED' | 'DOWN';
  checkedAt: string;
  dependencies: {
    database: AdminHealthDependencyStatus;
    notificationQueue: AdminHealthDependencyStatus;
    objectStorage: AdminHealthDependencyStatus;
    mediaStorage: AdminHealthDependencyStatus;
  };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly migrations: MigrationCompatibilityService,
    private readonly prisma: PrismaService,
    @Inject(RUNTIME_CONFIG) private readonly runtimeConfig: RuntimeConfig,
    @Inject(OBJECT_STORAGE_PORT) private readonly objectStorage: ObjectStoragePort,
    @Inject(MEDIA_STORAGE_PORT) private readonly mediaStorage: MediaStoragePort,
    private readonly clock: Clock,
    private readonly logger: JsonLoggerService,
  ) {}

  live(): HealthStatus {
    return { kind: 'LIVE', status: 'UP', checkedAt: this.clock.now().toISOString() };
  }

  async ready(): Promise<HealthStatus> {
    const compatibility = await this.migrations.check();
    if (!compatibility.compatible) {
      this.logger.warn({ readiness: compatibility.reason }, HealthService.name);
      throw new ApplicationError('SYSTEM_SERVICE_UNAVAILABLE', 503);
    }
    return { kind: 'READY', status: 'UP', checkedAt: this.clock.now().toISOString() };
  }

  async admin(): Promise<AdminHealthStatus> {
    const [database, notificationQueue, objectStorage, mediaStorage] = await Promise.all([
      this.measure('DATABASE', async () => {
        const compatibility = await this.migrations.check();
        if (!compatibility.compatible) throw new Error('MIGRATION_STATE_INCOMPATIBLE');
      }),
      this.measure('NOTIFICATION_QUEUE', async () =>
        this.prisma.outboxEvent.count({ where: { status: { in: ['PENDING', 'FAILED'] } } }),
      ),
      this.runtimeConfig.objectStorage === null
        ? this.notConfigured()
        : this.measure('OBJECT_STORAGE', () => this.objectStorage.checkHealth()),
      this.runtimeConfig.media === null
        ? this.notConfigured()
        : this.measure('MEDIA_STORAGE', () => this.mediaStorage.checkHealth()),
    ]);
    const dependencies = { database, notificationQueue, objectStorage, mediaStorage };
    const status =
      database.status === 'DOWN' || notificationQueue.status === 'DOWN'
        ? 'DOWN'
        : Object.values(dependencies).some((dependency) => dependency.status !== 'UP')
          ? 'DEGRADED'
          : 'UP';
    return {
      kind: 'ADMIN',
      status,
      checkedAt: this.clock.now().toISOString(),
      dependencies,
    };
  }

  private notConfigured(): AdminHealthDependencyStatus {
    return { status: 'NOT_CONFIGURED', latencyMs: null };
  }

  private async measure(
    dependency: 'DATABASE' | 'NOTIFICATION_QUEUE' | 'OBJECT_STORAGE' | 'MEDIA_STORAGE',
    probe: () => Promise<number | void>,
  ): Promise<AdminHealthDependencyStatus> {
    const startedAt = performance.now();
    try {
      const result = await probe();
      return {
        status: 'UP',
        latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
        ...(typeof result === 'number' ? { backlog: result } : {}),
      };
    } catch (error) {
      this.logger.warn(
        {
          healthDependency: dependency,
          outcome: 'DOWN',
          errorName: error instanceof Error ? error.name : 'UnknownError',
        },
        HealthService.name,
      );
      return {
        status: 'DOWN',
        latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      };
    }
  }
}
