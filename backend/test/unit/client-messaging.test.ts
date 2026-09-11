import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import type { AuditService } from '../../src/common/audit/audit.service.js';
import type { RuntimeConfig } from '../../src/common/config/environment.js';
import type { PrismaService } from '../../src/common/database/prisma.service.js';
import { ApplicationError } from '../../src/common/errors/application-error.js';
import type { AuthenticatedPrincipal } from '../../src/common/http/request-context.js';
import type { IdempotencyService } from '../../src/common/idempotency/idempotency.service.js';
import type { OutboxService } from '../../src/common/outbox/outbox.service.js';
import { SecureDigestService } from '../../src/common/security/secure-digest.service.js';
import { ScopedCursorService } from '../../src/common/pagination/scoped-cursor.service.js';
import { FixedClock } from '../../src/common/time/clock.js';
import { IdGenerator } from '../../src/common/time/id-generator.js';
import type {
  FeedbackRow,
  HelpArticleRow,
  NotificationRow,
  PushDeviceRow,
  UserPreferenceRow,
} from '../../src/modules/client-capabilities/client-messaging.projection.js';
import { ClientMessagingService } from '../../src/modules/client-capabilities/client-messaging.service.js';
import { PushTokenCipher } from '../../src/modules/client-capabilities/push-token-cipher.js';

const NOW = new Date('2026-08-06T12:00:00.000Z');
const ORGANIZATION_ID = '0198c74b-7dc0-7000-8000-000000000001';
const USER_ID = '0198c74b-7dc0-7000-8000-000000000002';
const SESSION_ID = '0198c74b-7dc0-7000-8000-000000000003';
const RESOURCE_ID = '0198c74b-7dc0-7000-8000-000000000004';

const principal: AuthenticatedPrincipal = {
  userId: USER_ID,
  organizationId: ORGANIZATION_ID,
  role: 'STUDENT',
  sessionId: SESSION_ID,
  tokenVersion: 0,
  jti: '0198c74b-7dc0-7000-8000-000000000005',
};

type TestOutcome<T> =
  | { kind: 'SUCCESS'; value: T; [key: string]: unknown }
  | { kind: 'FAILURE'; error: ApplicationError; [key: string]: unknown };

class SequenceIds extends IdGenerator {
  private nextValue = 10;

  next(): string {
    const suffix = this.nextValue.toString(16).padStart(12, '0');
    this.nextValue += 1;
    return `0198c74b-7dc0-7000-8000-${suffix}`;
  }
}

interface CapturedCalls {
  audit: Record<string, unknown>[];
  outbox: Record<string, unknown>[];
  events: Record<string, unknown>[];
  pushFinds: Record<string, unknown>[];
  pushCreates: Record<string, unknown>[];
  pushUpdates: Record<string, unknown>[];
  notificationFinds: Record<string, unknown>[];
  notificationUpdates: Record<string, unknown>[];
  preferenceCreates: Record<string, unknown>[];
  feedbackFinds: Record<string, unknown>[];
  feedbackCreates: Record<string, unknown>[];
  helpFinds: Record<string, unknown>[];
  advisoryLocks: unknown[];
}

interface HarnessState {
  notification: NotificationRow | null;
  pushDevice: PushDeviceRow | null;
  preference: UserPreferenceRow | null;
  feedbackRows: FeedbackRow[];
  helpRows: HelpArticleRow[];
}

function record(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  return value as Record<string, unknown>;
}

function dataFrom(value: unknown): Record<string, unknown> {
  return record(record(value).data);
}

