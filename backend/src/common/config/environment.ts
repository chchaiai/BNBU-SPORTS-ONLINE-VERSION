import { ocrConfiguration, type OcrConfiguration } from '../../modules/v8/tencent-ocr-provider.js';
import { aiReviewConfiguration, type AiReviewConfiguration } from '../../modules/v8/tencent-ai-review-provider.js';
export const APP_ENVIRONMENTS = ['local', 'test', 'development', 'staging', 'production'] as const;

export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];
export type LogLevel = 'silent' | 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

export type StorageCredentialConfig =
  { provider: 'STATIC'; accessKey: string; secretKey: string } | { provider: 'TENCENT_CVM_ROLE' };

export interface ObjectStorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  credentials: StorageCredentialConfig;
  forcePathStyle: boolean;
}

export interface MediaConfig {
  storage: ObjectStorageConfig;
  publicEndpoint?: string | null;
  uploadUrlTtlSeconds: number;
  accessUrlTtlSeconds: number;
  maxImageBytes: number;
  maxImagePixels: number;
  maxVideoTransportBytes: number;
  scannerMode: 'TEST_SIGNATURE' | 'EXTERNAL_REQUIRED';
  scannerHost?: string;
  scannerPort?: number;
  workerEnabled: boolean;
  workerPollMs: number;
}

export interface PushConfig {
  registrationTokenEncryptionKey: Buffer;
  encryptionKeyVersion: number;
}

export interface SmtpEmailDeliveryConfig {
  provider: 'SMTP';
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  password: string | null;
  fromAddress: string;
}

export interface TencentSesEmailDeliveryConfig {
  provider: 'TENCENT_SES';
  region: string;
  fromAddress: string;
  replyToAddress: string | null;
  templateId: number;
  templateVariables: {
    code: string;
    expiryMinutes: string | null;
    purpose: string | null;
  };
}

export interface AokSendEmailDeliveryConfig {
  provider: 'AOKSEND';
  appKey: string;
  templateId: string;
  timeoutMs: number;
  fallback: TencentSesEmailDeliveryConfig;
}

export type EmailDeliveryConfig =
  | SmtpEmailDeliveryConfig
  | TencentSesEmailDeliveryConfig
  | AokSendEmailDeliveryConfig;

export interface RuntimeConfig {
  runtimeLogDirectory?: string | null;
  ocr?: OcrConfiguration;
  aiReview?: AiReviewConfiguration;
  appEnvironment: AppEnvironment;
  appVersion: string;
  port: number;
  logLevel: LogLevel;
  databaseUrl: string;
  tencentDbCaFile: string | null;
  tokenIssuer: string;
  tokenAudience: string;
  tokenSigningKey: string;
  tokenVerifyingKey: string;
  accessTokenTtlSeconds: number;
  refreshTokenAbsoluteTtlSeconds: number;
  refreshTokenIdleTtlSeconds: number;
  idempotencyRetentionSeconds: number;
  idempotencyLeaseSeconds: number;
  idempotencyEncryptionKey: Buffer;
  securityHashKey: string;
  authRateLimitWindowSeconds: number;
  authRateLimitMaxAttempts: number;
  corsAllowlist: ReadonlySet<string>;
  trustProxy: boolean;
  systemModeSource: 'database';
  publicOrganizationCode?: string | undefined;
  requestBodyLimitBytes: number;
  requestTimeoutMs: number;
  courseInviteTtlSeconds: number;
  joinCapabilityTtlSeconds: number;
  qrJoinTokenHashKey: Buffer;
  qrJoinSecretEncryptionKey: Buffer;
  qrJoinSecretReplaySeconds: number;
  qrJoinPublicRateLimitWindowSeconds: number;
  qrJoinPublicRateLimitMaxRequests: number;
  objectStorage: ObjectStorageConfig | null;
  media: MediaConfig | null;
  push: PushConfig | null;
  emailDelivery: EmailDeliveryConfig | null;
}

function required(raw: Record<string, unknown>, name: string): string {
  const value = raw[name];
  if (typeof value !== 'string' || value.trim().length === 0 || value.includes('CHANGE_ME')) {
    throw new Error(`${name} must be explicitly configured and cannot contain a placeholder`);
  }
  return value.trim();
}

