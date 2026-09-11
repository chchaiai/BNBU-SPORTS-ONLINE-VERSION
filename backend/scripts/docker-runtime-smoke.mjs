import { generateKeyPairSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rootCertificates } from 'node:tls';

const image = process.argv[2];
if (image === undefined || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/.test(image)) {
  throw new Error('A safe local Docker image reference is required');
}

const containerName = `bnbu-runtime-smoke-${process.pid}`;
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const runtimeSecret = {
  DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:1/bnbu_runtime_smoke_test',
  TOKEN_SIGNING_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  TOKEN_VERIFYING_KEY: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  IDEMPOTENCY_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  SECURITY_HASH_KEY: 'synthetic-runtime-smoke-hmac-key',
  QR_JOIN_TOKEN_HASH_KEY: Buffer.alloc(32, 11).toString('base64'),
  QR_JOIN_SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 13).toString('base64'),
  PUSH_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 17).toString('base64'),
};
const configuration = {
  APP_ENV: 'staging',
  APP_VERSION: 'docker-runtime-smoke',
  PORT: '3000',
  LOG_LEVEL: 'silent',
  RUNTIME_SECRET_PROVIDER: 'FILE_JSON',
  RUNTIME_SECRET_FILE: '/run/secrets/bnbu_runtime.json',
  TENCENTDB_CA_FILE: '/run/secrets/tencentdb-ca-chain.pem',
  TOKEN_ISSUER: 'bnbu-runtime-smoke',
  TOKEN_AUDIENCE: 'bnbu-runtime-smoke-clients',
  ACCESS_TOKEN_TTL: '60',
  REFRESH_TOKEN_ABSOLUTE_TTL: '3600',
  REFRESH_TOKEN_IDLE_TTL: '600',
  IDEMPOTENCY_RETENTION: '3600',
  IDEMPOTENCY_LEASE: '30',
  AUTH_RATE_LIMIT_WINDOW_SECONDS: '60',
  AUTH_RATE_LIMIT_MAX_ATTEMPTS: '100',
  CORS_ALLOWLIST: 'https://runtime-smoke.test',
  TRUST_PROXY: 'false',
  SYSTEM_MODE_SOURCE: 'database',
  REQUEST_BODY_LIMIT_BYTES: '2048',
  REQUEST_TIMEOUT_MS: '5000',
  COURSE_INVITE_TTL_SECONDS: '3600',
  JOIN_CAPABILITY_TTL_SECONDS: '300',
  QR_JOIN_SECRET_REPLAY_SECONDS: '3600',
  QR_JOIN_PUBLIC_RATE_LIMIT_WINDOW_SECONDS: '60',
  QR_JOIN_PUBLIC_RATE_LIMIT_MAX_REQUESTS: '100',
  PUSH_TOKEN_ENCRYPTION_KEY_VERSION: '1',
  EMAIL_DELIVERY_PROVIDER: 'TENCENT_SES',
  TENCENT_SES_REGION: 'ap-guangzhou',
  TENCENT_SES_FROM_EMAIL: 'no-reply@verityai.cn',
  TENCENT_SES_TEMPLATE_ID: '56852',
  TENCENT_SES_TEMPLATE_CODE_VARIABLE: 'code',
  STORAGE_CREDENTIAL_PROVIDER: 'TENCENT_CVM_ROLE',
  OBJECT_STORAGE_REQUIRED: 'true',
  OBJECT_STORAGE_ENDPOINT: 'https://cos.ap-guangzhou.myqcloud.com',
  OBJECT_STORAGE_REGION: 'ap-guangzhou',
  OBJECT_STORAGE_BUCKET: 'synthetic-runtime-smoke-private',
  OBJECT_STORAGE_FORCE_PATH_STYLE: 'false',
  MEDIA_STORAGE_REQUIRED: 'true',
  MEDIA_STORAGE_ENDPOINT: 'https://cos.ap-guangzhou.myqcloud.com',
  MEDIA_STORAGE_REGION: 'ap-guangzhou',
  MEDIA_STORAGE_BUCKET: 'synthetic-runtime-smoke-private',
  MEDIA_STORAGE_FORCE_PATH_STYLE: 'false',
  MEDIA_UPLOAD_URL_TTL_SECONDS: '300',
  MEDIA_ACCESS_URL_TTL_SECONDS: '300',
  MEDIA_MAX_IMAGE_BYTES: '10485760',
  MEDIA_MAX_IMAGE_PIXELS: '40000000',
  MEDIA_MAX_VIDEO_TRANSPORT_BYTES: '536870912',
  MEDIA_SCANNER_MODE: 'TEST_SIGNATURE',
  MEDIA_WORKER_ENABLED: 'false',
  MEDIA_WORKER_POLL_MS: '500',
};

let started = false;
const secretDirectory = mkdtempSync(join(tmpdir(), 'bnbu-runtime-smoke-'));
const secretPath = join(secretDirectory, 'bnbu_runtime.json');
const caPath = join(secretDirectory, 'tencentdb-ca-chain.pem');
writeFileSync(secretPath, JSON.stringify(runtimeSecret), { encoding: 'utf8', mode: 0o444 });
writeFileSync(caPath, `${rootCertificates[0]}\n${rootCertificates[1]}\n`, {
  encoding: 'utf8',
  mode: 0o444,
});
try {
  const runArguments = [
    'run',
    '--detach',
    '--rm',
    '--name',
    containerName,
    '--publish',
    '127.0.0.1::3000',
    '--mount',
    `type=bind,source=${secretPath},target=/run/secrets/bnbu_runtime.json,readonly`,
    '--mount',
    `type=bind,source=${caPath},target=/run/secrets/tencentdb-ca-chain.pem,readonly`,
  ];
  for (const [name, value] of Object.entries(configuration)) {
    runArguments.push('--env', `${name}=${value}`);
  }
  runArguments.push(image);
  executeDocker(runArguments);
  started = true;

  const portOutput = executeDocker(['port', containerName, '3000/tcp']).trim();
  const portMatch = /:(\d+)$/u.exec(portOutput);
  if (portMatch === null) throw new Error('Docker did not publish a local smoke-test port');

  const deadline = Date.now() + 30_000;
  let response;
  while (Date.now() < deadline) {
    try {
      response = await fetch(`http://127.0.0.1:${portMatch[1]}/api/v1/health/live`);
      if (response.status === 200) break;
    } catch {
      // The container may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (response?.status !== 200) throw new Error('Backend liveness did not reach HTTP 200');

  const uid = executeDocker(['exec', containerName, 'id', '-u']).trim();
  if (uid !== '10001') throw new Error(`Backend runtime user must be UID 10001, got ${uid}`);
  const inspection = JSON.parse(executeDocker(['inspect', containerName]));
  const containerEnvironment = inspection[0]?.Config?.Env ?? [];
  for (const name of Object.keys(runtimeSecret)) {
    if (containerEnvironment.some((entry) => entry.startsWith(`${name}=`))) {
      throw new Error(
        `Runtime secret must not be exposed as a container environment value: ${name}`,
      );
    }
  }
  process.stdout.write(
    'Docker runtime smoke: PASS (live=200, uid=10001, fileSecret=mounted, database=not-contacted)\n',
  );
} finally {
  if (started)
    spawnSync('docker', ['stop', containerName], { encoding: 'utf8', windowsHide: true });
  rmSync(secretDirectory, { recursive: true, force: true });
}

function executeDocker(arguments_) {
  const result = spawnSync('docker', arguments_, { encoding: 'utf8', windowsHide: true });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Docker command failed with status ${result.status ?? 'unknown'}`);
  }
  return result.stdout;
}
