import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';

import { importPKCS8, SignJWT } from 'jose';
import { v7 as uuidv7 } from 'uuid';

import type { PrismaClient } from '../../src/generated/prisma/client.js';
import {
  createTestPrisma,
  resetFoundationDatabase,
  seedFoundationFixture,
  type FoundationFixture,
} from '../helpers/database.js';
import {
  foundationEnvironment,
  requireTestDatabaseUrl,
  TEST_PASSWORD,
  TEST_PRIVATE_KEY,
} from '../helpers/test-environment.js';

interface HttpResult {
  status: number;
  headers: Headers;
  body: Record<string, unknown>;
}

interface AuthData {
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  user: { id: string; organizationId: string; role: string; primaryEmailMasked: string | null };
}

function asObject(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
  return value as Record<string, unknown>;
}

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, 'object');
  const port = (address as { port: number }).port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

describe('Foundation HTTP E2E with real PostgreSQL', () => {
  let prisma: PrismaClient;
  let fixture: FoundationFixture;
  let child: ChildProcessWithoutNullStreams;
  let baseUrl: string;
  let childOutput = '';

  const request = async (path: string, init: RequestInit = {}): Promise<HttpResult> => {
    const response = await fetch(`${baseUrl}${path}`, init);
    const text = await response.text();
    return {
      status: response.status,
      headers: response.headers,
      body: text.length === 0 ? {} : (JSON.parse(text) as Record<string, unknown>),
    };
  };

  const login = async (
    idempotencyKey = uuidv7(),
  ): Promise<{ result: HttpResult; data: AuthData }> => {
    const result = await request('/api/v1/auth/password-login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
      body: JSON.stringify({ account: fixture.teacherEmail, password: TEST_PASSWORD }),
    });
    const data = asObject(result.body.data) as unknown as AuthData;
    return { result, data };
  };

  before(async () => {
    const databaseUrl = requireTestDatabaseUrl();
    prisma = createTestPrisma(databaseUrl);
    await resetFoundationDatabase(prisma);
    await seedFoundationFixture(prisma);
    const port = await availablePort();
    baseUrl = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['--enable-source-maps', 'dist/main.js'], {
      cwd: new URL('../..', import.meta.url),
      env: {
        ...foundationEnvironment(databaseUrl, port),
        // Keep this suite independent from a developer's ignored backend/.env.
        // Object storage is intentionally omitted while media points to a
        // deterministic unreachable endpoint for the DOWN projection.
        OBJECT_STORAGE_REQUIRED: 'false',
        OBJECT_STORAGE_ENDPOINT: '',
        OBJECT_STORAGE_REGION: '',
        OBJECT_STORAGE_BUCKET: '',
        OBJECT_STORAGE_ACCESS_KEY: '',
        OBJECT_STORAGE_SECRET_KEY: '',
        OBJECT_STORAGE_FORCE_PATH_STYLE: '',
        MEDIA_STORAGE_ENDPOINT: 'http://127.0.0.1:9',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk: Buffer) => (childOutput += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (childOutput += chunk.toString()));

    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`Backend exited during startup: ${childOutput}`);
      try {
        const response = await fetch(`${baseUrl}/api/v1/health/live`);
        if (response.ok) return;
      } catch {
        // The process may still be starting.
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Backend did not become live: ${childOutput}`);
  });

  beforeEach(async () => {
    await resetFoundationDatabase(prisma);
    fixture = await seedFoundationFixture(prisma);
    // This suite exercises established accounts. First-change denial is tested
    // explicitly below; do not change the shared fixture for other suites.
    await prisma.v81AccountSecurity.createMany({
      data: [fixture.teacherUserId, fixture.adminUserId].map((userId) => ({
        userId,
        organizationId: fixture.organizationId,
        loginAccount: userId === fixture.adminUserId ? fixture.adminEmail : fixture.teacherEmail,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      })),
    });
    await prisma.v81AdminAccess.create({
      data: {
        userId: fixture.adminUserId,
        organizationId: fixture.organizationId,
        kind: 'SUB',
        permissions: ['AUDIT_QUERY'],
        mustChangePassword: false,
      },
    });
  });

  after(async () => {
    child.kill();
    await prisma.$disconnect();
  });

  it('serves public probes and restricts dependency health to administrators', async () => {
    const live = await request('/api/v1/health/live');
    assert.equal(live.status, 200);
    assert.deepEqual(Object.keys(live.body).sort(), ['data', 'meta']);
    const ready = await request('/api/v1/health/ready');
    assert.equal(ready.status, 200);

    const unauthenticatedAdminHealth = await request('/api/v1/health/admin');
    assert.equal(unauthenticatedAdminHealth.status, 401);
    const teacher = await login();
    const forbiddenAdminHealth = await request('/api/v1/health/admin', {
      headers: { authorization: `Bearer ${teacher.data.accessToken}` },
    });
    assert.equal(forbiddenAdminHealth.status, 403);

    const adminLogin = await request('/api/v1/auth/password-login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': uuidv7() },
      body: JSON.stringify({ account: fixture.adminEmail, password: TEST_PASSWORD }),
    });
    assert.equal(adminLogin.status, 200);
    const adminAuth = asObject(adminLogin.body.data) as unknown as AuthData;
    const adminHealth = await request('/api/v1/health/admin', {
      headers: {
        authorization: `Bearer ${adminAuth.accessToken}`,
        'x-request-id': 'req-admin-health-safe',
      },
    });
    assert.equal(adminHealth.status, 200);
    assert.equal(asObject(adminHealth.body.meta).requestId, 'req-admin-health-safe');
    const health = asObject(adminHealth.body.data);
    assert.equal(health.kind, 'ADMIN');
    assert.equal(health.status, 'DEGRADED');
    const dependencies = asObject(health.dependencies);
    assert.equal(asObject(dependencies.database).status, 'UP');
    assert.equal(asObject(dependencies.notificationQueue).status, 'UP');
    assert.equal(asObject(dependencies.objectStorage).status, 'NOT_CONFIGURED');
    assert.equal(asObject(dependencies.mediaStorage).status, 'DOWN');
    assert.equal(JSON.stringify(adminHealth.body).includes('127.0.0.1'), false);

    const mode = await request('/api/v1/system-mode');
    assert.equal(mode.status, 200);
    assert.equal(asObject(mode.body.data).mode, 'NORMAL');
  });

  it('logs in only with the seeded password and returns a safe /me projection', async () => {
    const { result, data } = await login();
    assert.equal(result.status, 200);
    assert.equal(data.tokenType, 'Bearer');
    assert.equal(data.user.role, 'TEACHER');
    assert.match(data.user.primaryEmailMasked ?? '', /^t\*\*\*@/);
    assert.equal(JSON.stringify(result.body).includes(TEST_PASSWORD), false);

    const me = await request('/api/v1/me', {
      headers: { authorization: `Bearer ${data.accessToken}`, 'x-request-id': 'req-me-safe' },
    });
    assert.equal(me.status, 200);
    assert.equal(me.headers.get('x-request-id'), 'req-me-safe');
    assert.equal(asObject(me.body.meta).requestId, 'req-me-safe');
    const current = asObject(me.body.data);
    assert.equal(current.studentProfile, null);
    assert.notEqual(current.teacherProfile, null);
    assert.equal(JSON.stringify(me.body).includes('passwordHash'), false);
    assert.equal(JSON.stringify(me.body).includes('tokenVersion'), false);

    const organization = await request('/api/v1/organizations/current', {
      headers: { authorization: `Bearer ${data.accessToken}` },
    });
    assert.equal(organization.status, 200);
    assert.equal(asObject(organization.body.data).id, fixture.organizationId);
    const semester = await request('/api/v1/semesters/current', {
      headers: { authorization: `Bearer ${data.accessToken}` },
    });
    assert.equal(semester.status, 200);
    assert.equal(asObject(semester.body.data).id, fixture.semesterId);

    assert.equal(await prisma.authSession.count(), 1);
    assert.equal(await prisma.refreshToken.count(), 1);
    assert.equal(
      await prisma.auditLog.count({ where: { actionType: 'AUTHENTICATION_SUCCEEDED' } }),
      1,
    );
    assert.equal(
      await prisma.outboxEvent.count({ where: { eventType: 'AUTH_SESSION_CREATED' } }),
      1,
    );
    const idempotency = await prisma.idempotencyRecord.findFirstOrThrow();
    assert.equal(idempotency.status, 'COMPLETED');
    assert.equal(idempotency.responseBodyEncryptedOrReference?.includes(data.accessToken), false);
    assert.equal(
      (await prisma.refreshToken.findFirstOrThrow()).tokenHash.includes(data.refreshToken),
      false,
    );
  });

  it('denies missing or pending password security and unassigned administrator access', async () => {
    const teacher = await login();
    const headers = { authorization: `Bearer ${teacher.data.accessToken}` };
    await prisma.v81AccountSecurity.update({
      where: { userId: fixture.teacherUserId },
      data: { mustChangePassword: true, passwordChangedAt: null },
    });
    for (const missing of [false, true]) {
      if (missing) await prisma.v81AccountSecurity.delete({ where: { userId: fixture.teacherUserId } });
      const id = uuidv7();
      const protectedPaths = [
        ['GET', '/me'], ['GET', `/courses/${id}`], ['GET', `/class-sections/${id}`],
        ['GET', '/notifications'], ['POST', `/notifications/${id}/read`],
        ['POST', '/push-devices'], ['DELETE', `/push-devices/${id}`],
        ['GET', '/me/preferences'], ['PATCH', '/me/preferences'],
        ['GET', '/feedback'], ['POST', '/feedback'], ['GET', `/feedback/${id}`],
        ['GET', '/exemption-application-details'], ['GET', '/exemption-applications'],
        ['GET', `/exemption-applications/${id}`], ['GET', '/sport-catalog'],
        ['GET', '/location-privacy-policy'],
      ] as const;
      for (const [method, path] of protectedPaths) {
        const denied = await request(`/api/v1${path}`, {
          method, headers: { ...headers, 'content-type': 'application/json', 'idempotency-key': uuidv7() },
          ...(['POST', 'PATCH'].includes(method) ? { body: '{}' } : {}),
        });
        assert.equal(denied.status, 403, `${method} ${path}, missing=${missing}`);
        assert.equal(denied.body.code, 'PERMISSION_RESOURCE_SCOPE_DENIED');
        assert.deepEqual(denied.body.details, {});
      }
    }
    const admin = await request('/api/v1/auth/password-login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': uuidv7() },
      body: JSON.stringify({ account: fixture.adminEmail, password: TEST_PASSWORD }),
    });
    assert.equal(admin.status, 200);
    const adminHeaders = { authorization: `Bearer ${asObject(admin.body.data).accessToken}` };
    await prisma.v81AdminAccess.update({
      where: { userId: fixture.adminUserId }, data: { permissions: ['HELP_CENTER'] },
    });
    const denied = await request('/api/v1/health/admin', { headers: adminHeaders });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.code, 'PERMISSION_RESOURCE_SCOPE_DENIED');
    assert.deepEqual(denied.body.details, {});
    await prisma.v81AdminAccess.delete({ where: { userId: fixture.adminUserId } });
    assert.equal((await request('/api/v1/health/admin', { headers: adminHeaders })).status, 403);
  });

  it('validates unauthenticated access responses for every secured operation', async () => {
    const document = JSON.parse(
      readFileSync(
        new URL('../../src/generated/openapi.document.generated.json', import.meta.url),
        'utf8',
      ),
    ) as {
      security?: Record<string, string[]>[];
      paths: Record<
        string,
        Record<string, { operationId?: string; security?: Record<string, string[]>[] }>
      >;
    };
    const methods = new Set(['get', 'post', 'put', 'patch', 'delete']);
    const secured = Object.entries(document.paths).flatMap(([template, pathItem]) =>
      Object.entries(pathItem)
        .filter(
          ([method, operation]) =>
            methods.has(method) && ((operation.security ?? document.security)?.length ?? 0) > 0,
        )
        .map(([method, operation]) => ({
          method: method.toUpperCase(),
          operationId: operation.operationId ?? 'missing-operation-id',
          path: template.replaceAll(/\{[^}]+\}/g, uuidv7()),
          securityScheme: Object.keys((operation.security ?? document.security)?.[0] ?? {})[0],
        })),
    );
    assert.equal(secured.length, 239);

    for (const operation of secured) {
      const result = await request(`/api/v1${operation.path}`, {
        method: operation.method,
        headers: { 'content-type': 'application/json' },
        ...(['POST', 'PUT', 'PATCH'].includes(operation.method) ? { body: '{}' } : {}),
      });
      assert.equal(
        result.status,
        401,
        `${operation.operationId} returned ${result.status}: ${JSON.stringify(result.body)}`,
      );
      assert.equal(
        result.body.code,
        operation.securityScheme === 'JoinCapability'
          ? 'AUTH_JOIN_CAPABILITY_INVALID'
          : 'AUTH_REQUIRED',
        operation.operationId,
      );
    }
  });

  it('validates error responses for public operations with request input', async () => {
    const publicFailures: { path: string; method: 'GET' | 'POST'; body?: string }[] = [
      {
        path: `/api/v1/course-invites/${uuidv7()}/join-capabilities`,
        method: 'POST',
        body: '{}',
      },
      { path: '/api/v1/auth/student-sign-in-codes', method: 'POST', body: '{}' },
      { path: '/api/v1/auth/student-sign-in-codes/verify', method: 'POST', body: '{}' },
      { path: '/api/v1/auth/account-recovery-requests', method: 'POST', body: '{}' },
      {
        path: '/api/v1/auth/account-recovery-requests/complete',
        method: 'POST',
        body: '{}',
      },
      { path: '/api/v1/help-articles?limit=0', method: 'GET' },
      { path: `/api/v1/help-articles/${uuidv7()}`, method: 'GET' },
    ];

    for (const failure of publicFailures) {
      const response = await request(failure.path, {
        method: failure.method,
        ...(failure.body === undefined
          ? {}
          : { headers: { 'content-type': 'application/json' }, body: failure.body }),
      });
      assert.ok(response.status >= 400, `${failure.path} returned ${response.status}`);
      assert.equal(typeof response.body.code, 'string', failure.path);
    }
  });

  it('returns stable generic errors for wrong passwords and a specific disabled-account result', async () => {
    const wrong = await request('/api/v1/auth/password-login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': uuidv7() },
      body: JSON.stringify({ account: fixture.teacherEmail, password: 'wrong-password' }),
    });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.code, 'AUTH_CREDENTIAL_INVALID');
    assert.deepEqual(Object.keys(wrong.body).sort(), [
      'code',
      'details',
      'message',
      'requestId',
      'timestamp',
    ]);

    await prisma.user.update({
      where: { id: fixture.teacherUserId },
      data: { status: 'DISABLED' },
    });
    const disabled = await request('/api/v1/auth/password-login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': uuidv7() },
      body: JSON.stringify({ account: fixture.teacherEmail, password: TEST_PASSWORD }),
    });
    assert.equal(disabled.status, 403);
    assert.equal(disabled.body.code, 'AUTH_ACCOUNT_DISABLED');
  });

  it('rejects expired, tampered, and cross-organization access tokens', async () => {
    const { data } = await login();
    const signatureStart = data.accessToken.lastIndexOf('.') + 1;
    const signatureFirstCharacter = data.accessToken[signatureStart];
    assert.notEqual(signatureFirstCharacter, undefined);
    const tampered = `${data.accessToken.slice(0, signatureStart)}${
      signatureFirstCharacter === 'a' ? 'b' : 'a'
    }${data.accessToken.slice(signatureStart + 1)}`;
    assert.equal(
      (await request('/api/v1/me', { headers: { authorization: `Bearer ${tampered}` } })).status,
      401,
    );

    const key = await importPKCS8(TEST_PRIVATE_KEY, 'EdDSA');
    const nowSeconds = Math.floor(Date.now() / 1_000);
    const expired = await new SignJWT({
      organizationId: fixture.organizationId,
      role: 'TEACHER',
      sessionId: data.sessionId,
      tokenVersion: 0,
    })
      .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT' })
      .setSubject(fixture.teacherUserId)
      .setJti(uuidv7())
      .setIssuer('bnbu-sports-test')
      .setAudience('bnbu-sports-test-clients')
      .setIssuedAt(nowSeconds - 120)
      .setExpirationTime(nowSeconds - 60)
      .sign(key);
    const expiredResult = await request('/api/v1/me', {
      headers: { authorization: `Bearer ${expired}` },
    });
    assert.equal(expiredResult.body.code, 'AUTH_TOKEN_EXPIRED');

    const crossOrganization = await new SignJWT({
      organizationId: uuidv7(),
      role: 'TEACHER',
      sessionId: data.sessionId,
      tokenVersion: 0,
    })
      .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT' })
      .setSubject(fixture.teacherUserId)
      .setJti(uuidv7())
      .setIssuer('bnbu-sports-test')
      .setAudience('bnbu-sports-test-clients')
      .setIssuedAt(nowSeconds)
      .setExpirationTime(nowSeconds + 60)
      .sign(key);
    const crossResult = await request('/api/v1/me', {
      headers: { authorization: `Bearer ${crossOrganization}` },
    });
    assert.equal(crossResult.status, 401);
    assert.equal(crossResult.body.code, 'AUTH_TOKEN_INVALID');
  });

  it('rotates refresh tokens atomically and revokes the family on reuse', async () => {
    const { data } = await login();
    const rotated = await request('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': uuidv7() },
      body: JSON.stringify({ refreshToken: data.refreshToken }),
    });
    assert.equal(rotated.status, 200);
    const next = asObject(rotated.body.data) as unknown as AuthData;
    assert.notEqual(next.refreshToken, data.refreshToken);
    assert.equal(await prisma.refreshToken.count(), 2);

    const replay = await request('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': uuidv7() },
      body: JSON.stringify({ refreshToken: data.refreshToken }),
    });
    assert.equal(replay.status, 401);
    assert.equal(replay.body.code, 'AUTH_SESSION_REVOKED');
    assert.equal(
      (await prisma.authSession.findUniqueOrThrow({ where: { id: data.sessionId } })).status,
      'REVOKED',
    );
    assert.notEqual(
      (
        await prisma.refreshToken.findFirstOrThrow({
          where: { authSessionId: data.sessionId, parentTokenId: null },
        })
      ).reuseDetectedAt,
      null,
    );

    const afterReuse = await request('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': uuidv7() },
      body: JSON.stringify({ refreshToken: next.refreshToken }),
    });
    assert.equal(afterReuse.status, 401);
  });

  it('revokes logout sessions and makes the operation safely replayable', async () => {
    const key = uuidv7();
    const { data } = await login();
    const logoutRequest: RequestInit = {
      method: 'POST',
      headers: {
        authorization: `Bearer ${data.accessToken}`,
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      body: JSON.stringify({ refreshToken: data.refreshToken }),
    };
    const first = await request('/api/v1/auth/logout', logoutRequest);
    const replay = await request('/api/v1/auth/logout', logoutRequest);
    assert.equal(first.status, 200);
    assert.equal(replay.status, 200);
    assert.equal(first.body.data, null);
    assert.equal(
      (await prisma.authSession.findUniqueOrThrow({ where: { id: data.sessionId } })).status,
      'REVOKED',
    );

    const refresh = await request('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': uuidv7() },
      body: JSON.stringify({ refreshToken: data.refreshToken }),
    });
    assert.equal(refresh.status, 401);
  });

  it('reserves concurrent idempotency keys without creating duplicate sessions', async () => {
    const key = uuidv7();
    const init: RequestInit = {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': key },
      body: JSON.stringify({ account: fixture.teacherEmail, password: TEST_PASSWORD }),
    };
    const [left, right] = await Promise.all([
      request('/api/v1/auth/password-login', init),
      request('/api/v1/auth/password-login', init),
    ]);
    assert.ok([200, 409].includes(left.status));
    assert.ok([200, 409].includes(right.status));
    assert.ok(left.status === 200 || right.status === 200);
    assert.equal(await prisma.authSession.count(), 1);
    assert.equal(await prisma.idempotencyRecord.count(), 1);

    const stable = await request('/api/v1/auth/password-login', init);
    assert.equal(stable.status, 200);
    const changed = await request('/api/v1/auth/password-login', {
      ...init,
      body: JSON.stringify({ account: fixture.teacherEmail, password: `${TEST_PASSWORD}!` }),
    });
    assert.equal(changed.status, 401);
  });

  it('enforces mode allowlists, strict validation, request IDs, CORS, and body limits', async () => {
    await assert.rejects(prisma.systemPolicy.updateMany({
      data: { systemMode: 'READ_ONLY', version: { increment: 1 } },
    }));
    assert.equal((await login()).result.status, 200);
    await prisma.systemPolicy.updateMany({
      data: { systemMode: 'MAINTENANCE', version: { increment: 1 } },
    });
    const maintenance = await request('/api/v1/auth/password-login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': uuidv7() },
      body: JSON.stringify({ account: fixture.teacherEmail, password: TEST_PASSWORD }),
    });
    assert.equal(maintenance.status, 503);
    assert.equal(maintenance.body.code, 'SYSTEM_MAINTENANCE');

    await prisma.systemPolicy.updateMany({
      data: { systemMode: 'NORMAL', version: { increment: 1 } },
    });
    const extraRole = await request('/api/v1/auth/password-login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': uuidv7() },
      body: JSON.stringify({
        account: fixture.teacherEmail,
        password: TEST_PASSWORD,
        role: 'ADMIN',
      }),
    });
    assert.equal(extraRole.status, 422);

    const invalidRequestId = await request('/api/v1/health/live', {
      headers: { 'x-request-id': 'invalid request id' },
    });
    const generated = invalidRequestId.headers.get('x-request-id');
    assert.match(generated ?? '', /^[0-9a-f-]{36}$/);
    assert.equal(asObject(invalidRequestId.body.meta).requestId, generated);

    const cors = await request('/api/v1/health/live', {
      headers: { origin: 'https://denied.test' },
    });
    assert.equal(cors.headers.get('access-control-allow-origin'), null);

    const oversized = await request('/api/v1/auth/password-login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': uuidv7() },
      body: JSON.stringify({ padding: 'x'.repeat(3_000) }),
    });
    assert.equal(oversized.status, 422);
    assert.deepEqual(Object.keys(oversized.body).sort(), [
      'code',
      'details',
      'message',
      'requestId',
      'timestamp',
    ]);
  });
});
