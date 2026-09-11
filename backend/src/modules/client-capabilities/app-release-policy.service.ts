import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/database/prisma.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { Clock } from '../../common/time/clock.js';
import type { ClientPlatformQueryDto } from './client-capabilities.dto.js';
import {
  AppReleasePolicyAmbiguousError,
  CLIENT_PLATFORMS,
  evaluateIosBuildEnforcement,
  selectEffectiveAppReleasePolicy,
  type AppReleaseEnforcement,
  type AppReleasePolicyProjection,
  type ClientPlatform,
  type StoredAppReleasePolicy,
} from './app-release-policy.domain.js';

const ENFORCEMENTS = new Set<AppReleaseEnforcement>(['NONE', 'RECOMMENDED', 'REQUIRED']);

@Injectable()
export class AppReleasePolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async get(input: ClientPlatformQueryDto): Promise<AppReleasePolicyProjection> {
    const platform = this.platform(input.platform);
    const now = this.clock.now();
    const rows = await this.prisma.appReleasePolicy.findMany({
      where: {
        platform,
        effectiveAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: [{ effectiveAt: 'desc' }, { id: 'asc' }],
      take: 2,
    });
    try {
      const selected = selectEffectiveAppReleasePolicy(
        rows.map((row) => this.stored(row)),
        platform,
        now,
      );
      if (selected === null) {
        throw new ApplicationError('SYSTEM_MODE_UNSUPPORTED', 503, {
          capability: 'APP_RELEASE_POLICY',
          platform,
        });
      }
      if (platform === 'IOS') {
        if (input.currentBuildNumber === undefined) {
          throw new ApplicationError('VALIDATION_FIELD_REQUIRED', 422, {
            field: 'currentBuildNumber',
          });
        }
        if (selected.minimumSupportedBuildNumber === null || selected.latestBuildNumber === null) {
          throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
            invariant: 'APP_RELEASE_POLICY_IOS_BUILD_NUMBER_REQUIRED',
          });
        }
        selected.enforcement = evaluateIosBuildEnforcement(
          input.currentBuildNumber,
          selected.minimumSupportedBuildNumber,
          selected.latestBuildNumber,
        );
      }
      // currentVersion is a display-only marketing version. It never participates in the
      // authoritative iOS comparison, which uses the numeric build number above.
      void input.currentVersion;
      return selected;
    } catch (error: unknown) {
      if (error instanceof ApplicationError) throw error;
      if (error instanceof AppReleasePolicyAmbiguousError || error instanceof RangeError) {
        throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
          invariant: 'APP_RELEASE_POLICY_PERSISTED_STATE_INVALID',
        });
      }
      throw error;
    }
  }

  private platform(value: string): ClientPlatform {
    if ((CLIENT_PLATFORMS as readonly string[]).includes(value)) return value as ClientPlatform;
    throw new ApplicationError('VALIDATION_ENUM_UNSUPPORTED', 422);
  }

  private stored(row: {
    id: string;
    platform: string;
    minimumSupportedVersion: string;
    latestVersion: string;
    minimumSupportedBuildNumber: number | null;
    latestBuildNumber: number | null;
    enforcement: string;
    message: string | null;
    downloadUrl: string | null;
    effectiveAt: Date;
    expiresAt: Date | null;
    policyVersion: string;
  }): StoredAppReleasePolicy {
    const platform = this.platform(row.platform);
    if (!ENFORCEMENTS.has(row.enforcement as AppReleaseEnforcement)) {
      throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
        invariant: 'APP_RELEASE_POLICY_ENFORCEMENT_INVALID',
      });
    }
    const minimumSupportedVersion = this.opaqueVersion(
      row.minimumSupportedVersion,
      'minimumSupportedVersion',
    );
    const latestVersion = this.opaqueVersion(row.latestVersion, 'latestVersion');
    const policyVersion = this.opaqueVersion(row.policyVersion, 'policyVersion');
    const downloadUrl = this.secureDownloadUrl(row.downloadUrl);
    return {
      ...row,
      platform,
      enforcement: row.enforcement as AppReleaseEnforcement,
      minimumSupportedVersion,
      latestVersion,
      policyVersion,
      downloadUrl,
    };
  }

  private opaqueVersion(value: string, field: string): string {
    if (value.length < 1 || value.length > 64 || value.trim() !== value) {
      throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
        invariant: 'APP_RELEASE_POLICY_VERSION_INVALID',
        field,
      });
    }
    return value;
  }

  private secureDownloadUrl(value: string | null): string | null {
    if (value === null) return null;
    try {
      const parsed = new URL(value);
      if (
        parsed.protocol !== 'https:' ||
        parsed.username.length > 0 ||
        parsed.password.length > 0
      ) {
        throw new Error('unsafe');
      }
      return value;
    } catch {
      throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
        invariant: 'APP_RELEASE_POLICY_DOWNLOAD_URL_INVALID',
      });
    }
  }
}
