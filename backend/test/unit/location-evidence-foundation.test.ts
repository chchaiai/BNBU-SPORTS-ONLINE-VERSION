import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ApplicationError } from '../../src/common/errors/application-error.js';
import { projectCoarseLocation } from '../../src/modules/location-evidence/domain/coarse-location-projection.js';
import {
  evaluateLocationPolicy,
  LOCATION_POLICY_PURPOSE,
  requireEnabledLocationPolicy,
  type LocationPolicyDefinition,
} from '../../src/modules/location-evidence/domain/location-policy.js';
import {
  locationRetentionDeadline,
  selectDueCoarseLocationRetention,
  selectDueRawLocationRetention,
} from '../../src/modules/location-evidence/domain/location-retention.js';
import {
  classifyLocationSampleBatch,
  type LocationSampleObservation,
} from '../../src/modules/location-evidence/domain/location-sample.js';
import { LocationRawCipher } from '../../src/modules/location-evidence/infrastructure/location-raw-cipher.js';
import { LocationSampleFingerprint } from '../../src/modules/location-evidence/infrastructure/location-sample-fingerprint.js';

const policy = (overrides: Partial<LocationPolicyDefinition> = {}): LocationPolicyDefinition => ({
  policyVersion: 'synthetic-v1',
  collectionEnabled: true,
  purposeCode: LOCATION_POLICY_PURPOSE,
  sampleIntervalSeconds: 15,
  maximumAccuracyMeters: 30,
  rawRetentionDays: 7,
  coarseRetentionDays: 90,
  coarseProjectionMeters: 100,
  effectiveAt: new Date('2026-08-06T00:00:00.000Z'),
  ...overrides,
});

const sample = (
  sampleId: string,
  observedAt: string,
  overrides: Partial<LocationSampleObservation> = {},
): LocationSampleObservation => ({
  sampleId,
  observedAt: new Date(observedAt),
  latitude: 22.300123,
  longitude: 114.200456,
  accuracyMeters: 10,
  ...overrides,
});

describe('location evidence raw cryptography', () => {
  it('round-trips AES-256-GCM and binds every row identity field as AAD', () => {
    const cipher = new LocationRawCipher(Buffer.alloc(32, 7), 3);
    const context = {
      organizationId: 'organization-1',
      trackId: 'track-1',
      sampleId: 'sample-1',
      observedAt: new Date('2026-08-06T12:00:00.000Z'),
    };
    const payload = {
      latitude: 22.300123,
      longitude: 114.200456,
      altitudeMeters: 12,
      speedMillimetersPerSecond: 2500,
    };
    const encrypted = cipher.encrypt(context, payload);
    assert.match(encrypted, /^v1\.3\./u);
    assert.equal(encrypted.includes(String(payload.latitude)), false);
    assert.equal(encrypted.includes(String(payload.longitude)), false);
    assert.deepEqual(cipher.decrypt(context, encrypted), payload);

    for (const mismatchedContext of [
      { ...context, organizationId: 'organization-2' },
      { ...context, trackId: 'track-2' },
      { ...context, sampleId: 'sample-2' },
      { ...context, observedAt: new Date('2026-08-06T12:00:01.000Z') },
    ]) {
      assert.throws(
        () => cipher.decrypt(mismatchedContext, encrypted),
        (error: unknown) =>
          error instanceof ApplicationError &&
          error.code === 'SYSTEM_DATA_INTEGRITY_ERROR' &&
          JSON.stringify(error.details).includes('22.300123') === false,
      );
    }
  });

  it('rejects a modified ciphertext with a coordinate-free stable error', () => {
    const cipher = new LocationRawCipher(Buffer.alloc(32, 8), 1);
    const context = {
      organizationId: 'organization-1',
      trackId: 'track-1',
      sampleId: 'sample-1',
      observedAt: new Date('2026-08-06T12:00:00.000Z'),
    };
    const encrypted = cipher.encrypt(context, { latitude: 22.3, longitude: 114.2 });
    const parts = encrypted.split('.');
    parts[3] = `${parts[3]!.slice(0, -1)}${parts[3]!.endsWith('A') ? 'B' : 'A'}`;
    assert.throws(
      () => cipher.decrypt(context, parts.join('.')),
      (error: unknown) =>
        error instanceof ApplicationError &&
        error.details.invariant === 'LOCATION_RAW_CIPHERTEXT_AUTHENTICATION_FAILED' &&
        JSON.stringify(error).includes('114.2') === false,
    );
  });
});

