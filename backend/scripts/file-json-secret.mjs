import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { TextDecoder } from 'node:util';

const MAX_SECRET_FILE_BYTES = 64 * 1024;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

export async function loadFileJsonSecret({
  filePath,
  expectedKeys,
  environment,
  readSecretFile = readFile,
}) {
  const resolvedPath = required(filePath, 'JSON secret file path');
  if (!isAbsolute(resolvedPath)) throw new Error('JSON secret file path must be absolute');
  if (!Array.isArray(expectedKeys) || expectedKeys.length === 0) {
    throw new Error('JSON secret expected key list must not be empty');
  }

  const duplicatedKeys = expectedKeys.filter((key) => configured(environment[key]));
  if (duplicatedKeys.length > 0) {
    throw new Error(
      `FILE_JSON managed secrets must not also be supplied as environment variables: ${duplicatedKeys.join(', ')}`,
    );
  }

  let bytes;
  try {
    bytes = await readSecretFile(resolvedPath);
  } catch {
    throw new Error('JSON secret file could not be loaded');
  }
  if (!(bytes instanceof Uint8Array)) throw new Error('JSON secret reader returned invalid data');
  if (bytes.byteLength > MAX_SECRET_FILE_BYTES) {
    throw new Error('JSON secret file exceeds the maximum supported size');
  }

  let text;
  try {
    text = UTF8_DECODER.decode(bytes);
  } catch {
    throw new Error('JSON secret file must be valid UTF-8');
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('JSON secret file must contain valid JSON');
  }
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('JSON secret file must contain a JSON object');
  }

  const allowed = new Set(expectedKeys);
  const unknownKeys = Object.keys(parsed).filter((key) => !allowed.has(key));
  if (unknownKeys.length > 0) {
    throw new Error(`JSON secret file contains unsupported keys: ${unknownKeys.sort().join(', ')}`);
  }
  const missingKeys = expectedKeys.filter(
    (key) => typeof parsed[key] !== 'string' || parsed[key].trim().length === 0,
  );
  if (missingKeys.length > 0) {
    throw new Error(`JSON secret file is missing keys: ${missingKeys.join(', ')}`);
  }

  for (const key of expectedKeys) environment[key] = parsed[key];
  return { keys: [...expectedKeys] };
}

function required(value, name) {
  if (!configured(value) || value.includes('CHANGE_ME')) throw new Error(`${name} is required`);
  return value.trim();
}

function configured(value) {
  return typeof value === 'string' && value.trim().length > 0;
}
