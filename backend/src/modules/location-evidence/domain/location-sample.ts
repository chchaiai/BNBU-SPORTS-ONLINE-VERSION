import { ApplicationError } from '../../../common/errors/application-error.js';

const MILLISECONDS_PER_DAY = 86_400_000;

export interface LocationSampleObservation {
  sampleId: string;
  observedAt: Date;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  altitudeMeters?: number;
  speedMillimetersPerSecond?: number;
}

export interface FingerprintedLocationSample {
  sample: LocationSampleObservation;
  fingerprint: string;
}

export type LocationSampleDisposition =
  | 'ACCEPTED'
  | 'DUPLICATE_IDENTICAL'
  | 'DUPLICATE_CONFLICT'
  | 'REJECTED_INVALID_SAMPLE'
  | 'REJECTED_BEFORE_SESSION'
  | 'REJECTED_TOO_OLD'
  | 'REJECTED_FUTURE'
  | 'REJECTED_ACCURACY';

export type LocationSampleQualityFlag = 'OUT_OF_ORDER';

export interface LocationSampleClassification {
  sampleId: string;
  disposition: LocationSampleDisposition;
  qualityFlags: readonly LocationSampleQualityFlag[];
}

export interface LocationSampleValidationContext {
  sessionStartedAt: Date;
  now: Date;
  rawRetentionDays: number;
  maximumAccuracyMeters: number;
  lastAcceptedObservedAt: Date | null;
  knownFingerprints: ReadonlyMap<string, string>;
}

export interface LocationSampleBatchClassification {
  results: readonly LocationSampleClassification[];
  acceptedCount: number;
  duplicateCount: number;
  rejectedCount: number;
  nextLastAcceptedObservedAt: Date | null;
  nextKnownFingerprints: ReadonlyMap<string, string>;
}

function validObservation(sample: LocationSampleObservation): boolean {
  return (
    sample.sampleId.length > 0 &&
    Number.isFinite(sample.observedAt.getTime()) &&
    Number.isFinite(sample.latitude) &&
    sample.latitude >= -90 &&
    sample.latitude <= 90 &&
    Number.isFinite(sample.longitude) &&
    sample.longitude >= -180 &&
    sample.longitude <= 180 &&
    Number.isSafeInteger(sample.accuracyMeters) &&
    sample.accuracyMeters >= 0 &&
    (sample.altitudeMeters === undefined || Number.isSafeInteger(sample.altitudeMeters)) &&
    (sample.speedMillimetersPerSecond === undefined ||
      (Number.isSafeInteger(sample.speedMillimetersPerSecond) &&
        sample.speedMillimetersPerSecond >= 0))
  );
}

function assertValidationContext(context: LocationSampleValidationContext): void {
  if (
    !Number.isFinite(context.sessionStartedAt.getTime()) ||
    !Number.isFinite(context.now.getTime()) ||
    context.sessionStartedAt.getTime() > context.now.getTime() ||
    !Number.isSafeInteger(context.rawRetentionDays) ||
    context.rawRetentionDays < 0 ||
    !Number.isSafeInteger(context.maximumAccuracyMeters) ||
    context.maximumAccuracyMeters < 1
  ) {
    throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
      invariant: 'LOCATION_SAMPLE_VALIDATION_CONTEXT_INVALID',
    });
  }
}

function classifyOne(
  candidate: FingerprintedLocationSample,
  context: LocationSampleValidationContext,
  knownFingerprints: Map<string, string>,
  watermark: Date | null,
): LocationSampleClassification {
  const existingFingerprint = knownFingerprints.get(candidate.sample.sampleId);
  if (existingFingerprint !== undefined) {
    return {
      sampleId: candidate.sample.sampleId,
      disposition:
        existingFingerprint === candidate.fingerprint
          ? 'DUPLICATE_IDENTICAL'
          : 'DUPLICATE_CONFLICT',
      qualityFlags: [],
    };
  }

  const sample = candidate.sample;
  if (!validObservation(sample) || !/^[a-f0-9]{64}$/u.test(candidate.fingerprint)) {
    return { sampleId: sample.sampleId, disposition: 'REJECTED_INVALID_SAMPLE', qualityFlags: [] };
  }

  const observedTime = sample.observedAt.getTime();
  const nowTime = context.now.getTime();
  const retentionWindow = context.rawRetentionDays * MILLISECONDS_PER_DAY;
  if (!Number.isSafeInteger(retentionWindow)) {
    throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
      invariant: 'LOCATION_RAW_RETENTION_WINDOW_INVALID',
    });
  }
  if (observedTime < context.sessionStartedAt.getTime()) {
    return { sampleId: sample.sampleId, disposition: 'REJECTED_BEFORE_SESSION', qualityFlags: [] };
  }
  if (observedTime > nowTime) {
    return { sampleId: sample.sampleId, disposition: 'REJECTED_FUTURE', qualityFlags: [] };
  }
  if (observedTime < nowTime - retentionWindow) {
    return { sampleId: sample.sampleId, disposition: 'REJECTED_TOO_OLD', qualityFlags: [] };
  }
  if (sample.accuracyMeters > context.maximumAccuracyMeters) {
    return { sampleId: sample.sampleId, disposition: 'REJECTED_ACCURACY', qualityFlags: [] };
  }

  return {
    sampleId: sample.sampleId,
    disposition: 'ACCEPTED',
    qualityFlags: watermark !== null && observedTime < watermark.getTime() ? ['OUT_OF_ORDER'] : [],
  };
}

/**
 * Classifies a batch in caller order so offline/out-of-order evidence is visible,
 * while advancing the watermark only for accepted samples. The result deliberately
 * contains no coordinates and is safe to pass to persistence code (not to logs).
 */
export function classifyLocationSampleBatch(
  candidates: readonly FingerprintedLocationSample[],
  context: LocationSampleValidationContext,
): LocationSampleBatchClassification {
  assertValidationContext(context);
  const knownFingerprints = new Map(context.knownFingerprints);
  let watermark = context.lastAcceptedObservedAt;
  let acceptedCount = 0;
  let duplicateCount = 0;
  let rejectedCount = 0;
  const results: LocationSampleClassification[] = [];

  for (const candidate of candidates) {
    const result = classifyOne(candidate, context, knownFingerprints, watermark);
    results.push(result);
    if (result.disposition === 'ACCEPTED') {
      acceptedCount += 1;
      knownFingerprints.set(candidate.sample.sampleId, candidate.fingerprint);
      if (watermark === null || candidate.sample.observedAt.getTime() > watermark.getTime()) {
        watermark = candidate.sample.observedAt;
      }
    } else if (result.disposition === 'DUPLICATE_IDENTICAL') {
      duplicateCount += 1;
    } else {
      rejectedCount += 1;
    }
  }

  return {
    results,
    acceptedCount,
    duplicateCount,
    rejectedCount,
    nextLastAcceptedObservedAt: watermark,
    nextKnownFingerprints: knownFingerprints,
  };
}