function integer(
  raw: Record<string, unknown>,
  name: string,
  options: { minimum: number; maximum?: number },
): number {
  const text = required(raw, name);
  if (!/^[0-9]+$/.test(text)) throw new Error(`${name} must be an integer`);
  const value = Number.parseInt(text, 10);
  if (!Number.isSafeInteger(value) || value < options.minimum) {
    throw new Error(`${name} must be at least ${options.minimum}`);
  }
  if (options.maximum !== undefined && value > options.maximum) {
    throw new Error(`${name} must be at most ${options.maximum}`);
  }
  return value;
}

function postgresUrl(raw: Record<string, unknown>): string {
  const value = required(raw, 'DATABASE_URL');
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('DATABASE_URL must use the postgresql protocol');
  }
  return value;
}

function tencentDbCaFile(
  raw: Record<string, unknown>,
  appEnvironment: AppEnvironment,
): string | null {
  const value = optionalText(raw.TENCENTDB_CA_FILE);
  if (value === null) {
    if (appEnvironment === 'staging' || appEnvironment === 'production') {
      throw new Error('TENCENTDB_CA_FILE is required in staging and production');
    }
    return null;
  }
  if (!/^(?:[A-Za-z]:[\\/]|\/)/u.test(value) || value.includes('CHANGE_ME')) {
    throw new Error('TENCENTDB_CA_FILE must be an explicitly configured absolute path');
  }
  return value;
}

function pem(raw: Record<string, unknown>, name: string, marker: string): string {
  const value = required(raw, name).replaceAll('\\n', '\n');
  if (!value.includes(`-----BEGIN ${marker}-----`) || !value.includes(`-----END ${marker}-----`)) {
    throw new Error(`${name} must be a PEM-encoded ${marker.toLowerCase()}`);
  }
  return value;
}

function base64Key(raw: Record<string, unknown>, name: string): Buffer {
  const value = required(raw, name);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error(`${name} must be standard base64`);
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== 32) {
    throw new Error(`${name} must decode to exactly 32 bytes`);
  }
  return decoded;
}

function allowlist(
  raw: Record<string, unknown>,
  appEnvironment: AppEnvironment,
): ReadonlySet<string> {
  const values = required(raw, 'CORS_ALLOWLIST')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (values.length === 0) throw new Error('CORS_ALLOWLIST must contain at least one origin');

  for (const value of values) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error(`CORS_ALLOWLIST contains an invalid origin: ${value}`);
    }
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.origin !== value) {
      throw new Error(`CORS_ALLOWLIST entries must be exact HTTP(S) origins: ${value}`);
    }
    if (
      (appEnvironment === 'staging' || appEnvironment === 'production') &&
      url.protocol !== 'https:'
    ) {
      throw new Error('CORS_ALLOWLIST entries must use HTTPS in staging and production');
    }
  }

  return new Set(values);
}

function optionalBoolean(
  raw: Record<string, unknown>,
  name: string,
  defaultValue: boolean,
): boolean {
  const value = raw[name];
  if (value === undefined || value === null || value === '') return defaultValue;
  if (value !== 'true' && value !== 'false') throw new Error(`${name} must be true or false`);
  return value === 'true';
}

