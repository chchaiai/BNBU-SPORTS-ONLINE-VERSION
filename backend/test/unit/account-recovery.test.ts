/* eslint @typescript-eslint/require-await: "off" -- Database doubles preserve the asynchronous Prisma interface. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ClientAuthenticationService } from '../../src/modules/client-capabilities/client-authentication.service.js';
import { AuthCodeCrypto } from '../../src/modules/client-capabilities/auth-code.crypto.js';
import { SecureDigestService } from '../../src/common/security/secure-digest.service.js';
import { PasswordHasherService } from '../../src/modules/auth/password-hasher.service.js';
import { ApplicationError } from '../../src/common/errors/application-error.js';
import type { RuntimeConfig } from '../../src/common/config/environment.js';
import type { AccountRecoveryChallenge, User } from '../../src/generated/prisma/client.js';

const NOW = new Date('2026-09-25T05:44:00Z');
const context = { requestId: 'synthetic-request', idempotencyKey: 'synthetic-key' };

function fixture(role: 'TEACHER' | 'ADMIN' | 'STUDENT' = 'TEACHER') {
  const user = {
    id: 'synthetic-user',
    organizationId: 'synthetic-org',
    role,
    status: 'ACTIVE',
    primaryEmailNormalized: 'teacher@invalid.test',
    emailVerifiedAt: null,
    emailIdentityScope: 'PRIMARY',
    deletedAt: null,
    version: 1,
  } as User;
  let challenge: AccountRecoveryChallenge;
  let deliveredCode = '';
  let writes = 0;
  let revocations = 0;
  const config = {
    securityHashKey: 'synthetic-recovery-key',
    authRateLimitMaxAttempts: 10,
    authRateLimitWindowSeconds: 60,
  } as RuntimeConfig;
  const crypto = new AuthCodeCrypto({
    digestKey: Buffer.alloc(32, 1),
    escrowKey: Buffer.alloc(32, 2),
    escrowKeyVersion: 1,
  });
  const db = {
    organization: { findUnique: async () => ({ id: user.organizationId, status: 'ACTIVE' }) },
    systemPolicy: { findUnique: async () => ({ systemMode: 'NORMAL' }) },
    user: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        if (
          where.role !== user.role ||
          where.primaryEmailNormalized !== user.primaryEmailNormalized ||
          user.deletedAt !== null ||
          !['ACTIVE', 'DISABLED'].includes(user.status)
        )
          return null;
        if (where.emailVerifiedAt && user.emailVerifiedAt === null) return null;
        if (where.OR && user.emailVerifiedAt === null && user.emailIdentityScope !== 'SUBADMIN')
          return null;
        return user;
      },
      update: async ({ data }: { data: { passwordHash: string } }) => {
        writes++;
        user.passwordHash = data.passwordHash;
        return user;
      },
    },
    authRateLimitFact: { findMany: async () => [], createMany: async () => ({ count: 2 }) },
    accountRecoveryChallenge: {
      create: async ({ data }: { data: AccountRecoveryChallenge }) => {
        challenge = { ...data, version: 1, consumedAt: null, deliveredAt: null };
        return challenge;
      },
      update: async ({ data }: { data: Partial<AccountRecoveryChallenge> }) => {
        Object.assign(challenge, data, { version: 2 });
        return challenge;
      },
      findUnique: async () =>
        challenge ? { ...challenge, user: challenge.userId ? user : null } : null,
      updateMany: async ({ data }: { data: Partial<AccountRecoveryChallenge> }) => {
        Object.assign(challenge, data);
        return { count: 1 };
      },
    },
    $queryRaw: async () => [],
    $executeRaw: async () => 1,
    authSession: {
      updateMany: async () => {
        revocations++;
        return { count: 2 };
      },
    },
    refreshToken: { updateMany: async () => ({ count: 2 }) },
  };
  interface Outcome {
    value?: unknown;
    error?: Error;
  }
  type Work = (tx: typeof db, stage: { isRecovery: boolean }) => Promise<Outcome>;
  const execute = async (work: Work) => {
    const result = await work(db, { isRecovery: false });
    if (result.error) throw result.error;
    return result.value;
  };
  const service = Object.create(
    ClientAuthenticationService.prototype,
  ) as ClientAuthenticationService;
  Object.assign(service, {
    prisma: db,
    config,
    crypto,
    digest: new SecureDigestService(config),
    clock: { now: () => new Date(NOW) },
    ids: { next: () => 'synthetic-challenge' },
    passwords: new PasswordHasherService(),
    idempotency: {
      reserveStage: async (_: unknown, work: Work) => ({
        kind: 'OWNER',
        value: await execute(work),
      }),
      stage: (value: unknown) => ({ value }),
      completeStage: async (_: unknown, work: Work) => execute(work),
      execute: async (_: unknown, work: Work) => execute(work),
      success: (value: unknown) => ({ value }),
      failure: (error: Error) => ({ error }),
    },
    delivery: {
      deliver: async ({ code }: { code: string }) => {
        deliveredCode = code;
      },
    },
    audit: { append: async () => undefined },
    outbox: { append: async () => undefined },
  });
  return {
    user,
    service,
    db,
    request: () =>
      service.requestAccountRecovery(
        {
          organizationCode: 'BNBU-TEST',
          account: ' Teacher@invalid.test ',
          requestedRole: role === 'ADMIN' ? 'ADMIN' : 'TEACHER',
          channel: 'EMAIL',
          locale: 'en',
        },
        context,
      ),
    complete: (code = deliveredCode) =>
      service.completeAccountRecovery(
        {
          recoveryId: 'synthetic-challenge',
          verificationCode: code,
          newPassword: 'Synthetic-new-password',
        },
        context,
      ),
    challenge: () => challenge,
    writes: () => writes,
    revocations: () => revocations,
  };
}

test('imported teacher without an email verification timestamp can recover using the delivered code', async () => {
  const f = fixture();
  const accepted = await f.request();
  assert.equal(accepted.recoveryId, f.challenge().id);
  assert.equal(f.challenge().userId, f.user.id);
  assert.equal(f.challenge().status, 'ACTIVE');
  await f.complete();
  assert.equal(f.writes(), 1);
  assert.equal(f.revocations(), 1);
  assert.equal(f.challenge().status, 'CONSUMED');
  assert.ok(
    await new PasswordHasherService().verify(f.user.passwordHash, 'Synthetic-new-password'),
  );
  await assert.rejects(f.complete(), { code: 'AUTH_VERIFICATION_CODE_INVALID' });
  assert.equal(f.writes(), 1);
});

test('wrong, expired and locked recovery codes cannot change a teacher password', async () => {
  for (const state of ['wrong', 'expired', 'locked']) {
    const f = fixture();
    await f.request();
    if (state === 'expired') f.challenge().expiresAt = new Date(NOW.getTime() - 1);
    if (state === 'locked') f.challenge().status = 'LOCKED';
    await assert.rejects(state === 'wrong' ? f.complete('not-a-code') : f.complete(), {
      code: 'AUTH_VERIFICATION_CODE_INVALID',
    });
    assert.equal(f.writes(), 0);
    assert.equal(f.revocations(), 0);
  }
});

test('disabled teacher still cannot reset a password after proving mailbox ownership', async () => {
  const f = fixture();
  f.user.status = 'DISABLED';
  await f.request();
  await assert.rejects(f.complete(), { code: 'AUTH_ACCOUNT_DISABLED' });
  assert.equal(f.writes(), 0);
});

test('deleted, unknown, wrong-role and unverified primary admin accounts remain ineligible', async () => {
  for (const state of ['deleted', 'unknown', 'student', 'admin']) {
    const f = fixture(state === 'admin' ? 'ADMIN' : state === 'student' ? 'STUDENT' : 'TEACHER');
    if (state === 'deleted') f.user.deletedAt = NOW;
    if (state === 'unknown') f.user.primaryEmailNormalized = 'different@invalid.test';
    await f.request();
    assert.equal(f.challenge().userId, null);
    await assert.rejects(
      f.complete(),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'AUTH_VERIFICATION_CODE_INVALID',
    );
    assert.equal(f.writes(), 0);
  }
});
