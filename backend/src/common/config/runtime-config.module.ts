import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { RuntimeConfig } from './environment.js';

export const RUNTIME_CONFIG = Symbol('RUNTIME_CONFIG');

@Global()
@Module({
  providers: [
    {
      provide: RUNTIME_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): RuntimeConfig =>
        configService.getOrThrow<RuntimeConfig>('RUNTIME_CONFIG'),
    },
  ],
  exports: [RUNTIME_CONFIG],
})
export class RuntimeConfigModule {}
