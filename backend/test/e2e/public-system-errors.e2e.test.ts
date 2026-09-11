import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';

import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { foundationEnvironment, requireTestDatabaseUrl } from '../helpers/test-environment.js';

interface ErrorBody {
  code: string;
  message: string;
  requestId: string;
  timestamp: string;
}

function compiledModule(relativePath: string): string {
  return pathToFileURL(resolve('dist', relativePath)).href;
}

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  await new Promise<void>((resolvePromise, reject) =>
    server.close((error) => (error ? reject(error) : resolvePromise())),
  );
  return address.port;
}

describe('Public system endpoint error conformance', () => {
  let app: INestApplication;
  let baseUrl: string;

  before(async () => {
    const databaseUrl = requireTestDatabaseUrl();
    const port = await availablePort();
    Object.assign(process.env, foundationEnvironment(databaseUrl, port));
    const { AppModule } = (await import(compiledModule('app.module.js'))) as {
      AppModule: Type<unknown>;
    };
    const { ApplicationError } = (await import(
      compiledModule('common/errors/application-error.js')
    )) as {
      ApplicationError: new (code: string, status: number) => Error;
    };
    const { HealthService } = (await import(
      compiledModule('modules/health/health.service.js')
    )) as { HealthService: Type<unknown> };
    const { SystemModeService } = (await import(
      compiledModule('modules/system-mode/system-mode.service.js')
    )) as { SystemModeService: Type<unknown> };
    const { RequestIdMiddleware } = (await import(compiledModule('common/http/request-id.js'))) as {
      RequestIdMiddleware: Type<{ use: (...arguments_: unknown[]) => void }>;
    };

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(HealthService)
      .useValue({
        live: () => {
          throw new ApplicationError('SYSTEM_INTERNAL_ERROR', 500);
        },
        ready: () => {
          throw new ApplicationError('SYSTEM_SERVICE_UNAVAILABLE', 503);
        },
      })
      .overrideProvider(SystemModeService)
      .useValue({
        getPublic: () => {
          throw new ApplicationError('SYSTEM_SERVICE_UNAVAILABLE', 503);
        },
      })
      .compile();
    app = module.createNestApplication();
    const requestIds = app.get(RequestIdMiddleware);
    app.use(requestIds.use.bind(requestIds));
    app.setGlobalPrefix('api/v1');
    await app.listen(port, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await app.close();
  });

  it('validates documented liveness, readiness, and system-mode failures over HTTP', async () => {
    const cases = [
      { path: '/api/v1/health/live', status: 500, code: 'SYSTEM_INTERNAL_ERROR' },
      { path: '/api/v1/health/ready', status: 503, code: 'SYSTEM_SERVICE_UNAVAILABLE' },
      { path: '/api/v1/system-mode', status: 503, code: 'SYSTEM_SERVICE_UNAVAILABLE' },
    ];
    for (const expected of cases) {
      const response = await fetch(`${baseUrl}${expected.path}`);
      const body = (await response.json()) as ErrorBody;
      assert.equal(response.status, expected.status);
      assert.equal(response.headers.get('content-type')?.startsWith('application/json'), true);
      assert.equal(body.code, expected.code);
      assert.equal(typeof body.requestId, 'string');
      assert.equal(typeof body.timestamp, 'string');
    }
  });
});
