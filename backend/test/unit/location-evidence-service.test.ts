import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AuditService } from '../../src/common/audit/audit.service.js';
import type { PrismaService } from '../../src/common/database/prisma.service.js';
import { ApplicationError } from '../../src/common/errors/application-error.js';
import type { AuthenticatedPrincipal } from '../../src/common/http/request-context.js';
import type { IdempotencyService } from '../../src/common/idempotency/idempotency.service.js';
import type { OutboxService } from '../../src/common/outbox/outbox.service.js';
import type { ExerciseRecordPolicyContext } from '../../src/common/policy/exercise-record-policy-resolver.js';
import type { SecureDigestService } from '../../src/common/security/secure-digest.service.js';
import { FixedClock } from '../../src/common/time/clock.js';
import { IdGenerator } from '../../src/common/time/id-generator.js';
import { LocationEvidenceService } from '../../src/modules/location-evidence/application/location-evidence.service.js';
import { LocationRawCipher } from '../../src/modules/location-evidence/infrastructure/location-raw-cipher.js';
import { LocationSampleFingerprint } from '../../src/modules/location-evidence/infrastructure/location-sample-fingerprint.js';

const NOW = new Date('2026-08-06T13:00:00.000Z');
const IDS = {
  organization: '0198c74b-7dc0-7000-8000-000000000001',
  studentUser: '0198c74b-7dc0-7000-8000-000000000002',
  teacherUser: '0198c74b-7dc0-7000-8000-000000000003',
  adminUser: '0198c74b-7dc0-7000-8000-000000000004',
  authSession: '0198c74b-7dc0-7000-8000-000000000005',
  student: '0198c74b-7dc0-7000-8000-000000000006',
  enrollment: '0198c74b-7dc0-7000-8000-000000000007',
  section: '0198c74b-7dc0-7000-8000-000000000008',
  semester: '0198c74b-7dc0-7000-8000-000000000009',
  session: '0198c74b-7dc0-7000-8000-00000000000a',
  track: '0198c74b-7dc0-7000-8000-00000000000b',
  policy: '0198c74b-7dc0-7000-8000-00000000000c',
  consent: '0198c74b-7dc0-7000-8000-00000000000d',
  record: '0198c74b-7dc0-7000-8000-00000000000e',
  summary: '0198c74b-7dc0-7000-8000-00000000000f',
  sample: '0198c74b-7dc0-7000-8000-000000000010',
} as const;

class SequenceIds extends IdGenerator {
  private sequence = 100;

  next(): string {
    const suffix = this.sequence.toString(16).padStart(12, '0');
    this.sequence += 1;
    return `0198c74b-7dc0-7000-8000-${suffix}`;
  }
}

function principal(role: AuthenticatedPrincipal['role']): AuthenticatedPrincipal {
  return {
    userId:
      role === 'STUDENT' ? IDS.studentUser : role === 'TEACHER' ? IDS.teacherUser : IDS.adminUser,
    organizationId: IDS.organization,
    role,
    sessionId: IDS.authSession,
    tokenVersion: 1,
    jti: `jti-${role}`,
  };
}

function record(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  return value as Record<string, unknown>;
}

function createService(
  prisma: unknown,
  options: { transaction?: unknown; audits?: unknown[]; outbox?: unknown[] } = {},
): LocationEvidenceService {
  const idempotency = {
    execute: async (
      _input: unknown,
      action: (transaction: unknown) => Promise<{ kind: string; value?: unknown; error?: unknown }>,
    ): Promise<unknown> => {
      const outcome = await action(options.transaction ?? {});
      if (outcome.kind === 'FAILURE') throw outcome.error;
      return outcome.value;
    },
    success: (value: unknown): { kind: 'SUCCESS'; value: unknown } => ({ kind: 'SUCCESS', value }),
    failure: (error: unknown): { kind: 'FAILURE'; error: unknown } => ({
      kind: 'FAILURE',
      error,
    }),
  } as unknown as IdempotencyService;
  const audit = {
    append: (_transaction: unknown, input: unknown): Promise<void> => {
      options.audits?.push(input);
      return Promise.resolve();
    },
  } as unknown as AuditService;
  const outbox = {
    append: (_transaction: unknown, input: unknown): Promise<string> => {
      options.outbox?.push(input);
      return Promise.resolve('outbox-id');
    },
  } as unknown as OutboxService;
  const digest = {
    digest: (): string => 'a'.repeat(64),
  } as unknown as SecureDigestService;
  return new LocationEvidenceService(
    prisma as PrismaService,
    idempotency,
    audit,
    outbox,
    new FixedClock(NOW),
    new SequenceIds(),
    digest,
    new LocationRawCipher(Buffer.alloc(32, 7), 3),
    new LocationSampleFingerprint(Buffer.alloc(32, 9)),
  );
}

