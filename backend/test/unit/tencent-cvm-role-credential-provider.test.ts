import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { createTencentCvmRoleAwsCredentialProvider } from '../../src/common/object-storage/tencent-cvm-role-credential-provider.js';

describe('Tencent CVM role AWS credential bridge', () => {
  it('maps temporary credentials and the security token for COS requests', async () => {
    const provider = createTencentCvmRoleAwsCredentialProvider({
      getCredential: () =>
        Promise.resolve({
          secretId: 'synthetic-temporary-id',
          secretKey: 'synthetic-temporary-key',
          token: 'synthetic-security-token',
        }),
    });
    const result = await provider();
    assert.ok(result.expiration instanceof Date);
    assert.ok(result.expiration.getTime() > Date.now());
    const { expiration: _expiration, ...values } = result;
    assert.deepEqual(values, {
      accessKeyId: 'synthetic-temporary-id',
      secretAccessKey: 'synthetic-temporary-key',
      sessionToken: 'synthetic-security-token',
    });
  });

  it('a long-lived S3 client obtains rotated Tencent credentials instead of caching the first token forever', async () => {
    let token = 'synthetic-first-token';
    const credentials = createTencentCvmRoleAwsCredentialProvider({
      getCredential: async () => ({secretId:'synthetic-id',secretKey:'synthetic-key',token}),
    });
    const client = new S3Client({region:'ap-hongkong',credentials});
    try {
      const sign = () => getSignedUrl(client, new PutObjectCommand({Bucket:'synthetic-bucket',Key:'synthetic-object'}));
      assert.equal(new URL(await sign()).searchParams.get('X-Amz-Security-Token'), token);
      token = 'synthetic-rotated-token';
      assert.equal(new URL(await sign()).searchParams.get('X-Amz-Security-Token'), token);
    } finally { client.destroy(); }
  });

  it('fails closed without exposing provider details or accepting an absent token', async () => {
    const failed = createTencentCvmRoleAwsCredentialProvider({
      getCredential: () => Promise.reject(new Error('sensitive metadata response')),
    });
    await assert.rejects(
      failed(),
      (error: unknown) =>
        error instanceof Error &&
        error.message === 'Tencent CVM role credentials could not be loaded',
    );
    const incomplete = createTencentCvmRoleAwsCredentialProvider({
      getCredential: () =>
        Promise.resolve({ secretId: 'synthetic-id', secretKey: 'synthetic-key' }),
    });
    await assert.rejects(incomplete(), /credentials are incomplete/);
  });
});