function createHarness(initial: Partial<HarnessState> = {}): {
  service: ClientMessagingService;
  calls: CapturedCalls;
  state: HarnessState;
} {
  const calls: CapturedCalls = {
    audit: [],
    outbox: [],
    events: [],
    pushFinds: [],
    pushCreates: [],
    pushUpdates: [],
    notificationFinds: [],
    notificationUpdates: [],
    preferenceCreates: [],
    feedbackFinds: [],
    feedbackCreates: [],
    helpFinds: [],
    advisoryLocks: [],
  };
  const state: HarnessState = {
    notification: null,
    pushDevice: null,
    preference: null,
    feedbackRows: [],
    helpRows: [],
    ...initial,
  };
  const captureEvent = (input: unknown): Promise<Record<string, unknown>> => {
    const data = dataFrom(input);
    calls.events.push(data);
    return Promise.resolve(data);
  };
  const store = {
    $queryRaw: (query: unknown): Promise<unknown[]> => {
      calls.advisoryLocks.push(query);
      return Promise.resolve([{ acquired: 1 }]);
    },
    organization: {
      findUnique: (): Promise<{ defaultLocale: string }> =>
        Promise.resolve({ defaultLocale: 'en' }),
    },
    notification: {
      findMany: (input: unknown): Promise<NotificationRow[]> => {
        calls.notificationFinds.push(record(input));
        return Promise.resolve(state.notification === null ? [] : [state.notification]);
      },
      findFirst: (input: unknown): Promise<NotificationRow | null> => {
        calls.notificationFinds.push(record(input));
        return Promise.resolve(state.notification);
      },
      updateMany: (input: unknown): Promise<{ count: number }> => {
        calls.notificationUpdates.push(record(input));
        if (state.notification === null) return Promise.resolve({ count: 0 });
        const data = dataFrom(input);
        state.notification = {
          ...state.notification,
          readAt: data.readAt as Date,
          version: state.notification.version + 1,
        };
        return Promise.resolve({ count: 1 });
      },
    },
    notificationEvent: { create: captureEvent },
    pushDevice: {
      findFirst: (input: unknown): Promise<PushDeviceRow | null> => {
        calls.pushFinds.push(record(input));
        return Promise.resolve(state.pushDevice);
      },
      create: (input: unknown): Promise<PushDeviceRow> => {
        const data = dataFrom(input);
        calls.pushCreates.push(data);
        state.pushDevice = data as unknown as PushDeviceRow;
        return Promise.resolve(state.pushDevice);
      },
      updateMany: (input: unknown): Promise<{ count: number }> => {
        calls.pushUpdates.push(record(input));
        return Promise.resolve({ count: state.pushDevice === null ? 0 : 1 });
      },
    },
    pushDeviceEvent: { create: captureEvent },
    userPreference: {
      findFirst: (): Promise<UserPreferenceRow | null> => Promise.resolve(state.preference),
      create: (input: unknown): Promise<UserPreferenceRow> => {
        const data = dataFrom(input);
        calls.preferenceCreates.push(data);
        state.preference = data as unknown as UserPreferenceRow;
        return Promise.resolve(state.preference);
      },
      updateMany: (): Promise<{ count: number }> =>
        Promise.resolve({ count: state.preference === null ? 0 : 1 }),
    },
    userPreferenceEvent: { create: captureEvent },
    helpArticle: {
      findMany: (input: unknown): Promise<HelpArticleRow[]> => {
        calls.helpFinds.push(record(input));
        return Promise.resolve(state.helpRows);
      },
      findFirst: (input: unknown): Promise<HelpArticleRow | null> => {
        calls.helpFinds.push(record(input));
        return Promise.resolve(state.helpRows.at(0) ?? null);
      },
    },
    feedback: {
      findMany: (input: unknown): Promise<FeedbackRow[]> => {
        calls.feedbackFinds.push(record(input));
        return Promise.resolve(state.feedbackRows);
      },
      findFirst: (input: unknown): Promise<FeedbackRow | null> => {
        calls.feedbackFinds.push(record(input));
        return Promise.resolve(state.feedbackRows.at(0) ?? null);
      },
      create: (input: unknown): Promise<FeedbackRow> => {
        const data = dataFrom(input);
        calls.feedbackCreates.push(data);
        const feedback = data as unknown as FeedbackRow;
        state.feedbackRows.push(feedback);
        return Promise.resolve(feedback);
      },
    },
    feedbackEvent: { create: captureEvent },
  };

  const idempotency = {
    async execute<T>(
      _input: unknown,
      action: (transaction: unknown) => Promise<TestOutcome<T>>,
    ): Promise<T> {
      const outcome = await action(store);
      if (outcome.kind === 'FAILURE') throw outcome.error;
      return outcome.value;
    },
    success<T>(value: T, references: Record<string, unknown> = {}): TestOutcome<T> {
      return { kind: 'SUCCESS', value, ...references };
    },
    failure(error: ApplicationError, references: Record<string, unknown> = {}): TestOutcome<never> {
      return { kind: 'FAILURE', error, ...references };
    },
  } as unknown as IdempotencyService;
  const audit = {
    append: (_transaction: unknown, input: unknown): Promise<void> => {
      calls.audit.push(record(input));
      return Promise.resolve();
    },
  } as unknown as AuditService;
  const outbox = {
    append: (_transaction: unknown, input: unknown): Promise<string> => {
      calls.outbox.push(record(input));
      return Promise.resolve('0198c74b-7dc0-7000-8000-000000000099');
    },
  } as unknown as OutboxService;
  const digest = new SecureDigestService({
    securityHashKey: createHash('sha256').update('client-messaging-test').digest('hex'),
  } as RuntimeConfig);
  const service = new ClientMessagingService(
    store as unknown as PrismaService,
    idempotency,
    audit,
    outbox,
    digest,
    new FixedClock(NOW),
    new SequenceIds(),
    new ScopedCursorService(digest),
    new PushTokenCipher(Buffer.alloc(32, 7), 3),
  );
  return { service, calls, state };
}