function disabledPolicy(): Record<string, unknown> {
  return {
    id: IDS.policy,
    organizationId: IDS.organization,
    policyVersion: 'gps-disabled-v1',
    purposeCode: 'EXERCISE_EVIDENCE',
    collectionEnabled: false,
    sampleIntervalSeconds: null,
    maximumAccuracyMeters: null,
    rawRetentionDays: null,
    coarseRetentionDays: null,
    coarseProjectionMeters: null,
    backgroundCollectionEnabled: false,
    revocationDisposition: null,
    effectiveAt: new Date('2026-08-01T00:00:00.000Z'),
    version: 1,
    createdByUserId: IDS.adminUser,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
  };
}

describe('LocationEvidenceService policy safety', () => {
  it('projects an explicitly disabled, incomplete policy without supplying defaults', async () => {
    const service = createService({
      locationPrivacyPolicy: { findFirst: () => Promise.resolve(disabledPolicy()) },
    });

    const result = await service.getPolicy(principal('STUDENT'));

    assert.equal(result.collectionEnabled, false);
    assert.equal(result.sampleIntervalSeconds, null);
    assert.equal(result.maximumAccuracyMeters, null);
    assert.equal(result.rawRetentionDays, null);
    assert.equal(result.coarseRetentionDays, null);
    assert.equal(result.coarseProjectionMeters, null);
    assert.equal(result.revocationDisposition, null);
  });

  it('rejects enabling an incomplete policy before any row, audit, or outbox write', async () => {
    const writes: string[] = [];
    const transaction = {
      $queryRaw: () => Promise.resolve([]),
      locationPrivacyPolicy: {
        findFirst: () => Promise.resolve(disabledPolicy()),
        create: (): Promise<never> => {
          writes.push('POLICY');
          return Promise.reject(new Error('must not write'));
        },
      },
    };
    const audits: unknown[] = [];
    const outbox: unknown[] = [];
    const service = createService({}, { transaction, audits, outbox });

    await assert.rejects(
      service.updatePolicy(
        principal('ADMIN'),
        {
          policyVersion: 'gps-incomplete-v2',
          collectionEnabled: true,
          sampleIntervalSeconds: null,
          maximumAccuracyMeters: null,
          rawRetentionDays: null,
          coarseRetentionDays: null,
          coarseProjectionMeters: null,
          backgroundCollectionEnabled: false,
          revocationDisposition: null,
          effectiveAt: NOW.toISOString(),
          expectedVersion: 1,
        },
        { requestId: 'gps-policy-incomplete', idempotencyKey: 'gps-policy-incomplete' },
      ),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'CONFLICT_UNSUPPORTED_RESOURCE_STATE',
    );
    assert.deepEqual(writes, []);
    assert.deepEqual(audits, []);
    assert.deepEqual(outbox, []);
  });
});

