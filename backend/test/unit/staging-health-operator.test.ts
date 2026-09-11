import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import {
  loadStagingFixturePassword,
  STAGING_FIXTURE_AUDIT_ACTION,
  STAGING_FIXTURE_PERMISSION_ID,
  STAGING_OPERATOR_CONFIRMATION,
  STAGING_OPERATOR_INTERNAL_BASE_URL,
  validateStagingOperatorControls,
} from '../../src/tools/staging-health-operator.js';

const SYNTHETIC_PASSWORD = 'Synthetic-Staging-Health-Only-2026';

describe('staging health operator safety gates', () => {
  it('uses database-valid closed-catalog audit identifiers', () => {
    assert.equal(STAGING_FIXTURE_AUDIT_ACTION, 'STAGING_FIXTURE_BOOTSTRAP');
    assert.match(STAGING_FIXTURE_PERMISSION_ID, /^[A-Z][A-Z0-9-]*$/u);
  });

  it('requires staging, an exact confirmation, an absolute secret path and the Docker URL', () => {
    const environment: NodeJS.ProcessEnv = {
      APP_ENV: 'staging',
      STAGING_BOOTSTRAP_CONFIRMATION: STAGING_OPERATOR_CONFIRMATION,
      STAGING_FIXTURE_SECRET_FILE: resolve('synthetic-fixture.json'),
      STAGING_BACKEND_INTERNAL_BASE_URL: STAGING_OPERATOR_INTERNAL_BASE_URL,
    };
    assert.deepEqual(validateStagingOperatorControls(environment, 'verify'), {
      fixtureSecretFile: resolve('synthetic-fixture.json'),
      internalBaseUrl: STAGING_OPERATOR_INTERNAL_BASE_URL,
    });

    assert.throws(
      () => validateStagingOperatorControls({ ...environment, APP_ENV: 'production' }, 'bootstrap'),
      /APP_ENV_NOT_STAGING/,
    );
    assert.throws(
      () =>
        validateStagingOperatorControls(
          { ...environment, STAGING_BOOTSTRAP_CONFIRMATION: 'wrong' },
          'bootstrap',
        ),
      /CONFIRMATION_MISMATCH/,
    );
    assert.throws(
      () =>
        validateStagingOperatorControls(
          { ...environment, STAGING_BACKEND_INTERNAL_BASE_URL: 'http://127.0.0.1:3000/api/v1' },
          'verify',
        ),
      /INTERNAL_BASE_URL_MISMATCH/,
    );
  });

  it('loads only the isolated fixture password key and never echoes invalid values', async () => {
    const password = await loadStagingFixturePassword('/run/secrets/synthetic.json', {
      readSecretFile: () =>
        Promise.resolve(
          Buffer.from(JSON.stringify({ STAGING_ADMIN_PASSWORD: SYNTHETIC_PASSWORD })),
        ),
    });
    assert.equal(password, SYNTHETIC_PASSWORD);

    const leakedValue = 'must-never-appear-in-an-error';
    await assert.rejects(
      loadStagingFixturePassword('/run/secrets/synthetic.json', {
        readSecretFile: () =>
          Promise.resolve(
            Buffer.from(
              JSON.stringify({
                STAGING_ADMIN_PASSWORD: SYNTHETIC_PASSWORD,
                UNEXPECTED: leakedValue,
              }),
            ),
          ),
      }),
      (error) =>
        error instanceof Error &&
        error.message === 'FIXTURE_SECRET_KEYS_INVALID' &&
        !error.message.includes(leakedValue),
    );
  });
});
