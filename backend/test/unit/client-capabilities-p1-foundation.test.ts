import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AppReleasePolicyAmbiguousError,
  evaluateIosBuildEnforcement,
  selectEffectiveAppReleasePolicy,
  type StoredAppReleasePolicy,
} from '../../src/modules/client-capabilities/app-release-policy.domain.js';
import {
  attemptAuthChallengeVerification,
  markAuthChallengeDelivered,
  type AuthChallengeSnapshot,
} from '../../src/modules/client-capabilities/auth-challenge.domain.js';
import {
  AuthCodeDeliveryConflictError,
  AuthCodeDeliveryUnavailableError,
  DisabledAuthCodeDeliveryAdapter,
  InMemoryTestAuthCodeDeliveryAdapter,
  type AuthCodeDelivery,
} from '../../src/modules/client-capabilities/auth-code-delivery.port.js';
import {
  AuthCodeCrypto,
  AuthCodeCryptoError,
} from '../../src/modules/client-capabilities/auth-code.crypto.js';
import { evaluateDurableRateWindow } from '../../src/modules/client-capabilities/durable-rate-window.js';

const authCodeCrypto = (): AuthCodeCrypto =>
  new AuthCodeCrypto({
    digestKey: Buffer.alloc(32, 11),
    escrowKey: Buffer.alloc(32, 23),
    escrowKeyVersion: 7,
  });

