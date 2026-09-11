import CvmRoleCredentialModule from 'tencentcloud-sdk-nodejs-common/tencentcloud/common/cvm_role_credential.js';

import type { StorageCredentialConfig } from '../config/environment.js';

const { default: CvmRoleCredential } = CvmRoleCredentialModule;

interface TencentCredential {
  secretId?: string;
  secretKey?: string;
  token?: string;
}

interface DynamicCredentialPort {
  getCredential(): Promise<TencentCredential>;
}

export interface AwsStorageCredential {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  expiration?: Date;
}

export type AwsStorageCredentialProvider = () => Promise<AwsStorageCredential>;

let sharedCvmRoleProvider: AwsStorageCredentialProvider | null = null;

export function storageCredentials(
  configuration: StorageCredentialConfig,
): AwsStorageCredential | AwsStorageCredentialProvider {
  if (configuration.provider === 'STATIC') {
    return {
      accessKeyId: configuration.accessKey,
      secretAccessKey: configuration.secretKey,
    };
  }
  sharedCvmRoleProvider ??= createTencentCvmRoleAwsCredentialProvider(new CvmRoleCredential());
  return sharedCvmRoleProvider;
}

export function createTencentCvmRoleAwsCredentialProvider(
  credential: DynamicCredentialPort,
): AwsStorageCredentialProvider {
  return async () => {
    let result: TencentCredential;
    try {
      result = await credential.getCredential();
    } catch {
      throw new Error('Tencent CVM role credentials could not be loaded');
    }
    const accessKeyId = optionalText(result.secretId);
    const secretAccessKey = optionalText(result.secretKey);
    const sessionToken = optionalText(result.token);
    if (accessKeyId === null || secretAccessKey === null || sessionToken === null) {
      throw new Error('Tencent CVM role credentials are incomplete');
    }
    return {
      accessKeyId,
      secretAccessKey,
      sessionToken,
      // Tencent's SDK hides ExpiredTime but refreshes its cached role internally.
      // Without expiration Smithy classifies the result as permanent credentials
      // and never invokes this provider again. A short refresh horizon lets the
      // Tencent SDK own the real metadata cache/expiry and avoids stale signing.
      expiration: new Date(Date.now() + 60_000),
    };
  };
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