describe('location policy gate', () => {
  it('keeps disabled and incomplete policies disabled without supplying defaults', () => {
    const disabled = policy({
      collectionEnabled: false,
      sampleIntervalSeconds: null,
      maximumAccuracyMeters: null,
      rawRetentionDays: null,
      coarseRetentionDays: null,
      coarseProjectionMeters: null,
      effectiveAt: null,
    });
    const evaluation = evaluateLocationPolicy(disabled);
    assert.equal(evaluation.state, 'DISABLED');
    assert.equal(disabled.sampleIntervalSeconds, null);
    assert.ok(evaluation.missingParameters.includes('sampleIntervalSeconds'));
    assert.throws(() => requireEnabledLocationPolicy(disabled), ApplicationError);

    const incomplete = evaluateLocationPolicy(
      policy({ collectionEnabled: true, rawRetentionDays: null }),
    );
    assert.equal(incomplete.state, 'INCOMPLETE');
    assert.deepEqual(incomplete.missingParameters, ['rawRetentionDays']);
  });

  it('returns only explicitly complete, enabled policy parameters', () => {
    const enabled = requireEnabledLocationPolicy(policy());
    assert.equal(enabled.collectionEnabled, true);
    assert.equal(enabled.sampleIntervalSeconds, 15);
    assert.equal(enabled.rawRetentionDays, 7);
  });
});

describe('location sample fingerprinting and classification', () => {
  it('creates a stable keyed fingerprint and detects identical versus conflicting IDs', () => {
    const fingerprints = new LocationSampleFingerprint(Buffer.alloc(32, 9));
    const first = sample('sample-1', '2026-08-06T12:00:00.000Z');
    const same = sample('sample-1', '2026-08-06T12:00:00.000Z');
    const changed = sample('sample-1', '2026-08-06T12:00:00.000Z', { latitude: 22.31 });
    const firstFingerprint = fingerprints.fingerprint(first);
    assert.equal(firstFingerprint, fingerprints.fingerprint(same));
    assert.notEqual(firstFingerprint, fingerprints.fingerprint(changed));

    const context = {
      sessionStartedAt: new Date('2026-08-06T11:00:00.000Z'),
      now: new Date('2026-08-06T13:00:00.000Z'),
      rawRetentionDays: 1,
      maximumAccuracyMeters: 30,
      lastAcceptedObservedAt: new Date('2026-08-06T12:30:00.000Z'),
      knownFingerprints: new Map([['sample-1', firstFingerprint]]),
    };
    const result = classifyLocationSampleBatch(
      [
        { sample: same, fingerprint: fingerprints.fingerprint(same) },
        { sample: changed, fingerprint: fingerprints.fingerprint(changed) },
      ],
      context,
    );
    assert.deepEqual(
      result.results.map((entry) => entry.disposition),
      ['DUPLICATE_IDENTICAL', 'DUPLICATE_CONFLICT'],
    );
  });

  it('classifies time, accuracy, and accepted out-of-order samples deterministically', () => {
    const fingerprints = new LocationSampleFingerprint(Buffer.alloc(32, 10));
    const observations = [
      sample('accepted', '2026-08-06T12:40:00.000Z'),
      sample('out-of-order', '2026-08-06T12:20:00.000Z'),
      sample('future', '2026-08-06T13:00:01.000Z'),
      sample('before-session', '2026-08-03T23:59:59.000Z'),
      sample('too-old', '2026-08-04T12:00:00.000Z'),
      sample('inaccurate', '2026-08-06T12:45:00.000Z', { accuracyMeters: 31 }),
    ];
    const result = classifyLocationSampleBatch(
      observations.map((observation) => ({
        sample: observation,
        fingerprint: fingerprints.fingerprint(observation),
      })),
      {
        sessionStartedAt: new Date('2026-08-04T00:00:00.000Z'),
        now: new Date('2026-08-06T13:00:00.000Z'),
        rawRetentionDays: 1,
        maximumAccuracyMeters: 30,
        lastAcceptedObservedAt: new Date('2026-08-06T12:30:00.000Z'),
        knownFingerprints: new Map(),
      },
    );
    assert.deepEqual(
      result.results.map((entry) => [entry.disposition, entry.qualityFlags]),
      [
        ['ACCEPTED', []],
        ['ACCEPTED', ['OUT_OF_ORDER']],
        ['REJECTED_FUTURE', []],
        ['REJECTED_BEFORE_SESSION', []],
        ['REJECTED_TOO_OLD', []],
        ['REJECTED_ACCURACY', []],
      ],
    );
  });
});

