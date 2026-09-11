import { Global, Module } from '@nestjs/common';

import { PostgresRateLimitAdapter } from './postgres-rate-limit.adapter.js';
import { RateLimitPort } from './rate-limit.port.js';
import { QrJoinPublicRateLimitService } from './qr-join-public-rate-limit.service.js';

@Global()
@Module({
  providers: [
    { provide: RateLimitPort, useClass: PostgresRateLimitAdapter },
    QrJoinPublicRateLimitService,
  ],
  exports: [RateLimitPort, QrJoinPublicRateLimitService],
})
export class RateLimitModule {}