function notificationRow(): NotificationRow {
  return {
    id: RESOURCE_ID,
    organizationId: ORGANIZATION_ID,
    recipientUserId: USER_ID,
    notificationType: 'COURSE_UPDATE',
    title: 'Updated',
    body: 'The schedule changed.',
    targetType: 'CLASS_SECTION',
    targetId: '0198c74b-7dc0-7000-8000-000000000006',
    readAt: null,
    createdAt: new Date('2026-08-06T11:00:00.000Z'),
    version: 1,
  };
}

function pushDeviceRow(ownerUserId = USER_ID): PushDeviceRow {
  return {
    id: RESOURCE_ID,
    organizationId: ORGANIZATION_ID,
    userId: ownerUserId,
    authSessionId: SESSION_ID,
    platform: 'IOS',
    appVersion: '1.0.0',
    locale: 'en',
    status: 'ACTIVE',
    registrationTokenHash: 'hashed',
    registrationTokenCiphertext: 'encrypted',
    encryptionKeyVersion: 3,
    registeredAt: NOW,
    updatedAt: NOW,
    revokedAt: null,
    version: 1,
  };
}

describe('PushTokenCipher', () => {
  it('round-trips with AES-GCM and rejects tampering or the wrong key', () => {
    const token = 'ios-registration-token-value';
    const context = { organizationId: ORGANIZATION_ID, userId: USER_ID, deviceId: RESOURCE_ID };
    const cipher = new PushTokenCipher(Buffer.alloc(32, 4), 8);
    const encrypted = cipher.encrypt(token, context);
    assert.notEqual(encrypted, token);
    assert.equal(cipher.decrypt(encrypted, context), token);

    const pieces = encrypted.split('.');
    pieces[4] = `${pieces[4]?.startsWith('A') === true ? 'B' : 'A'}${pieces[4]?.slice(1)}`;
    assert.throws(
      () => cipher.decrypt(pieces.join('.'), context),
      (error: unknown) =>
        error instanceof ApplicationError &&
        error.code === 'SYSTEM_DATA_INTEGRITY_ERROR' &&
        error.details.invariant === 'PUSH_TOKEN_CIPHERTEXT_INVALID',
    );
    assert.throws(
      () => new PushTokenCipher(Buffer.alloc(32, 5), 8).decrypt(encrypted, context),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'SYSTEM_DATA_INTEGRITY_ERROR',
    );
    assert.throws(
      () => cipher.decrypt(encrypted, { ...context, userId: `${USER_ID}-other` }),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'SYSTEM_DATA_INTEGRITY_ERROR',
    );
  });
});

