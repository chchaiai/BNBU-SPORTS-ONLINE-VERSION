import { ApplicationError } from '../../../common/errors/application-error.js';

export const LOCATION_POLICY_PURPOSE = 'EXERCISE_EVIDENCE' as const;

export interface LocationPolicyDefinition {
  policyVersion: string;
  collectionEnabled: boolean;
  purposeCode: typeof LOCATION_POLICY_PURPOSE;
  sampleIntervalSeconds: number | null;
  maximumAccuracyMeters: number | null;
  rawRetentionDays: number | null;
  coarseRetentionDays: number | null;
  coarseProjectionMeters: number | null;
  effectiveAt: Date | null;
}

export type LocationPolicyParameterName =
  | 'policyVersion'
  | 'purposeCode'
  | 'sampleIntervalSeconds'
  | 'maximumAccuracyMeters'
  | 'rawRetentionDays'
  | 'coarseRetentionDays'
  | 'coarseProjectionMeters'
  | 'effectiveAt';

export interface EnabledLocationPolicy {
  policyVersion: string;
  collectionEnabled: true;
  purposeCode: typeof LOCATION_POLICY_PURPOSE;
  sampleIntervalSeconds: number;
  maximumAccuracyMeters: number;
  rawRetentionDays: number;
  coarseRetentionDays: number;
  coarseProjectionMeters: number;
  effectiveAt: Date;
}

export type LocationPolicyEvaluation =
  | {
      state: 'DISABLED';
      missingParameters: readonly LocationPolicyParameterName[];
      invalidParameters: readonly LocationPolicyParameterName[];
    }
  | {
      state: 'INCOMPLETE';
      missingParameters: readonly LocationPolicyParameterName[];
      invalidParameters: readonly LocationPolicyParameterName[];
    }
  | {
      state: 'ENABLED';
      policy: EnabledLocationPolicy;
      missingParameters: readonly [];
      invalidParameters: readonly [];
    };

function positiveInteger(value: number | null): value is number {
  return value !== null && Number.isSafeInteger(value) && value >= 1;
}

function nonNegativeInteger(value: number | null): value is number {
  return value !== null && Number.isSafeInteger(value) && value >= 0;
}

function validDate(value: Date | null): value is Date {
  return value !== null && Number.isFinite(value.getTime());
}

/**
 * Evaluates an organization policy without inventing fallback values. A disabled
 * policy may remain structurally incomplete; it never becomes collection-ready
 * until every parameter is explicitly supplied and valid.
 */
export function evaluateLocationPolicy(policy: LocationPolicyDefinition): LocationPolicyEvaluation {
  const missing: LocationPolicyParameterName[] = [];
  const invalid: LocationPolicyParameterName[] = [];

  if (policy.policyVersion.trim().length === 0) invalid.push('policyVersion');
  if (policy.purposeCode !== LOCATION_POLICY_PURPOSE) invalid.push('purposeCode');

  for (const [name, value] of [
    ['sampleIntervalSeconds', policy.sampleIntervalSeconds],
    ['maximumAccuracyMeters', policy.maximumAccuracyMeters],
    ['coarseProjectionMeters', policy.coarseProjectionMeters],
  ] as const) {
    if (value === null) missing.push(name);
    else if (!positiveInteger(value)) invalid.push(name);
  }

  for (const [name, value] of [
    ['rawRetentionDays', policy.rawRetentionDays],
    ['coarseRetentionDays', policy.coarseRetentionDays],
  ] as const) {
    if (value === null) missing.push(name);
    else if (!nonNegativeInteger(value)) invalid.push(name);
  }

  if (policy.effectiveAt === null) missing.push('effectiveAt');
  else if (!validDate(policy.effectiveAt)) invalid.push('effectiveAt');

  if (!policy.collectionEnabled) {
    return { state: 'DISABLED', missingParameters: missing, invalidParameters: invalid };
  }
  if (missing.length > 0 || invalid.length > 0) {
    return { state: 'INCOMPLETE', missingParameters: missing, invalidParameters: invalid };
  }

  return {
    state: 'ENABLED',
    policy: {
      policyVersion: policy.policyVersion,
      collectionEnabled: true,
      purposeCode: LOCATION_POLICY_PURPOSE,
      sampleIntervalSeconds: policy.sampleIntervalSeconds!,
      maximumAccuracyMeters: policy.maximumAccuracyMeters!,
      rawRetentionDays: policy.rawRetentionDays!,
      coarseRetentionDays: policy.coarseRetentionDays!,
      coarseProjectionMeters: policy.coarseProjectionMeters!,
      effectiveAt: policy.effectiveAt!,
    },
    missingParameters: [],
    invalidParameters: [],
  };
}

export function requireEnabledLocationPolicy(
  policy: LocationPolicyDefinition,
): EnabledLocationPolicy {
  const evaluation = evaluateLocationPolicy(policy);
  if (evaluation.state === 'ENABLED') return evaluation.policy;
  throw new ApplicationError('CONFLICT_UNSUPPORTED_RESOURCE_STATE', 409, {
    reason:
      evaluation.state === 'DISABLED'
        ? 'LOCATION_COLLECTION_DISABLED'
        : 'LOCATION_POLICY_INCOMPLETE',
    missingParameters: evaluation.missingParameters,
    invalidParameters: evaluation.invalidParameters,
  });
}
