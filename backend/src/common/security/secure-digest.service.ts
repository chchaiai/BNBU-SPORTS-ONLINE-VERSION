import { createHmac } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { RUNTIME_CONFIG } from '../config/runtime-config.module.js';
import type { RuntimeConfig } from '../config/environment.js';

@Injectable()
export class SecureDigestService {
  constructor(@Inject(RUNTIME_CONFIG) private readonly config: RuntimeConfig) {}

  digest(domain: string, value: string): string {
    return createHmac('sha256', this.config.securityHashKey)
      .update(domain)
      .update('\0')
      .update(value)
      .digest('hex');
  }
}