describe('LocationEvidenceService secure intake and projection', () => {
  it('deduplicates identical samples and persists coordinates only inside ciphertext', async () => {
    const sampleWrites: Record<string, unknown>[] = [];
    const secretWrites: Record<string, unknown>[] = [];
    const eventWrites: Record<string, unknown>[] = [];
    const audits: unknown[] = [];
    const outbox: unknown[] = [];
    const session = {
      id: IDS.session,
      organizationId: IDS.organization,
      studentId: IDS.student,
      enrollmentId: IDS.enrollment,
      classSectionId: IDS.section,
      semesterId: IDS.semester,
      status: 'IN_PROGRESS',
      currentIntervalStartedAt: new Date('2026-08-06T12:00:00.000Z'),
      startedAt: new Date('2026-08-06T12:00:00.000Z'),
    };
    const track = {
      id: IDS.track,
      organizationId: IDS.organization,
      sessionId: IDS.session,
      studentId: IDS.student,
      enrollmentId: IDS.enrollment,
      classSectionId: IDS.section,
      semesterId: IDS.semester,
      policyId: IDS.policy,
      policyVersion: 'gps-enabled-v2',
      consentId: IDS.consent,
      status: 'COLLECTING',
      acceptedSampleCount: 0,
      rejectedSampleCount: 0,
      startedAt: new Date('2026-08-06T12:00:00.000Z'),
      lastObservedAt: null,
      finalizedAt: null,
      interruptedAt: null,
      deletedAt: null,
      reasonCode: null,
      rawExpiresAt: new Date('2026-08-07T12:00:00.000Z'),
      version: 1,
      createdAt: new Date('2026-08-06T12:00:00.000Z'),
      updatedAt: new Date('2026-08-06T12:00:00.000Z'),
    };
    const updatedTrack = {
      ...track,
      acceptedSampleCount: 1,
      lastObservedAt: new Date('2026-08-06T12:30:00.000Z'),
      version: 2,
      updatedAt: NOW,
    };
    const policy = {
      ...disabledPolicy(),
      policyVersion: 'gps-enabled-v2',
      collectionEnabled: true,
      sampleIntervalSeconds: 30,
      maximumAccuracyMeters: 50,
      rawRetentionDays: 1,
      coarseRetentionDays: 7,
      coarseProjectionMeters: 200,
      revocationDisposition: 'DELETE_RAW',
      version: 2,
    };
    const consent = {
      id: IDS.consent,
      organizationId: IDS.organization,
      studentId: IDS.student,
      purposeCode: 'EXERCISE_EVIDENCE',
      status: 'ACTIVE',
      policyId: IDS.policy,
      policyVersion: 'gps-enabled-v2',
      consentedAt: new Date('2026-08-06T12:00:00.000Z'),
      revokedAt: null,
      version: 1,
    };
    let trackLookup = 0;
    const transaction = {
      $queryRaw: () => Promise.resolve([]),
      exerciseSession: { findFirst: () => Promise.resolve(session) },
      locationPrivacyPolicy: { findFirst: () => Promise.resolve(policy) },
      locationConsent: { findFirst: () => Promise.resolve(consent) },
      locationTrack: {
        findUnique: (): Promise<unknown> => {
          trackLookup += 1;
          return Promise.resolve(trackLookup <= 2 ? track : updatedTrack);
        },
        updateMany: () => Promise.resolve({ count: 1 }),
        findUniqueOrThrow: () => Promise.resolve(updatedTrack),
      },
      locationSample: {
        findMany: () => Promise.resolve([]),
        create: (input: unknown): Promise<unknown> => {
          sampleWrites.push(record(record(input).data));
          return Promise.resolve(record(input).data);
        },
      },
      locationSampleSecret: {
        create: (input: unknown): Promise<unknown> => {
          secretWrites.push(record(record(input).data));
          return Promise.resolve(record(input).data);
        },
      },
      locationTrackEvent: {
        create: (input: unknown): Promise<unknown> => {
          eventWrites.push(record(record(input).data));
          return Promise.resolve(record(input).data);
        },
      },
    };
    const service = createService({}, { transaction, audits, outbox });
    const sample = {
      sampleId: IDS.sample,
      observedAt: '2026-08-06T12:30:00.000Z',
      latitude: 22.2819,
      longitude: 114.1589,
      accuracyMeters: 8,
    };

    const projection = await service.append(
      principal('STUDENT'),
      {
        sessionId: IDS.session,
        organizationId: IDS.organization,
        studentId: IDS.student,
        studentUserId: IDS.studentUser,
        enrollmentId: IDS.enrollment,
        classSectionId: IDS.section,
        status: 'IN_PROGRESS',
      },
      { samples: [sample, sample], expectedVersion: 1 },
      { requestId: 'gps-append-dedup', idempotencyKey: 'gps-append-dedup' },
    );

    assert.equal(sampleWrites.length, 1);
    assert.equal(secretWrites.length, 1);
    assert.equal(eventWrites.length, 1);
    assert.equal(Object.hasOwn(sampleWrites[0]!, 'latitude'), false);
    assert.equal(Object.hasOwn(sampleWrites[0]!, 'longitude'), false);
    const ciphertext = String(secretWrites[0]!.ciphertext);
    assert.equal(ciphertext.startsWith('v1.3.'), true);
    assert.equal(ciphertext.includes('22.2819'), false);
    assert.equal(ciphertext.includes('114.1589'), false);
    assert.equal(JSON.stringify(projection).includes('latitude'), false);
    for (const evidence of [...audits, ...outbox, ...eventWrites]) {
      const serialized = JSON.stringify(evidence).toLowerCase();
      assert.equal(serialized.includes('latitude'), false);
      assert.equal(serialized.includes('longitude'), false);
      assert.equal(serialized.includes('ciphertext'), false);
    }
  });

  it('returns the same coarse-only summary to student, responsible teacher, and admin', async () => {
    const summary = {
      id: IDS.summary,
      organizationId: IDS.organization,
      trackId: IDS.track,
      recordId: IDS.record,
      availability: 'AVAILABLE',
      coarseRoutePolyline: 'CG1:200:100,200;101,201',
      coarseDistanceMeters: 1_200,
      observedStartAt: new Date('2026-08-06T12:10:00.000Z'),
      observedEndAt: new Date('2026-08-06T12:50:00.000Z'),
      expiresAt: new Date('2026-08-13T13:00:00.000Z'),
      policyVersion: 'gps-enabled-v2',
      qualityFlags: ['ENDPOINTS_STRIPPED'],
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const service = createService({
      exerciseRecord: { findFirst: () => Promise.resolve({ sessionId: IDS.session }) },
      locationSummary: { findFirst: () => Promise.resolve(summary) },
    });
    const context: ExerciseRecordPolicyContext = {
      recordId: IDS.record,
      organizationId: IDS.organization,
      studentId: IDS.student,
      studentUserId: IDS.studentUser,
      enrollmentId: IDS.enrollment,
      classSectionId: IDS.section,
      teacherUserId: IDS.teacherUser,
      status: 'SUBMITTED',
      version: 1,
    };

    const projections = await Promise.all(
      (['STUDENT', 'TEACHER', 'ADMIN'] as const).map((role) =>
        service.summary(principal(role), context),
      ),
    );

    assert.deepEqual(projections[0], projections[1]);
    assert.deepEqual(projections[1], projections[2]);
    const serialized = JSON.stringify(projections[0]).toLowerCase();
    for (const forbidden of ['latitude', 'longitude', 'ciphertext', 'sampleid', 'qualityflags']) {
      assert.equal(serialized.includes(forbidden), false);
    }
    assert.equal(projections[0]!.precision, 'COARSE');
  });
});
