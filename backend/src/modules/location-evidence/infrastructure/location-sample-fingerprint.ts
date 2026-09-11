import { createHmac } from 'node:crypto';

import type { LocationSampleObservation } from '../domain/location-sample.js';

function requireKey(key: Uint8Array): Buffer {
  if (key.byteLength !== 32) {
    throw new Error('Location sample fingerprint key must contain exactly 32 bytes');
  }
  return Buffer.from(key);
}

function canonicalNumber(value: number | undefined): number | null {
  if (value === undefined) return null;
  if (!Number.isFinite(value)) throw new Error('Location sample contains a non-finite number');
  return Object.is(value, -0) ? 0 : value;
}

/** Keyed, deterministic comparison value. It must never be emitted to application logs. */
export class LocationSampleFingerprint {
  private readonly key: Buffer;

  constructor(key: Uint8Array) {
    this.key = requireKey(key);
  }

  fingerprint(sample: LocationSampleObservation): string {
    if (!Number.isFinite(sample.observedAt.getTime())) {
      throw new Error('Location sample observedAt must be a valid instant');
    }
    const canonical = JSON.stringify([
      sample.sampleId,
      sample.observedAt.toISOString(),
      canonicalNumber(sample.latitude),
      canonicalNumber(sample.longitude),
      canonicalNumber(sample.accuracyMeters),
      canonicalNumber(sample.altitudeMeters),
      canonicalNumber(sample.speedMillimetersPerSecond),
    ]);
    return createHmac('sha256', this.key)
      .update('bnbu-location-sample\0v1\0', 'utf8')
      .update(canonical, 'utf8')
      .digest('hex');
  }
}