describe('coarse projection and retention', () => {
  it('strips endpoints, emits coarse grid cells, and never embeds exact coordinates', () => {
    const points = [
      sample('start', '2026-08-06T12:00:00.000Z'),
      sample('middle-1', '2026-08-06T12:01:00.000Z', {
        latitude: 22.301234,
        longitude: 114.201234,
      }),
      sample('middle-2', '2026-08-06T12:02:00.000Z', {
        latitude: 22.302345,
        longitude: 114.202345,
      }),
      sample('end', '2026-08-06T12:03:00.000Z', {
        latitude: 22.303456,
        longitude: 114.203456,
      }),
    ];
    const projection = projectCoarseLocation(points, 100);
    assert.match(projection.coarseRoute ?? '', /^CG1:100:/u);
    for (const point of points) {
      assert.equal(projection.coarseRoute?.includes(String(point.latitude)), false);
      assert.equal(projection.coarseRoute?.includes(String(point.longitude)), false);
    }
    assert.equal(projection.coarseDistanceMeters % 100, 0);
    assert.ok(projection.qualityFlags.includes('ENDPOINTS_STRIPPED'));
    assert.ok(projection.qualityFlags.includes('GRID_SNAPPED'));

    const changedEndpoints = [
      { ...points[0]!, latitude: 22.29, longitude: 114.19 },
      points[1]!,
      points[2]!,
      { ...points[3]!, latitude: 22.31, longitude: 114.21 },
    ];
    assert.equal(projectCoarseLocation(changedEndpoints, 100).coarseRoute, projection.coarseRoute);
  });

  it('selects raw and coarse expiry work deterministically with explicit limits', () => {
    const now = new Date('2026-08-10T00:00:00.000Z');
    assert.equal(
      locationRetentionDeadline(new Date('2026-08-06T00:00:00.000Z'), 4).toISOString(),
      now.toISOString(),
    );
    assert.equal(
      locationRetentionDeadline(new Date('2026-08-06T00:00:00.000Z'), 0).toISOString(),
      '2026-08-06T00:00:00.000Z',
    );
    const candidates = [
      {
        trackId: 'track-b',
        rawExpiresAt: new Date('2026-08-09T00:00:00.000Z'),
        rawDeletedAt: null,
        coarseExpiresAt: new Date('2026-08-12T00:00:00.000Z'),
        coarseDeletedAt: null,
      },
      {
        trackId: 'track-a',
        rawExpiresAt: new Date('2026-08-09T00:00:00.000Z'),
        rawDeletedAt: null,
        coarseExpiresAt: now,
        coarseDeletedAt: null,
      },
      {
        trackId: 'track-deleted',
        rawExpiresAt: new Date('2026-08-08T00:00:00.000Z'),
        rawDeletedAt: new Date('2026-08-09T00:00:00.000Z'),
        coarseExpiresAt: now,
        coarseDeletedAt: new Date('2026-08-09T00:00:00.000Z'),
      },
    ];
    assert.deepEqual(
      selectDueRawLocationRetention(candidates, now, 1).map((entry) => entry.trackId),
      ['track-a'],
    );
    assert.deepEqual(
      selectDueCoarseLocationRetention(candidates, now, 10).map((entry) => entry.trackId),
      ['track-a'],
    );
  });
});