describe('authentication-code cryptography', () => {
  it('generates CSPRNG-backed fixed-length numeric codes and rejects unsafe lengths', () => {
    const crypto = authCodeCrypto();
    for (let index = 0; index < 100; index += 1) {
      assert.match(crypto.generateNumericCode(6), /^\d{6}$/u);
    }
    assert.throws(() => crypto.generateNumericCode(3), AuthCodeCryptoError);
    assert.throws(() => crypto.generateNumericCode(11), AuthCodeCryptoError);
  });

  it('digests codes with context binding and verifies wrong inputs without leaking a match', () => {
    const crypto = authCodeCrypto();
    const digest = crypto.digestCode('challenge:challenge-1', '012345');
    assert.match(digest, /^[0-9a-f]{64}$/u);
    assert.equal(crypto.verifyCode('challenge:challenge-1', '012345', digest), true);
    assert.equal(crypto.verifyCode('challenge:challenge-1', '012346', digest), false);
    assert.equal(crypto.verifyCode('challenge:challenge-2', '012345', digest), false);
    assert.equal(crypto.verifyCode('challenge:challenge-1', 'not-a-code', digest), false);
    assert.equal(crypto.verifyCode('challenge:challenge-1', '012345', 'malformed'), false);
  });

  it('deterministically escrows canonical auth results and authenticates their AAD', () => {
    const crypto = authCodeCrypto();
    const first = crypto.encryptAuthResult('request:request-1', {
      refreshToken: 'refresh-token',
      accessToken: 'access-token',
    });
    const second = crypto.encryptAuthResult('request:request-1', {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    assert.equal(first, second);
    assert.match(first, /^v1\.k7\./u);
    assert.deepEqual(crypto.decryptAuthResult('request:request-1', first), {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    assert.throws(
      () => crypto.decryptAuthResult('request:request-2', first),
      (error: unknown) =>
        error instanceof AuthCodeCryptoError && error.reason === 'ESCROW_AUTHENTICATION_FAILED',
    );
  });

  it('rejects tampered escrow ciphertexts', () => {
    const crypto = authCodeCrypto();
    const parts = crypto
      .encryptAuthResult('request:request-1', { accessToken: 'access-token' })
      .split('.');
    const tag = parts[4]!;
    parts[4] = `${tag.startsWith('A') ? 'B' : 'A'}${tag.slice(1)}`;
    assert.throws(
      () => crypto.decryptAuthResult('request:request-1', parts.join('.')),
      (error: unknown) =>
        error instanceof AuthCodeCryptoError && error.reason === 'ESCROW_AUTHENTICATION_FAILED',
    );
  });
});

const activeChallenge = (
  overrides: Partial<AuthChallengeSnapshot> = {},
): AuthChallengeSnapshot => ({
  status: 'ACTIVE',
  failedAttempts: 0,
  maxAttempts: 2,
  expiresAt: new Date('2026-08-06T12:05:00.000Z'),
  deliveredAt: new Date('2026-08-06T12:00:00.000Z'),
  consumedAt: null,
  version: 1,
  ...overrides,
});

describe('authentication challenge state machine', () => {
  it('consumes a valid challenge exactly once', () => {
    const accepted = attemptAuthChallengeVerification(
      activeChallenge(),
      new Date('2026-08-06T12:01:00.000Z'),
      true,
    );
    assert.equal(accepted.accepted, true);
    assert.equal(accepted.next.status, 'CONSUMED');
    assert.equal(accepted.next.version, 2);
    assert.equal(accepted.next.consumedAt?.toISOString(), '2026-08-06T12:01:00.000Z');

    const replay = attemptAuthChallengeVerification(
      accepted.next,
      new Date('2026-08-06T12:02:00.000Z'),
      true,
    );
    assert.equal(replay.accepted, false);
    assert.equal(replay.next.status, 'CONSUMED');
    assert.equal(replay.next.version, accepted.next.version);
  });

  it('expires at the exact TTL boundary', () => {
    const result = attemptAuthChallengeVerification(
      activeChallenge(),
      new Date('2026-08-06T12:05:00.000Z'),
      true,
    );
    assert.equal(result.accepted, false);
    assert.equal(result.next.status, 'EXPIRED');
    assert.equal(result.next.version, 2);
  });

  it('increments durable attempts and locks at the configured maximum', () => {
    const first = attemptAuthChallengeVerification(
      activeChallenge(),
      new Date('2026-08-06T12:01:00.000Z'),
      false,
    );
    assert.equal(first.accepted, false);
    assert.equal(first.next.status, 'ACTIVE');
    assert.equal(first.next.failedAttempts, 1);

    const second = attemptAuthChallengeVerification(
      first.next,
      new Date('2026-08-06T12:02:00.000Z'),
      false,
    );
    assert.equal(second.accepted, false);
    assert.equal(second.next.status, 'LOCKED');
    assert.equal(second.next.failedAttempts, 2);

    const afterLock = attemptAuthChallengeVerification(
      second.next,
      new Date('2026-08-06T12:03:00.000Z'),
      true,
    );
    assert.equal(afterLock.accepted, false);
    assert.equal(afterLock.next.status, 'LOCKED');
    assert.equal(afterLock.next.version, second.next.version);
  });

  it('activates only a pending challenge delivered before expiry', () => {
    const pending = activeChallenge({
      status: 'PENDING_DELIVERY',
      deliveredAt: null,
    });
    const delivered = markAuthChallengeDelivered(pending, new Date('2026-08-06T12:00:30.000Z'));
    assert.equal(delivered.status, 'ACTIVE');
    assert.equal(delivered.deliveredAt?.toISOString(), '2026-08-06T12:00:30.000Z');

    const expired = markAuthChallengeDelivered(pending, new Date('2026-08-06T12:05:00.000Z'));
    assert.equal(expired.status, 'EXPIRED');
    assert.equal(expired.deliveredAt, null);
  });
});

const delivery = (overrides: Partial<AuthCodeDelivery> = {}): AuthCodeDelivery => ({
  deliveryId: 'delivery-1',
  purpose: 'STUDENT_SIGN_IN',
  channel: 'EMAIL',
  recipient: 'synthetic@example.invalid',
  locale: 'en',
  code: '012345',
  expiresAt: new Date('2026-08-06T12:05:00.000Z'),
  ...overrides,
});

describe('authentication-code delivery ports', () => {
  it('fails closed when no delivery provider is configured', async () => {
    const adapter = new DisabledAuthCodeDeliveryAdapter();
    await assert.rejects(
      adapter.deliver(delivery()),
      (error: unknown) =>
        error instanceof AuthCodeDeliveryUnavailableError &&
        error.code === 'SYSTEM_SERVICE_UNAVAILABLE',
    );
  });

  it('prevents the in-memory capture adapter from running outside tests', () => {
    assert.throws(
      () => new InMemoryTestAuthCodeDeliveryAdapter('staging'),
      AuthCodeDeliveryUnavailableError,
    );
  });

  it('captures only test deliveries and preserves delivery-id idempotency', async () => {
    const adapter = new InMemoryTestAuthCodeDeliveryAdapter('test');
    const message = delivery();
    await adapter.deliver(message);
    await adapter.deliver(message);
    assert.equal(adapter.list().length, 1);
    const captured = adapter.get(message.deliveryId);
    assert.deepEqual(captured, message);
    assert.notEqual(captured?.expiresAt, message.expiresAt);

    await assert.rejects(
      adapter.deliver(delivery({ code: '654321' })),
      AuthCodeDeliveryConflictError,
    );
  });
});

describe('durable rate-window evaluation', () => {
  it('uses repository timestamps and excludes the exact window cutoff', () => {
    const now = new Date('2026-08-06T12:01:00.000Z');
    const allowed = evaluateDurableRateWindow(
      [
        new Date('2026-08-06T12:00:00.000Z'),
        new Date('2026-08-06T12:00:10.000Z'),
        new Date('2026-08-06T12:00:30.000Z'),
      ],
      now,
      { windowSeconds: 60, limit: 3 },
    );
    assert.deepEqual(
      {
        allowed: allowed.allowed,
        activeAttemptCount: allowed.activeAttemptCount,
        remainingAfterCurrentAttempt: allowed.remainingAfterCurrentAttempt,
        retryAfterSeconds: allowed.retryAfterSeconds,
      },
      {
        allowed: true,
        activeAttemptCount: 2,
        remainingAfterCurrentAttempt: 0,
        retryAfterSeconds: 0,
      },
    );

    const blocked = evaluateDurableRateWindow(
      [
        new Date('2026-08-06T12:00:10.000Z'),
        new Date('2026-08-06T12:00:30.000Z'),
        new Date('2026-08-06T12:00:50.000Z'),
      ],
      now,
      { windowSeconds: 60, limit: 3 },
    );
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.retryAfterSeconds, 10);
  });

  it('rejects future repository facts instead of treating them as valid attempts', () => {
    assert.throws(
      () =>
        evaluateDurableRateWindow(
          [new Date('2026-08-06T12:01:01.000Z')],
          new Date('2026-08-06T12:01:00.000Z'),
          { windowSeconds: 60, limit: 3 },
        ),
      RangeError,
    );
  });
});

const releasePolicy = (
  overrides: Partial<StoredAppReleasePolicy> = {},
): StoredAppReleasePolicy => ({
  id: 'policy-ios-current',
  platform: 'IOS',
  minimumSupportedVersion: '1.0.0',
  latestVersion: '1.1.0',
  minimumSupportedBuildNumber: 100,
  latestBuildNumber: 110,
  enforcement: 'RECOMMENDED',
  message: 'Synthetic policy.',
  downloadUrl: 'https://example.invalid/ios',
  effectiveAt: new Date('2026-08-05T00:00:00.000Z'),
  expiresAt: null,
  policyVersion: 'ios-policy/opaque-v3',
  ...overrides,
});

describe('app release policy projection', () => {
  it('selects only the currently effective IOS policy without comparing version syntax', () => {
    const now = new Date('2026-08-06T12:00:00.000Z');
    const selected = selectEffectiveAppReleasePolicy(
      [
        releasePolicy({ id: 'android', platform: 'ANDROID' }),
        releasePolicy({
          id: 'ios-expired',
          effectiveAt: new Date('2026-08-01T00:00:00.000Z'),
          expiresAt: now,
        }),
        releasePolicy({
          id: 'ios-older',
          effectiveAt: new Date('2026-08-02T00:00:00.000Z'),
          policyVersion: 'not-semver-older',
        }),
        releasePolicy(),
        releasePolicy({
          id: 'ios-future',
          effectiveAt: new Date('2026-08-07T00:00:00.000Z'),
          policyVersion: '999999.0.0',
        }),
      ],
      'IOS',
      now,
    );
    assert.deepEqual(selected, {
      platform: 'IOS',
      minimumSupportedVersion: '1.0.0',
      latestVersion: '1.1.0',
      minimumSupportedBuildNumber: 100,
      latestBuildNumber: 110,
      enforcement: 'RECOMMENDED',
      message: 'Synthetic policy.',
      downloadUrl: 'https://example.invalid/ios',
      effectiveAt: '2026-08-05T00:00:00.000Z',
      expiresAt: null,
      policyVersion: 'ios-policy/opaque-v3',
    });
    assert.equal(selectEffectiveAppReleasePolicy([], 'IOS', now), null);
  });

  it('compares iOS build numbers numerically and never uses marketing version text', () => {
    assert.equal(evaluateIosBuildEnforcement(99, 100, 110), 'REQUIRED');
    assert.equal(evaluateIosBuildEnforcement(100, 100, 110), 'RECOMMENDED');
    assert.equal(evaluateIosBuildEnforcement(109, 100, 110), 'RECOMMENDED');
    assert.equal(evaluateIosBuildEnforcement(110, 100, 110), 'NONE');
    assert.throws(() => evaluateIosBuildEnforcement(1, 110, 100), RangeError);
  });

  it('fails on equal-time policy ambiguity instead of depending on input order', () => {
    const now = new Date('2026-08-06T12:00:00.000Z');
    assert.throws(
      () =>
        selectEffectiveAppReleasePolicy(
          [releasePolicy({ id: 'first' }), releasePolicy({ id: 'second' })],
          'IOS',
          now,
        ),
      AppReleasePolicyAmbiguousError,
    );
  });
});