function objectStorage(
  raw: Record<string, unknown>,
  appEnvironment: AppEnvironment,
): ObjectStorageConfig | null {
  const baseNames = [
    'OBJECT_STORAGE_ENDPOINT',
    'OBJECT_STORAGE_REGION',
    'OBJECT_STORAGE_BUCKET',
    'OBJECT_STORAGE_FORCE_PATH_STYLE',
  ] as const;
  const requiredForEnvironment =
    appEnvironment === 'production' || optionalBoolean(raw, 'OBJECT_STORAGE_REQUIRED', false);
  const basePresentCount = baseNames.filter((name) => {
    const value = raw[name];
    return typeof value === 'string' && value.trim().length > 0;
  }).length;

  if (basePresentCount === 0 && !requiredForEnvironment) return null;
  if (basePresentCount !== baseNames.length) {
    throw new Error('Object storage configuration must be either complete or omitted');
  }

  const endpointText = required(raw, 'OBJECT_STORAGE_ENDPOINT');
  let endpoint: URL;
  try {
    endpoint = new URL(endpointText);
  } catch {
    throw new Error('OBJECT_STORAGE_ENDPOINT must be a valid HTTP(S) URL');
  }
  if (
    (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') ||
    endpoint.username.length > 0 ||
    endpoint.password.length > 0 ||
    endpoint.search.length > 0 ||
    endpoint.hash.length > 0
  ) {
    throw new Error('OBJECT_STORAGE_ENDPOINT must be an HTTP(S) URL without credentials or query');
  }

  const bucket = required(raw, 'OBJECT_STORAGE_BUCKET');
  if (
    bucket.length < 3 ||
    bucket.length > 63 ||
    !/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(bucket) ||
    bucket.includes('..') ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(bucket)
  ) {
    throw new Error('OBJECT_STORAGE_BUCKET must be a valid DNS-compatible bucket name');
  }

  const provider = optionalText(raw.STORAGE_CREDENTIAL_PROVIDER) ?? 'STATIC';
  let credentials: StorageCredentialConfig;
  if (provider === 'STATIC') {
    if (appEnvironment === 'staging' || appEnvironment === 'production') {
      throw new Error(
        'STORAGE_CREDENTIAL_PROVIDER must be TENCENT_CVM_ROLE for staging and production',
      );
    }
    const accessKey = required(raw, 'OBJECT_STORAGE_ACCESS_KEY');
    const secretKey = required(raw, 'OBJECT_STORAGE_SECRET_KEY');
    if (accessKey.length < 3 || secretKey.length < 16) {
      throw new Error(
        'Object storage credentials do not meet the minimum local-validation strength',
      );
    }
    credentials = { provider, accessKey, secretKey };
  } else if (provider === 'TENCENT_CVM_ROLE') {
    if (
      optionalText(raw.OBJECT_STORAGE_ACCESS_KEY) !== null ||
      optionalText(raw.OBJECT_STORAGE_SECRET_KEY) !== null
    ) {
      throw new Error(
        'Static object storage credentials must be omitted when using TENCENT_CVM_ROLE',
      );
    }
    credentials = { provider };
  } else {
    throw new Error('STORAGE_CREDENTIAL_PROVIDER must be STATIC or TENCENT_CVM_ROLE');
  }

  return {
    endpoint: endpoint.origin + endpoint.pathname.replace(/\/$/, ''),
    region: required(raw, 'OBJECT_STORAGE_REGION'),
    bucket,
    credentials,
    forcePathStyle: optionalBoolean(raw, 'OBJECT_STORAGE_FORCE_PATH_STYLE', true),
  };
}

function mediaConfiguration(
  raw: Record<string, unknown>,
  appEnvironment: AppEnvironment,
): MediaConfig | null {
  const storageNames = [
    'MEDIA_STORAGE_ENDPOINT',
    'MEDIA_STORAGE_REGION',
    'MEDIA_STORAGE_BUCKET',
    'MEDIA_STORAGE_FORCE_PATH_STYLE',
  ] as const;
  const settingNames = [
    'MEDIA_UPLOAD_URL_TTL_SECONDS',
    'MEDIA_ACCESS_URL_TTL_SECONDS',
    'MEDIA_MAX_IMAGE_BYTES',
    'MEDIA_MAX_IMAGE_PIXELS',
    'MEDIA_MAX_VIDEO_TRANSPORT_BYTES',
    'MEDIA_SCANNER_MODE',
    'MEDIA_WORKER_ENABLED',
    'MEDIA_WORKER_POLL_MS',
  ] as const;
  const requiredForEnvironment =
    appEnvironment === 'production' || optionalBoolean(raw, 'MEDIA_STORAGE_REQUIRED', false);
  const names = [...storageNames, ...settingNames] as const;
  const allNames = [...names, 'MEDIA_STORAGE_ACCESS_KEY', 'MEDIA_STORAGE_SECRET_KEY', 'MEDIA_STORAGE_PUBLIC_ENDPOINT'] as const;
  const anyPresent = allNames.some((name) => {
    const value = raw[name];
    return typeof value === 'string' && value.trim().length > 0;
  });
  const basePresentCount = names.filter((name) => {
    const value = raw[name];
    return typeof value === 'string' && value.trim().length > 0;
  }).length;
  if (!anyPresent && !requiredForEnvironment) return null;
  if (basePresentCount !== names.length) {
    throw new Error('Media configuration must be either complete or omitted');
  }

  const storageRaw: Record<string, unknown> = {
    OBJECT_STORAGE_ENDPOINT: raw.MEDIA_STORAGE_ENDPOINT,
    OBJECT_STORAGE_REGION: raw.MEDIA_STORAGE_REGION,
    OBJECT_STORAGE_BUCKET: raw.MEDIA_STORAGE_BUCKET,
    OBJECT_STORAGE_ACCESS_KEY: raw.MEDIA_STORAGE_ACCESS_KEY,
    OBJECT_STORAGE_SECRET_KEY: raw.MEDIA_STORAGE_SECRET_KEY,
    OBJECT_STORAGE_FORCE_PATH_STYLE: raw.MEDIA_STORAGE_FORCE_PATH_STYLE,
    OBJECT_STORAGE_REQUIRED: 'true',
    STORAGE_CREDENTIAL_PROVIDER: raw.STORAGE_CREDENTIAL_PROVIDER,
  };
  const storage = objectStorage(storageRaw, appEnvironment);
  if (storage === null) throw new Error('Media object storage configuration is required');
  const publicEndpointText = optionalText(raw.MEDIA_STORAGE_PUBLIC_ENDPOINT);
  const publicEndpoint = publicEndpointText === null ? null : objectStorage({ ...storageRaw,
    OBJECT_STORAGE_ENDPOINT: publicEndpointText }, appEnvironment)!.endpoint;

  const scannerMode = required(raw, 'MEDIA_SCANNER_MODE');
  if (scannerMode !== 'TEST_SIGNATURE' && scannerMode !== 'EXTERNAL_REQUIRED') {
    throw new Error('MEDIA_SCANNER_MODE must be TEST_SIGNATURE or EXTERNAL_REQUIRED');
  }
  if (appEnvironment === 'production' && scannerMode === 'TEST_SIGNATURE') {
    throw new Error('MEDIA_SCANNER_MODE cannot use the local test scanner in production');
  }

  return {
    storage,
    publicEndpoint,
    uploadUrlTtlSeconds: integer(raw, 'MEDIA_UPLOAD_URL_TTL_SECONDS', {
      minimum: 30,
      maximum: 3600,
    }),
    accessUrlTtlSeconds: integer(raw, 'MEDIA_ACCESS_URL_TTL_SECONDS', {
      minimum: 30,
      maximum: 3600,
    }),
    maxImageBytes: integer(raw, 'MEDIA_MAX_IMAGE_BYTES', { minimum: 1024 }),
    maxImagePixels: integer(raw, 'MEDIA_MAX_IMAGE_PIXELS', { minimum: 1 }),
    maxVideoTransportBytes: integer(raw, 'MEDIA_MAX_VIDEO_TRANSPORT_BYTES', {
      minimum: 1024,
      maximum: Number.MAX_SAFE_INTEGER,
    }),
    scannerMode,
    ...(scannerMode === 'EXTERNAL_REQUIRED' ? {
      scannerHost: required(raw, 'MEDIA_SCANNER_HOST'),
      scannerPort: raw.MEDIA_SCANNER_PORT === undefined ? 3310 : integer(raw, 'MEDIA_SCANNER_PORT', { minimum: 1, maximum: 65535 }),
    } : {}),
    workerEnabled: optionalBoolean(raw, 'MEDIA_WORKER_ENABLED', false),
    workerPollMs: integer(raw, 'MEDIA_WORKER_POLL_MS', { minimum: 100, maximum: 60_000 }),
  };
}

function pushConfiguration(raw: Record<string, unknown>): PushConfig | null {
  const names = ['PUSH_TOKEN_ENCRYPTION_KEY', 'PUSH_TOKEN_ENCRYPTION_KEY_VERSION'] as const;
  const presentCount = names.filter((name) => {
    const value = raw[name];
    return typeof value === 'string' && value.trim().length > 0;
  }).length;
  if (presentCount === 0) return null;
  if (presentCount !== names.length) {
    throw new Error('Push token encryption configuration must be either complete or omitted');
  }
  return {
    registrationTokenEncryptionKey: base64Key(raw, 'PUSH_TOKEN_ENCRYPTION_KEY'),
    encryptionKeyVersion: integer(raw, 'PUSH_TOKEN_ENCRYPTION_KEY_VERSION', {
      minimum: 1,
    }),
  };
}

function emailDeliveryConfiguration(
  raw: Record<string, unknown>,
  appEnvironment: AppEnvironment,
): EmailDeliveryConfig | null {
  const configuredProvider = optionalText(raw.EMAIL_DELIVERY_PROVIDER);
  const coreNames = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_FROM_ADDRESS'] as const;
  const requiredForEnvironment =
    appEnvironment === 'staging' ||
    appEnvironment === 'production' ||
    optionalBoolean(raw, 'EMAIL_DELIVERY_REQUIRED', false);
  const smtpPresentCount = coreNames.filter((name) => {
    const value = raw[name];
    return typeof value === 'string' && value.trim().length > 0;
  }).length;
  const provider = configuredProvider ?? (smtpPresentCount > 0 ? 'SMTP' : null);
  if (provider === null && !requiredForEnvironment) return null;
  if (provider === null) {
    throw new Error('EMAIL_DELIVERY_PROVIDER is required outside local and test environments');
  }
  if (provider === 'TENCENT_SES') return tencentSesEmailDeliveryConfiguration(raw);
  if (provider === 'AOKSEND') {
    return {
      provider: 'AOKSEND',
      appKey: required(raw, 'AOKSEND_APP_KEY'),
      templateId: required(raw, 'AOKSEND_TEMPLATE_ID'),
      timeoutMs: integer({ ...raw, AOKSEND_TIMEOUT_MS: raw.AOKSEND_TIMEOUT_MS ?? '5000' }, 'AOKSEND_TIMEOUT_MS', {
        minimum: 1000,
        maximum: 10000,
      }),
      fallback: tencentSesEmailDeliveryConfiguration(raw),
    };
  }
  if (provider !== 'SMTP') {
    throw new Error('EMAIL_DELIVERY_PROVIDER must be SMTP, TENCENT_SES or AOKSEND');
  }
  if (smtpPresentCount !== coreNames.length) {
    throw new Error('SMTP email delivery configuration must be either complete or omitted');
  }
  const rawUsername = raw.SMTP_USERNAME;
  const rawPassword = raw.SMTP_PASSWORD;
  const username =
    typeof rawUsername === 'string' && rawUsername.trim().length > 0
      ? required(raw, 'SMTP_USERNAME')
      : null;
  const password =
    typeof rawPassword === 'string' && rawPassword.trim().length > 0
      ? required(raw, 'SMTP_PASSWORD')
      : null;
  if ((username === null) !== (password === null)) {
    throw new Error('SMTP_USERNAME and SMTP_PASSWORD must be configured together');
  }
  if ((appEnvironment === 'staging' || appEnvironment === 'production') && username === null) {
    throw new Error('SMTP credentials are required outside local and test environments');
  }
  const fromAddress = required(raw, 'SMTP_FROM_ADDRESS').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromAddress)) {
    throw new Error('SMTP_FROM_ADDRESS must be a valid email address');
  }
  return {
    provider: 'SMTP',
    host: required(raw, 'SMTP_HOST'),
    port: integer(raw, 'SMTP_PORT', { minimum: 1, maximum: 65_535 }),
    secure: optionalBoolean(raw, 'SMTP_SECURE', true),
    username,
    password,
    fromAddress,
  };
}

