import { spawn } from 'node:child_process';
import { mkdirSync, appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { foundationEnvironment } from '../../backend/test/helpers/test-environment.ts';
import pg from '../../backend/node_modules/pg/lib/index.js';
import { createRequire } from 'node:module';
import { probeAccounts } from './v81-account-api-probe.mjs';

const database = new URL('postgresql://sql-postgres:5432/v81_runtime_test');
database.username = process.env.PGUSER;
database.password = process.env.PGPASSWORD;
const bootstrap = new pg.Client({ host: 'sql-postgres', database: 'v81_sql_probe',
  user: process.env.PGUSER, password: process.env.PGPASSWORD });
await bootstrap.connect();
try {
  const existing = await bootstrap.query("SELECT 1 FROM pg_database WHERE datname='v81_runtime_test'");
  if (existing.rowCount === 0) await bootstrap.query('CREATE DATABASE v81_runtime_test');
} finally { await bootstrap.end(); }
const environment = foundationEnvironment(database.href, 3199);
environment.REQUEST_BODY_LIMIT_BYTES = '2097152';
if (process.env.V81_RUNTIME_LOG_SOURCE === '1') {
  environment.RUNTIME_LOG_DIRECTORY = '/tmp/v81-runtime-source-' + randomUUID();
  environment.LOG_LEVEL = 'info';
  mkdirSync(environment.RUNTIME_LOG_DIRECTORY, { recursive: true, mode: 0o700 });
}
if (process.env.V81_OCR_JOBS === '1') {
  environment.OCR_PROVIDER = 'TENCENT_TABLE_V3';
  environment.OCR_TENCENT_REGION = 'ap-guangzhou';
  environment.OCR_WORKER_ENABLED = 'false';
}
Object.assign(environment, { EMAIL_DELIVERY_PROVIDER: 'SMTP', EMAIL_DELIVERY_REQUIRED: 'true',
  SMTP_HOST: 'mailpit', SMTP_PORT: '1025', SMTP_SECURE: 'false', SMTP_FROM_ADDRESS: 'test@bnbu.invalid' });
const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const { S3Client, CreateBucketCommand, HeadBucketCommand, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
environment.MEDIA_STORAGE_ENDPOINT = 'http://media-minio:9000';
environment.MEDIA_STORAGE_ACCESS_KEY = 'v81-local-media';
environment.MEDIA_STORAGE_SECRET_KEY = process.env.PGPASSWORD;
environment.MEDIA_WORKER_ENABLED = 'true';
Object.assign(environment, { OBJECT_STORAGE_ENDPOINT: environment.MEDIA_STORAGE_ENDPOINT,
  OBJECT_STORAGE_REGION: 'us-east-1', OBJECT_STORAGE_BUCKET: environment.MEDIA_STORAGE_BUCKET,
  OBJECT_STORAGE_FORCE_PATH_STYLE: 'true', OBJECT_STORAGE_ACCESS_KEY: environment.MEDIA_STORAGE_ACCESS_KEY,
  OBJECT_STORAGE_SECRET_KEY: environment.MEDIA_STORAGE_SECRET_KEY });
const storage = new S3Client({ endpoint: environment.MEDIA_STORAGE_ENDPOINT, region: 'us-east-1',
  forcePathStyle: true, credentials: { accessKeyId: environment.MEDIA_STORAGE_ACCESS_KEY,
    secretAccessKey: environment.MEDIA_STORAGE_SECRET_KEY } });
try {
  try { await storage.send(new HeadBucketCommand({ Bucket: environment.MEDIA_STORAGE_BUCKET })); }
  catch (error) {
    if (error.$metadata?.httpStatusCode !== 404) throw error;
    await storage.send(new CreateBucketCommand({ Bucket: environment.MEDIA_STORAGE_BUCKET }));
  }
  const key = 'probe/storage-roundtrip.txt';
  const body = 'Synthetic local storage roundtrip';
  await storage.send(new PutObjectCommand({ Bucket: environment.MEDIA_STORAGE_BUCKET, Key: key, Body: body }));
  const stored = await storage.send(new GetObjectCommand({ Bucket: environment.MEDIA_STORAGE_BUCKET, Key: key }));
  if (await stored.Body.transformToString() !== body) throw new Error('Object storage readback differs');
  console.log(JSON.stringify({ check: 'LOCAL_OBJECT_STORAGE_ROUNDTRIP', result: 'PASS' }));
} finally { storage.destroy(); }
if(process.env.V81_RESOLVE_FAILED_SETTLEMENT==='1') {
  const {resolveFailedSettlementProbeMigration}=await import('./resolve-v81-settlement-probe-migration.mjs');
  await resolveFailedSettlementProbeMigration(database.href,environment);
}
const migration = spawn(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
  { env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
for (const stream of [migration.stdout, migration.stderr]) stream.on('data', chunk =>
  process.stdout.write(chunk.toString().replaceAll(database.href, '[LOCAL_DATABASE_URL]')));
const migrationExit = await new Promise((resolve, reject) => {
  migration.once('error', reject);
  migration.once('exit', resolve);
});
if (migrationExit !== 0) throw new Error('Prisma migrate deploy failed');
// Synthetic local credentials only. This probe does not claim object storage or business acceptance.
const child = spawn(process.execPath, ['dist/main.js'], { env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
  output = (output + chunk).slice(-16000);
  if (environment.RUNTIME_LOG_DIRECTORY && stream === child.stdout)
    appendFileSync(environment.RUNTIME_LOG_DIRECTORY + '/server.ndjson', chunk, { mode: 0o600 });
});
let terminal = false;
child.once('exit', () => { terminal = true; });
try {
  let live;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (terminal) throw new Error('Application exited before liveness');
    try { live = await fetch('http://127.0.0.1:3199/api/v1/health/live', { signal: AbortSignal.timeout(1000) }); } catch {}
    if (live?.status === 200) break;
    await delay(500);
  }
  if (live?.status !== 200) throw new Error('Liveness did not become available');
  const ready = await fetch('http://127.0.0.1:3199/api/v1/health/ready');
  console.log(JSON.stringify({ live: live.status, ready: ready.status, businessValidated: false }));
  if (ready.status !== 200) process.exitCode = 1;
  else await probeAccounts(database.href, 'http://127.0.0.1:3199/api/v1', {
    endpoint: environment.MEDIA_STORAGE_ENDPOINT, bucket: environment.MEDIA_STORAGE_BUCKET,
    runtimeLogDirectory: environment.RUNTIME_LOG_DIRECTORY,
    accessKeyId: environment.MEDIA_STORAGE_ACCESS_KEY, secretAccessKey: environment.MEDIA_STORAGE_SECRET_KEY });
} catch (error) {
  console.error(error.message);
  console.error(output.replaceAll(database.href, '[LOCAL_DATABASE_URL]'));
  process.exitCode = 1;
} finally {
  if (!terminal) {
    child.kill('SIGTERM');
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(3000)]);
    if (!terminal) child.kill('SIGKILL');
  }
}
