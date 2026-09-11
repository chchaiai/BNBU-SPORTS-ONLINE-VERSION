export const LOCATION_REVOCATION_DISPOSITIONS = [
  'DELETE_RAW',
  'DELETE_ALL',
  'RETAIN_UNTIL_EXPIRY',
] as const;

export type LocationRevocationDisposition = (typeof LOCATION_REVOCATION_DISPOSITIONS)[number];

export interface LocationMutationFacts {
  requestId: string;
  idempotencyKey: string | undefined;
}

export interface LocationPrivacyPolicyProjection {
  organizationId: string;
  policyVersion: string;
  collectionEnabled: boolean;
  purposeCode: 'EXERCISE_EVIDENCE';
  sampleIntervalSeconds: number | null;
  maximumAccuracyMeters: number | null;
  rawRetentionDays: number | null;
  coarseRetentionDays: number | null;
  coarseProjectionMeters: number | null;
  backgroundCollectionEnabled: boolean;
  revocationDisposition: LocationRevocationDisposition | null;
  effectiveAt: string;
  version: number;
}

export interface UpdateLocationPrivacyPolicyInput {
  policyVersion: string;
  collectionEnabled: boolean;
  sampleIntervalSeconds: number | null;
  maximumAccuracyMeters: number | null;
  rawRetentionDays: number | null;
  coarseRetentionDays: number | null;
  coarseProjectionMeters: number | null;
  backgroundCollectionEnabled: boolean;
  revocationDisposition: LocationRevocationDisposition | null;
  effectiveAt: string;
  expectedVersion: number;
}

export interface StartLocationTrackInput {
  consentPolicyVersion: string;
  clientObservedAt: string;
}

export interface LocationSampleInput {
  sampleId: string;
  observedAt: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  altitudeMeters?: number;
  speedMillimetersPerSecond?: number;
}

export interface AppendLocationSamplesInput {
  samples: readonly LocationSampleInput[];
  expectedVersion: number;
}

export interface FinalizeLocationTrackInput {
  clientObservedAt: string;
  expectedVersion: number;
}

export interface LocationTrackProjection {
  id: string;
  sessionId: string;
  status: 'COLLECTING' | 'FINALIZED' | 'REJECTED' | 'DELETED';
  acceptedSampleCount: number;
  startedAt: string;
  finalizedAt: string | null;
  policyVersion: string;
  version: number;
}

export interface LocationSummaryProjection {
  recordId: string;
  availability: 'NOT_COLLECTED' | 'PROCESSING' | 'AVAILABLE' | 'EXPIRED' | 'WITHHELD';
  precision: 'COARSE';
  coarseRoutePolyline: string | null;
  coarseDistanceMeters: number | null;
  observedStartAt: string | null;
  observedEndAt: string | null;
  expiresAt: string | null;
  policyVersion: string | null;
}

export interface LocationConsentProjection {
  status: 'ACTIVE' | 'REVOKED';
  policyVersion: string;
  consentedAt: string;
  revokedAt: string | null;
  version: number;
}

export interface RevokeLocationConsentFacts extends LocationMutationFacts {
  expectedVersion: number;
}

export interface InterruptSessionTrackReason {
  code: string;
  actorUserId: string;
  actorRole: 'STUDENT' | 'TEACHER' | 'ADMIN';
  authSessionId: string;
  requestId: string;
  idempotencyKey: string | undefined;
}
