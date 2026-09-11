import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import type { RuntimeConfig } from '../config/environment.js';
import { RUNTIME_CONFIG } from '../config/runtime-config.module.js';
import { PrismaClient } from '../../generated/prisma/client.js';
import { createPrismaPgConfiguration } from './postgres-tls.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(RUNTIME_CONFIG) config: RuntimeConfig) {
    const postgres = createPrismaPgConfiguration(config.databaseUrl, config.tencentDbCaFile);
    super({
      adapter: new PrismaPg(
        {
          ...postgres.pool,
          connectionTimeoutMillis: Math.min(config.requestTimeoutMs, 5_000),
          max: 10,
        },
        { schema: postgres.schema },
      ),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
