import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ApplicationError } from '../../src/common/errors/application-error.js';
import { ClientCapabilitiesService } from '../../src/modules/client-capabilities/client-capabilities.service.js';

const student = {
  userId: '0198c74b-7dc0-7000-8000-000000000001',
  organizationId: '0198c74b-7dc0-7000-8000-000000000002',
  role: 'STUDENT' as const,
  sessionId: '0198c74b-7dc0-7000-8000-000000000003',
  tokenVersion: 0,
  jti: '0198c74b-7dc0-7000-8000-000000000004',
};

describe('Stage 21 client capability boundary', () => {
  it('returns the same stable default-deny error for public and authenticated capabilities', () => {
    const service = new ClientCapabilitiesService();
    for (const principal of [undefined, student]) {
      assert.throws(
        () => service.deny(principal),
        (error: unknown) =>
          error instanceof ApplicationError &&
          error.code === 'SYSTEM_MODE_UNSUPPORTED' &&
          error.status === 503,
      );
    }
  });
});