function tencentSesEmailDeliveryConfiguration(
  raw: Record<string, unknown>,
): TencentSesEmailDeliveryConfig {
  const fromAddress = required(raw, 'TENCENT_SES_FROM_EMAIL');
  if (!validEmailAddress(fromAddress)) {
    throw new Error('TENCENT_SES_FROM_EMAIL must contain a valid email address');
  }
  const rawReplyToAddress = optionalText(raw.TENCENT_SES_REPLY_TO);
  if (rawReplyToAddress !== null && !validEmailAddress(rawReplyToAddress)) {
    throw new Error('TENCENT_SES_REPLY_TO must be a valid email address');
  }
  const codeVariable = templateVariable(raw, 'TENCENT_SES_TEMPLATE_CODE_VARIABLE', true);
  if (codeVariable === null) {
    throw new Error('TENCENT_SES_TEMPLATE_CODE_VARIABLE is required');
  }
  const templateVariables = {
    code: codeVariable,
    expiryMinutes: templateVariable(raw, 'TENCENT_SES_TEMPLATE_EXPIRY_MINUTES_VARIABLE', false),
    purpose: templateVariable(raw, 'TENCENT_SES_TEMPLATE_PURPOSE_VARIABLE', false),
  };
  const configuredVariableNames = Object.values(templateVariables).filter(
    (value): value is string => value !== null,
  );
  if (new Set(configuredVariableNames).size !== configuredVariableNames.length) {
    throw new Error('Tencent SES template variable names must be unique');
  }
  return {
    provider: 'TENCENT_SES',
    region: required(raw, 'TENCENT_SES_REGION'),
    fromAddress,
    replyToAddress: rawReplyToAddress,
    templateId: integer(raw, 'TENCENT_SES_TEMPLATE_ID', { minimum: 1 }),
    templateVariables,
  };
}

