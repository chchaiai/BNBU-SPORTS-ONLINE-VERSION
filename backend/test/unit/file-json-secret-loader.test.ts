import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  loadRuntimeSecrets,
  RUNTIME_SECRET_KEYS,
} from '../../src/common/config/file-json-secret-loader.js';

function environment(): NodeJS.ProcessEnv {
  return {
    APP_ENV: 'staging',
    RUNTIME_SECRET_PROVIDER: 'FILE_JSON',
    RUNTIME_SECRET_FILE: '/run/secrets/bnbu_runtime.json',
  };
}

function runtimeSecret(): Record<(typeof RUNTIME_SECRET_KEYS)[number], string> {
  return Object.fromEntries(
    RUNTIME_SECRET_KEYS.map((key, index) => [key, `synthetic-value-${index + 1}`]),
  ) as Record<(typeof RUNTIME_SECRET_KEYS)[number], string>;
}

describe('FILE_JSON runtime secret loader', () => {
  it('loads only the frozen runtime keys from the mounted file', async () => {
    const raw = environment();
    const paths: string[] = [];
    const result = await loadRuntimeSecrets(raw, {
      readSecretFile: (path) => {
        paths.push(path);
        return Promise.resolve(Buffer.from(JSON.stringify(runtimeSecret())));
      },
    });

    assert.deepEqual(paths, ['/run/secrets/bnbu_runtime.json']);
    assert.equal(result.provider, 'FILE_JSON');
    assert.deepEqual(result.injectedKeys, RUNTIME_SECRET_KEYS);
    for (const key of RUNTIME_SECRET_KEYS) assert.match(raw[key] ?? '', /^synthetic-value-/);
  });

  it('reports every missing key by name without returning secret values', async () => {
    const secret = runtimeSecret();
    delete (secret as Partial<typeof secret>).DATABASE_URL;
    delete (secret as Partial<typeof secret>).PUSH_TOKEN_ENCRYPTION_KEY;

    await assert.rejects(
      loadRuntimeSecrets(environment(), {
        readSecretFile: () => Promise.resolve(Buffer.from(JSON.stringify(secret))),
      }),
      (error: unknown) =>
        error instanceof Error &&
        error.message.includes('DATABASE_URL') &&
        error.message.includes('PUSH_TOKEN_ENCRYPTION_KEY') &&
        !error.message.includes('synthetic-value'),
    );
  });

  it('rejects unsupported keys and duplicate container secrets', async () => {
    const unsupported = { ...runtimeSecret(), APP_ENV: 'production-secret-injection' };
    await assert.rejects(
      loadRuntimeSecrets(environment(), {
        readSecretFile: () => Promise.resolve(Buffer.from(JSON.stringify(unsupported))),
      }),
      /unsupported keys: APP_ENV/,
    );

    const duplicate = environment();
    duplicate.DATABASE_URL = 'must-not-compete-with-file-json';
    await assert.rejects(
      loadRuntimeSecrets(duplicate, {
        readSecretFile: () => Promise.resolve(Buffer.from(JSON.stringify(runtimeSecret()))),
      }),
      (error: unknown) =>
        error instanceof Error &&
        error.message.includes('DATABASE_URL') &&
        !error.message.includes('must-not-compete-with-file-json'),
    );
  });

  it('requires FILE_JSON for staging and production but preserves local environment configuration', async () => {
    await assert.rejects(
      loadRuntimeSecrets({ APP_ENV: 'staging', RUNTIME_SECRET_PROVIDER: 'ENVIRONMENT' }),
      /must be FILE_JSON/,
    );
    assert.deepEqual(await loadRuntimeSecrets({ APP_ENV: 'local' }), {
      provider: 'ENVIRONMENT',
      injectedKeys: [],
    });
  });

  it('redacts file-system failure details from the bootstrap error', async () => {
    await assert.rejects(
      loadRuntimeSecrets(environment(), {
        readSecretFile: () => Promise.reject(new Error('sensitive file-system detail')),
      }),
      (error: unknown) =>
        error instanceof Error && error.message === 'Runtime JSON secret file could not be loaded',
    );
  });
});
