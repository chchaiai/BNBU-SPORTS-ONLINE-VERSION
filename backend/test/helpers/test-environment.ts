import { generateKeyPairSync } from 'node:crypto';

export const TEST_PASSWORD = 'Synthetic-Test-Password-Only-2026';
export const TEST_DATABASE_RESET_CONFIRMATION = 'BNBU_SPORTS_EPHEMERAL_TEST_DATABASE_V1';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
export const TEST_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
export const TEST_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString();

export function requireTestDatabaseUrl(environment: NodeJS.ProcessEnv = process.env): string {
  if (environment.TEST_DATABASE_RESET_CONFIRMATION !== TEST_DATABASE_RESET_CONFIRMATION) {
    throw new Error(
      'TEST_DATABASE_RESET_CONFIRMATION must explicitly confirm the ephemeral test database',
    );
  }
  const value = environment.TEST_DATABASE_URL?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error('TEST_DATABASE_URL is required for real PostgreSQL tests');
  }
  const url = new URL(value);
  const queryKeys = [...url.searchParams.keys()];
  if (
    (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    !['5432', '55432'].includes(url.port === '' ? '5432' : url.port) ||
    decodeURIComponent(url.username) !== 'bnbu_test' ||
    decodeURIComponent(url.password).length === 0 ||
    url.pathname !== '/bnbu_sports_test' ||
    url.searchParams.get('schema') !== 'public' ||
    queryKeys.some((name) => name !== 'schema')
  ) {
    throw new Error(
      'TEST_DATABASE_URL must identify the dedicated loopback bnbu_sports_test database',
    );
  }
  return value;
}

export function foundationEnvironment(databaseUrl: string, port: number): NodeJS.ProcessEnv {
  return {
    ...process.env,
    APP_ENV: 'test',
    APP_VERSION: 'test-suite',
    PORT: String(port),
    LOG_LEVEL: 'silent',
    DATABASE_URL: databaseUrl,
    MIGRATION_DATABASE_URL: databaseUrl,
    TOKEN_ISSUER: 'bnbu-sports-test',
    TOKEN_AUDIENCE: 'bnbu-sports-test-clients',
    TOKEN_SIGNING_KEY: TEST_PRIVATE_KEY,
    TOKEN_VERIFYING_KEY: TEST_PUBLIC_KEY,
    ACCESS_TOKEN_TTL: '60',
    REFRESH_TOKEN_ABSOLUTE_TTL: '3600',
    REFRESH_TOKEN_IDLE_TTL: '600',
    IDEMPOTENCY_RETENTION: '3600',
    IDEMPOTENCY_LEASE: '30',
    IDEMPOTENCY_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    SECURITY_HASH_KEY: 'synthetic-test-hmac-key-never-use-in-production',
    AUTH_RATE_LIMIT_WINDOW_SECONDS: '60',
    AUTH_RATE_LIMIT_MAX_ATTEMPTS: '100',
    CORS_ALLOWLIST: 'http://allowed.test',
    TRUST_PROXY: 'false',
    SYSTEM_MODE_SOURCE: 'database',
    REQUEST_BODY_LIMIT_BYTES: '2048',
    REQUEST_TIMEOUT_MS: '5000',
    COURSE_INVITE_TTL_SECONDS: '3600',
    JOIN_CAPABILITY_TTL_SECONDS: '300',
    QR_JOIN_TOKEN_HASH_KEY: Buffer.alloc(32, 11).toString('base64'),
    QR_JOIN_SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 13).toString('base64'),
    QR_JOIN_SECRET_REPLAY_SECONDS: '3600',
    QR_JOIN_PUBLIC_RATE_LIMIT_WINDOW_SECONDS: '60',
    QR_JOIN_PUBLIC_RATE_LIMIT_MAX_REQUESTS: '100',
    PUSH_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 17).toString('base64'),
    PUSH_TOKEN_ENCRYPTION_KEY_VERSION: '1',
    MEDIA_STORAGE_REQUIRED: 'true',
    MEDIA_STORAGE_ENDPOINT: 'http://media-storage.test:9000',
    MEDIA_STORAGE_REGION: 'us-east-1',
    MEDIA_STORAGE_BUCKET: 'synthetic-media-private',
    MEDIA_STORAGE_ACCESS_KEY: 'synthetic-media-access',
    MEDIA_STORAGE_SECRET_KEY: 'synthetic-media-secret-never-production',
    MEDIA_STORAGE_FORCE_PATH_STYLE: 'true',
    MEDIA_UPLOAD_URL_TTL_SECONDS: '300',
    MEDIA_ACCESS_URL_TTL_SECONDS: '300',
    MEDIA_MAX_IMAGE_BYTES: '10485760',
    MEDIA_MAX_IMAGE_PIXELS: '40000000',
    MEDIA_MAX_VIDEO_TRANSPORT_BYTES: '536870912',
    MEDIA_SCANNER_MODE: 'TEST_SIGNATURE',
    MEDIA_WORKER_ENABLED: 'false',
    MEDIA_WORKER_POLL_MS: '500',
  };
}