function templateVariable(
  raw: Record<string, unknown>,
  name: string,
  isRequired: boolean,
): string | null {
  const value = isRequired ? required(raw, name) : optionalText(raw[name]);
  if (value === null) return null;
  if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value)) {
    throw new Error(`${name} must be a safe Tencent SES template variable name`);
  }
  return value;
}

function validEmailAddress(value: string): boolean {
  const match = /^(?:[^<>]+\s+<([^<>]+)>|([^<>\s]+))$/.exec(value.trim());
  const address = match?.[1] ?? match?.[2];
  return address !== undefined && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address);
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function validateEnvironment(raw: Record<string, unknown>): Record<string, unknown> {
  const appEnvironment = required(raw, 'APP_ENV');
  if (!APP_ENVIRONMENTS.includes(appEnvironment as AppEnvironment)) {
    throw new Error(`APP_ENV must be one of ${APP_ENVIRONMENTS.join(', ')}`);
  }

  const logLevel = required(raw, 'LOG_LEVEL');
  const logLevels: readonly LogLevel[] = [
    'silent',
    'fatal',
    'error',
    'warn',
    'info',
    'debug',
    'trace',
  ];
  if (!logLevels.includes(logLevel as LogLevel)) {
    throw new Error(`LOG_LEVEL must be one of ${logLevels.join(', ')}`);
  }

  const port = integer(raw, 'PORT', {
    minimum: appEnvironment === 'test' ? 0 : 1,
    maximum: 65_535,
  });
  const accessTokenTtlSeconds = integer(raw, 'ACCESS_TOKEN_TTL', { minimum: 1 });
  const refreshTokenAbsoluteTtlSeconds = integer(raw, 'REFRESH_TOKEN_ABSOLUTE_TTL', { minimum: 1 });
  const refreshTokenIdleTtlSeconds = integer(raw, 'REFRESH_TOKEN_IDLE_TTL', { minimum: 1 });
  if (
    accessTokenTtlSeconds >= refreshTokenIdleTtlSeconds ||
    refreshTokenIdleTtlSeconds > refreshTokenAbsoluteTtlSeconds
  ) {
    throw new Error('Token TTLs must satisfy access < refresh idle <= refresh absolute');
  }

  const idempotencyRetentionSeconds = integer(raw, 'IDEMPOTENCY_RETENTION', { minimum: 1 });
  const idempotencyLeaseSeconds = integer(raw, 'IDEMPOTENCY_LEASE', { minimum: 1 });
  if (idempotencyLeaseSeconds >= idempotencyRetentionSeconds) {
    throw new Error('IDEMPOTENCY_LEASE must be shorter than IDEMPOTENCY_RETENTION');
  }

  const courseInviteTtlSeconds = integer(raw, 'COURSE_INVITE_TTL_SECONDS', { minimum: 60 });
  const joinCapabilityTtlSeconds = integer(raw, 'JOIN_CAPABILITY_TTL_SECONDS', {
    minimum: 30,
  });
  if (joinCapabilityTtlSeconds >= courseInviteTtlSeconds) {
    throw new Error('JOIN_CAPABILITY_TTL_SECONDS must be shorter than COURSE_INVITE_TTL_SECONDS');
  }
  const qrJoinSecretReplaySeconds = integer(raw, 'QR_JOIN_SECRET_REPLAY_SECONDS', {
    minimum: 60,
  });
  if (qrJoinSecretReplaySeconds < idempotencyRetentionSeconds) {
    throw new Error('QR_JOIN_SECRET_REPLAY_SECONDS must cover IDEMPOTENCY_RETENTION');
  }

  const trustProxy = required(raw, 'TRUST_PROXY');
  if (trustProxy !== 'true' && trustProxy !== 'false') {
    throw new Error('TRUST_PROXY must be true or false');
  }

  const systemModeSource = required(raw, 'SYSTEM_MODE_SOURCE');
  if (systemModeSource !== 'database') {
    throw new Error('SYSTEM_MODE_SOURCE must be database for the Foundation service');
  }

  const securityHashKey = required(raw, 'SECURITY_HASH_KEY');
  const publicOrganizationCode = typeof raw.PUBLIC_ORGANIZATION_CODE === 'string' ? raw.PUBLIC_ORGANIZATION_CODE.trim() : undefined;
  if (publicOrganizationCode !== undefined && !/^[A-Za-z0-9_-]{1,32}$/.test(publicOrganizationCode))
    throw new Error('PUBLIC_ORGANIZATION_CODE must be a nonempty organization code of at most 32 characters');
  if (securityHashKey.length < 32)
    throw new Error('SECURITY_HASH_KEY must contain at least 32 characters');

  const runtimeConfig: RuntimeConfig = {
    runtimeLogDirectory: typeof raw.RUNTIME_LOG_DIRECTORY === 'string' && raw.RUNTIME_LOG_DIRECTORY.trim() ? raw.RUNTIME_LOG_DIRECTORY.trim() : null,
    ocr: ocrConfiguration(raw),
    aiReview: aiReviewConfiguration(raw),
    appEnvironment: appEnvironment as AppEnvironment,
    appVersion: required(raw, 'APP_VERSION'),
    port,
    logLevel: logLevel as LogLevel,
    databaseUrl: postgresUrl(raw),
    tokenIssuer: required(raw, 'TOKEN_ISSUER'),
    tokenAudience: required(raw, 'TOKEN_AUDIENCE'),
    tokenSigningKey: pem(raw, 'TOKEN_SIGNING_KEY', 'PRIVATE KEY'),
    tokenVerifyingKey: pem(raw, 'TOKEN_VERIFYING_KEY', 'PUBLIC KEY'),
    accessTokenTtlSeconds,
    refreshTokenAbsoluteTtlSeconds,
    refreshTokenIdleTtlSeconds,
    idempotencyRetentionSeconds,
    idempotencyLeaseSeconds,
    idempotencyEncryptionKey: base64Key(raw, 'IDEMPOTENCY_ENCRYPTION_KEY'),
    securityHashKey,
    authRateLimitWindowSeconds: integer(raw, 'AUTH_RATE_LIMIT_WINDOW_SECONDS', {
      minimum: 1,
    }),
    authRateLimitMaxAttempts: integer(raw, 'AUTH_RATE_LIMIT_MAX_ATTEMPTS', { minimum: 1 }),
    corsAllowlist: allowlist(raw, appEnvironment as AppEnvironment),
    trustProxy: trustProxy === 'true',
    systemModeSource,
    publicOrganizationCode,
    requestBodyLimitBytes: integer(raw, 'REQUEST_BODY_LIMIT_BYTES', { minimum: 1 }),
    requestTimeoutMs: integer(raw, 'REQUEST_TIMEOUT_MS', { minimum: 100, maximum: 120_000 }),
    courseInviteTtlSeconds,
    joinCapabilityTtlSeconds,
    qrJoinTokenHashKey: base64Key(raw, 'QR_JOIN_TOKEN_HASH_KEY'),
    qrJoinSecretEncryptionKey: base64Key(raw, 'QR_JOIN_SECRET_ENCRYPTION_KEY'),
    qrJoinSecretReplaySeconds,
    qrJoinPublicRateLimitWindowSeconds: integer(raw, 'QR_JOIN_PUBLIC_RATE_LIMIT_WINDOW_SECONDS', {
      minimum: 1,
    }),
    qrJoinPublicRateLimitMaxRequests: integer(raw, 'QR_JOIN_PUBLIC_RATE_LIMIT_MAX_REQUESTS', {
      minimum: 1,
    }),
    objectStorage: objectStorage(raw, appEnvironment as AppEnvironment),
    media: mediaConfiguration(raw, appEnvironment as AppEnvironment),
    push: pushConfiguration(raw),
    emailDelivery: emailDeliveryConfiguration(raw, appEnvironment as AppEnvironment),
    tencentDbCaFile: tencentDbCaFile(raw, appEnvironment as AppEnvironment),
  };

  return { ...raw, RUNTIME_CONFIG: runtimeConfig };
}
