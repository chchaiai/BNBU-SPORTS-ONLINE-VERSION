export const CLIENT_PLATFORMS = ['ANDROID', 'WEB', 'IOS'] as const;
export type ClientPlatform = (typeof CLIENT_PLATFORMS)[number];

export type AppReleaseEnforcement = 'NONE' | 'RECOMMENDED' | 'REQUIRED';

export interface StoredAppReleasePolicy {
  id: string;
  platform: ClientPlatform;
  minimumSupportedVersion: string;
  latestVersion: string;
  minimumSupportedBuildNumber: number | null;
  latestBuildNumber: number | null;
  enforcement: AppReleaseEnforcement;
  message: string | null;
  downloadUrl: string | null;
  effectiveAt: Date;
  expiresAt: Date | null;
  policyVersion: string;
}

export interface AppReleasePolicyProjection {
  platform: ClientPlatform;
  minimumSupportedVersion: string;
  latestVersion: string;
  minimumSupportedBuildNumber: number | null;
  latestBuildNumber: number | null;
  enforcement: AppReleaseEnforcement;
  message: string | null;
  downloadUrl: string | null;
  effectiveAt: string;
  expiresAt: string | null;
  policyVersion: string;
}

export class AppReleasePolicyAmbiguousError extends Error {
  constructor() {
    super('More than one release policy has the same effective precedence.');
    this.name = 'AppReleasePolicyAmbiguousError';
  }
}

export function evaluateIosBuildEnforcement(
  currentBuildNumber: number,
  minimumSupportedBuildNumber: number,
  latestBuildNumber: number,
): AppReleaseEnforcement {
  for (const value of [currentBuildNumber, minimumSupportedBuildNumber, latestBuildNumber]) {
    if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) {
      throw new RangeError('iOS build numbers must be positive 32-bit integers.');
    }
  }
  if (minimumSupportedBuildNumber > latestBuildNumber) {
    throw new RangeError('The minimum iOS build number cannot exceed the latest build number.');
  }
  if (currentBuildNumber < minimumSupportedBuildNumber) return 'REQUIRED';
  if (currentBuildNumber < latestBuildNumber) return 'RECOMMENDED';
  return 'NONE';
}

/**
 * Selects a persisted policy by platform and server time only. Version strings remain opaque:
 * this module deliberately does not invent Android, Web, or iOS comparison semantics.
 */
export function selectEffectiveAppReleasePolicy(
  policies: readonly StoredAppReleasePolicy[],
  platform: ClientPlatform,
  now: Date,
): AppReleasePolicyProjection | null {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) throw new RangeError('Invalid release-policy selection time.');

  let selected: StoredAppReleasePolicy | undefined;
  for (const policy of policies) {
    const effectiveAtMs = policy.effectiveAt.getTime();
    const expiresAtMs = policy.expiresAt?.getTime() ?? null;
    if (
      !Number.isFinite(effectiveAtMs) ||
      (expiresAtMs !== null && !Number.isFinite(expiresAtMs))
    ) {
      throw new RangeError('Stored release policy contains an invalid timestamp.');
    }
    if (
      policy.platform !== platform ||
      effectiveAtMs > nowMs ||
      (expiresAtMs !== null && expiresAtMs <= nowMs)
    ) {
      continue;
    }
    if (selected === undefined || effectiveAtMs > selected.effectiveAt.getTime()) {
      selected = policy;
      continue;
    }
    if (effectiveAtMs === selected.effectiveAt.getTime() && policy.id !== selected.id) {
      throw new AppReleasePolicyAmbiguousError();
    }
  }

  return selected === undefined ? null : projectPolicy(selected);
}

function projectPolicy(policy: StoredAppReleasePolicy): AppReleasePolicyProjection {
  return {
    platform: policy.platform,
    minimumSupportedVersion: policy.minimumSupportedVersion,
    latestVersion: policy.latestVersion,
    minimumSupportedBuildNumber: policy.minimumSupportedBuildNumber,
    latestBuildNumber: policy.latestBuildNumber,
    enforcement: policy.enforcement,
    message: policy.message,
    downloadUrl: policy.downloadUrl,
    effectiveAt: policy.effectiveAt.toISOString(),
    expiresAt: policy.expiresAt?.toISOString() ?? null,
    policyVersion: policy.policyVersion,
  };
}