describe('ClientMessagingService', () => {
  it('marks only the principal notification as read and emits durable evidence', async () => {
    const harness = createHarness({ notification: notificationRow() });
    const result = await harness.service.markNotificationRead(principal, RESOURCE_ID, {
      requestId: 'request-notification-read',
      idempotencyKey: 'notification-read-key',
    });

    assert.equal(result.readAt, NOW.toISOString());
    assert.equal('organizationId' in result, false);
    const where = record(harness.calls.notificationFinds[0]?.where);
    assert.equal(where.organizationId, ORGANIZATION_ID);
    assert.equal(where.recipientUserId, USER_ID);
    assert.equal(harness.calls.events[0]?.eventType, 'READ');
    assert.equal(harness.calls.audit[0]?.actionType, 'NOTIFICATION_READ');
    assert.equal(harness.calls.outbox[0]?.eventType, 'NOTIFICATION_READ_V1');
  });

  it('registers IOS tokens encrypted and never leaks token material to projections or evidence', async () => {
    const harness = createHarness();
    const registrationToken = 'ios-device-registration-token-0001';
    const result = await harness.service.registerPushDevice(
      principal,
      {
        platform: 'IOS',
        registrationToken,
        appVersion: '1.4.0',
        locale: 'en',
      },
      { requestId: 'request-push-register', idempotencyKey: 'push-register-key' },
    );

    const stored = harness.calls.pushCreates[0];
    assert.equal(result.platform, 'IOS');
    assert.equal('registrationToken' in result, false);
    assert.equal('registrationTokenHash' in result, false);
    assert.equal('registrationTokenCiphertext' in result, false);
    assert.notEqual(stored?.registrationTokenHash, registrationToken);
    assert.notEqual(stored?.registrationTokenCiphertext, registrationToken);
    assert.equal(stored?.encryptionKeyVersion, 3);
    const externallyVisibleEvidence = JSON.stringify({
      result,
      audit: harness.calls.audit,
      outbox: harness.calls.outbox,
      events: harness.calls.events,
    });
    assert.equal(externallyVisibleEvidence.includes(registrationToken), false);
    assert.equal(
      externallyVisibleEvidence.includes(String(stored?.registrationTokenCiphertext)),
      false,
    );
    assert.equal(externallyVisibleEvidence.includes(String(stored?.registrationTokenHash)), false);
  });

  it('returns 409 and never transfers a token already owned by another user', async () => {
    const harness = createHarness({
      pushDevice: pushDeviceRow('0198c74b-7dc0-7000-8000-000000000077'),
    });
    await assert.rejects(
      () =>
        harness.service.registerPushDevice(
          principal,
          {
            platform: 'IOS',
            registrationToken: 'ios-device-registration-token-0002',
            appVersion: '1.4.0',
            locale: 'en',
          },
          { requestId: 'request-push-collision', idempotencyKey: 'push-collision-key' },
        ),
      (error: unknown) =>
        error instanceof ApplicationError &&
        error.code === 'CONFLICT_RESOURCE_ALREADY_EXISTS' &&
        error.status === 409,
    );
    assert.equal(harness.calls.pushCreates.length, 0);
    assert.equal(harness.calls.pushUpdates.length, 0);
    assert.equal(harness.calls.events.length, 0);
    assert.equal(harness.calls.audit.length, 0);
    assert.equal(harness.calls.outbox.length, 0);
  });

  it('revokes only a self-scoped push device and destroys decryptable token material', async () => {
    const harness = createHarness({ pushDevice: pushDeviceRow() });
    const result = await harness.service.unregisterPushDevice(principal, RESOURCE_ID, {
      requestId: 'request-push-unregister',
      idempotencyKey: 'push-unregister-key',
    });

    assert.equal(result, null);
    assert.equal(harness.calls.pushFinds.length, 2);
    const where = record(harness.calls.pushFinds[0]?.where);
    assert.equal(where.organizationId, ORGANIZATION_ID);
    assert.equal(where.userId, USER_ID);
    const update = dataFrom(harness.calls.pushUpdates[0]);
    assert.equal(update.status, 'REVOKED');
    assert.equal(update.registrationTokenCiphertext, null);
    assert.notEqual(update.registrationTokenHash, 'hashed');
    assert.equal(harness.calls.events[0]?.eventType, 'REVOKED');
    assert.equal(harness.calls.outbox[0]?.eventType, 'PUSH_DEVICE_REVOKED_V1');
  });

  it('derives missing preferences from the organization and persists the first update as version 2', async () => {
    const harness = createHarness();
    assert.deepEqual(await harness.service.getCurrentUserPreferences(principal), {
      locale: 'en',
      pushEnabled: false,
      emailEnabled: false,
      version: 1,
    });

    const updated = await harness.service.updateCurrentUserPreferences(
      principal,
      { locale: 'zh-CN', pushEnabled: true, emailEnabled: false, expectedVersion: 1 },
      { requestId: 'request-preferences', idempotencyKey: 'preferences-key' },
    );
    assert.deepEqual(updated, {
      locale: 'zh-CN',
      pushEnabled: true,
      emailEnabled: false,
      version: 2,
    });
    assert.equal(harness.calls.preferenceCreates[0]?.organizationId, ORGANIZATION_ID);
    assert.equal(harness.calls.preferenceCreates[0]?.userId, USER_ID);
    assert.equal(harness.calls.advisoryLocks.length, 1);
    assert.deepEqual(harness.calls.events[0]?.changedFields, ['locale', 'pushEnabled']);
  });

  it('creates feedback OPEN without copying content or client context into evidence', async () => {
    const harness = createHarness();
    const result = await harness.service.createFeedback(
      principal,
      {
        category: 'BUG',
        content: 'The save button is hidden on my phone.',
        clientContext: { platform: 'IOS', appVersion: '1.4.0', osVersion: '19.0' },
      },
      { requestId: 'request-feedback', idempotencyKey: 'feedback-key' },
    );

    assert.equal(result.status, 'OPEN');
    assert.equal(result.publicReply, null);
    assert.equal(harness.calls.feedbackCreates[0]?.createdByUserId, USER_ID);
    assert.equal(harness.calls.feedbackCreates[0]?.clientPlatform, 'IOS');
    assert.equal(harness.calls.events[0]?.eventType, 'CREATED');
    const evidence = JSON.stringify({
      audit: harness.calls.audit,
      outbox: harness.calls.outbox,
      events: harness.calls.events,
    });
    assert.equal(evidence.includes('The save button is hidden on my phone.'), false);
    assert.equal(evidence.includes('19.0'), false);
  });

  it('keeps feedback self-scoped for non-admins and only queries published help', async () => {
    const feedback: FeedbackRow = {
      id: RESOURCE_ID,
      organizationId: ORGANIZATION_ID,
      createdByUserId: USER_ID,
      category: 'BUG',
      content: 'A button is hidden.',
      status: 'OPEN',
      publicReply: null,
      clientPlatform: 'IOS',
      clientAppVersion: '1.4.0',
      clientOsVersion: '19.0',
      createdAt: NOW,
      updatedAt: NOW,
      version: 1,
    };
    const article: HelpArticleRow = {
      id: '0198c74b-7dc0-7000-8000-000000000088',
      category: 'ACCOUNT',
      locale: 'en',
      title: 'Sign in',
      bodyMarkdown: 'Use your university account.',
      status: 'PUBLISHED',
      publishedAt: NOW,
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const harness = createHarness({ feedbackRows: [feedback], helpRows: [article] });

    const feedbackPage = await harness.service.listFeedback(principal, {
      limit: 20,
    });
    assert.equal(feedbackPage.data[0]?.id, RESOURCE_ID);
    assert.equal('createdByUserId' in (feedbackPage.data[0] ?? {}), false);
    assert.equal('clientPlatform' in (feedbackPage.data[0] ?? {}), false);
    const feedbackWhere = record(harness.calls.feedbackFinds[0]?.where);
    assert.equal(feedbackWhere.organizationId, ORGANIZATION_ID);
    assert.equal(feedbackWhere.createdByUserId, USER_ID);

    const admin: AuthenticatedPrincipal = {
      ...principal,
      userId: '0198c74b-7dc0-7000-8000-000000000099',
      role: 'ADMIN',
    };
    await harness.service.listFeedback(admin, { limit: 20 });
    const adminFeedbackWhere = record(harness.calls.feedbackFinds[1]?.where);
    assert.equal(adminFeedbackWhere.organizationId, ORGANIZATION_ID);
    assert.equal('createdByUserId' in adminFeedbackWhere, false);

    const helpPage = await harness.service.listHelpArticles({ locale: 'en' });
    assert.equal(helpPage[0]?.id, article.id);
    const helpWhere = record(harness.calls.helpFinds[0]?.where);
    assert.equal(helpWhere.status, 'PUBLISHED');
    assert.deepEqual(helpWhere.publishedAt, { lte: NOW });
  });
});
