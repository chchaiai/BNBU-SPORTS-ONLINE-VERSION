import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { TextDecoder } from 'node:util';

export const RUNTIME_SECRET_KEYS = [
  'DATABASE_URL',
  'TOKEN_SIGNING_KEY',
  'TOKEN_VERIFYING_KEY',
  'IDEMPOTENCY_ENCRYPTION_KEY',
  'SECURITY_HASH_KEY',
  'QR_JOIN_TOKEN_HASH_KEY',
  'QR_JOIN_SECRET_ENCRYPTION_KEY',
  'PUSH_TOKEN_ENCRYPTION_KEY',
] as const;

export type RuntimeSecretKey = (typeof RUNTIME_SECRET_KEYS)[number];

export interface RuntimeSecretLoadResult {
  provider: 'ENVIRONMENT' | 'FILE_JSON';
  injectedKeys: readonly RuntimeSecretKey[];
}

interface RuntimeSecretLoaderDependencies {
  readSecretFile?: (path: string) => Promise<Uint8Array>;
}

const MAX_SECRET_FILE_BYTES = 64 * 1024;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

export async function loadRuntimeSecrets(
  environment: NodeJS.ProcessEnv,
  dependencies: RuntimeSecretLoaderDependencies = {},
): Promise<RuntimeSecretLoadResult> {
  const provider = optionalText(environment.RUNTIME_SECRET_PROVIDER) ?? 'ENVIRONMENT';
  const appEnvironment = optionalText(environment.APP_ENV);

  if (provider === 'ENVIRONMENT') {
    if (appEnvironment === 'staging' || appEnvironment === 'production') {
      throw new Error(
        'RUNTIME_SECRET_PROVIDER must be FILE_JSON for staging and production environments',
      );
    }
    return { provider, injectedKeys: [] };
  }

  if (provider !== 'FILE_JSON') {
    throw new Error('RUNTIME_SECRET_PROVIDER must be ENVIRONMENT or FILE_JSON');
  }

  const filePath = requiredControl(environment, 'RUNTIME_SECRET_FILE');
  if (!isAbsolute(filePath)) throw new Error('RUNTIME_SECRET_FILE must be an absolute path');

  const duplicatedKeys = RUNTIME_SECRET_KEYS.filter(
    (key) => optionalText(environment[key]) !== null,
  );
  if (duplicatedKeys.length > 0) {
    throw new Error(
      `FILE_JSON managed secrets must not also be supplied as container environment variables: ${duplicatedKeys.join(', ')}`,
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = await (dependencies.readSecretFile ?? readFile)(filePath);
  } catch {
    throw new Error('Runtime JSON secret file could not be loaded');
  }
  if (bytes.byteLength > MAX_SECRET_FILE_BYTES) {
    throw new Error('Runtime JSON secret file exceeds the maximum supported size');
  }

  let text: string;
  try {
    text = UTF8_DECODER.decode(bytes);
  } catch {
    throw new Error('Runtime JSON secret file must be valid UTF-8');
  }
  const secret = parseSecretJson(text);
  const allowed = new Set<string>(RUNTIME_SECRET_KEYS);
  const unknownKeys = Object.keys(secret).filter((key) => !allowed.has(key));
  if (unknownKeys.length > 0) {
    throw new Error(
      `Runtime JSON secret file contains unsupported keys: ${unknownKeys.sort().join(', ')}`,
    );
  }

  const missingKeys = RUNTIME_SECRET_KEYS.filter((key) => optionalText(secret[key]) === null);
  if (missingKeys.length > 0) {
    throw new Error(`Runtime JSON secret file is missing keys: ${missingKeys.join(', ')}`);
  }

  for (const key of RUNTIME_SECRET_KEYS) environment[key] = secret[key];
  return { provider, injectedKeys: [...RUNTIME_SECRET_KEYS] };
}

function parseSecretJson(value: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Runtime JSON secret file must contain valid JSON');
  }
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('Runtime JSON secret file must contain a JSON object');
  }
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(parsed)) {
    if (typeof item !== 'string') {
      throw new Error(`Runtime JSON secret file key must contain a string value: ${key}`);
    }
    result[key] = item;
  }
  return result;
}

function requiredControl(environment: NodeJS.ProcessEnv, name: string): string {
  const value = optionalText(environment[name]);
  if (value === null || value.includes('CHANGE_ME')) {
    throw new Error(`${name} must be explicitly configured`);
  }
  return value;
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
