import { Inject, Injectable } from '@nestjs/common';

import type { RuntimeConfig } from '../config/environment.js';
import { RUNTIME_CONFIG } from '../config/runtime-config.module.js';
import { ApplicationError } from '../errors/application-error.js';
import { RateLimitPort } from './rate-limit.port.js';

@Injectable()
export class QrJoinPublicRateLimitService {
  constructor(
    private readonly rateLimits: RateLimitPort,
    @Inject(RUNTIME_CONFIG) private readonly config: RuntimeConfig,
  ) {}

  async enforce(keys: readonly string[]): Promise<void> {
    const decision = await this.rateLimits.consume({
      purpose: 'QR_JOIN',
      keys,
      windowSeconds: this.config.qrJoinPublicRateLimitWindowSeconds,
      maximumAttempts: this.config.qrJoinPublicRateLimitMaxRequests,
    });
    if (!decision.allowed) {
      throw new ApplicationError('AUTH_RATE_LIMITED', 429, {
        retryAfterSeconds: decision.retryAfterSeconds,
      });
    }
  }
}
