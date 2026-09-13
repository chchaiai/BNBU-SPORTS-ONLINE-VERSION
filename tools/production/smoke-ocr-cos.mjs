// Synthetic objects only; bounded to two keys, removed in finally. No credentials logged.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { loadRuntimeSecrets } from '/app/dist/common/config/file-json-secret-loader.js';
import { validateEnvironment } from '/app/dist/common/config/environment.js';
import { storageCredentials } from '/app/dist/common/object-storage/tencent-cvm-role-credential-provider.js';
const require = createRequire('/app/package.json');
const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand,
  CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } = require('@aws-sdk/client-s3');
await loadRuntimeSecrets(process.env);
const config = validateEnvironment(process.env).RUNTIME_CONFIG.objectStorage;
assert.equal(config.credentials.provider, 'TENCENT_CVM_ROLE');
assert.equal(config.bucket, 'bnbu-sports-prod-hk-1443273655');
const client = new S3Client({ endpoint: config.endpoint, region: config.region,
  forcePathStyle: config.forcePathStyle, credentials: storageCredentials(config.credentials), maxAttempts: 2 });
const Bucket = config.bucket, prefix = `v81/ocr/acceptance-20260913/${randomUUID()}`;
const keys = [`${prefix}/small.txt`, `${prefix}/multipart.bin`];
const checks = [], uploads = [];
try {
  await client.send(new PutObjectCommand({ Bucket, Key: keys[0], Body: 'synthetic-ocr-permission-probe', ContentType: 'text/plain' }));
  checks.push('PUT');
  assert.equal((await client.send(new HeadObjectCommand({ Bucket, Key: keys[0] }))).ContentLength, 30);
  checks.push('HEAD');
  assert.equal(await (await client.send(new GetObjectCommand({ Bucket, Key: keys[0] }))).Body.transformToString(), 'synthetic-ocr-permission-probe');
  checks.push('GET');
  for (const complete of [true, false]) {
    const upload = { Bucket, Key: keys[1], UploadId: (await client.send(new CreateMultipartUploadCommand({ Bucket, Key: keys[1] }))).UploadId };
    uploads.push(upload);
    if (complete) {
      const part = await client.send(new UploadPartCommand({ ...upload, PartNumber: 1, Body: Buffer.alloc(5 * 1024 * 1024, 7) }));
      await client.send(new CompleteMultipartUploadCommand({ ...upload, MultipartUpload: { Parts: [{ PartNumber: 1, ETag: part.ETag }] } }));
      checks.push('MULTIPART_COMPLETE');
    } else { await client.send(new AbortMultipartUploadCommand(upload)); checks.push('MULTIPART_ABORT'); }
    uploads.pop();
  }
} catch (error) {
  process.exitCode = 1;
  checks.push(`FAIL:${String(error.name).replace(/[^a-zA-Z0-9_]/g, '')}`);
} finally {
  for (const upload of uploads) await client.send(new AbortMultipartUploadCommand(upload)).catch(() => { process.exitCode = 1; });
  for (const Key of keys) await client.send(new DeleteObjectCommand({ Bucket, Key })).catch(() => { process.exitCode = 1; });
  if (!process.exitCode) checks.push('DELETE_CLEANUP');
  client.destroy();
  console.log(JSON.stringify({ check: 'CVM_ROLE_OCR_COS', status: process.exitCode ? 'FAIL' : 'PASS', observedAt: new Date().toISOString(), prefix, checks }));
}
