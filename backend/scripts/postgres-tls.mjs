import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { checkServerIdentity as nodeCheckServerIdentity } from 'node:tls';
import { TextDecoder } from 'node:util';

const MAX_CA_FILE_BYTES = 128 * 1024;
const PEM_CERTIFICATE = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/gu;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

export function prepareStrictMigrationEnvironment(environment) {
  const caFile = required(environment.TENCENTDB_CA_FILE, 'TENCENTDB_CA_FILE');
  loadTencentDbCa(caFile);
  const parsed = postgresUrl(
    required(environment.MIGRATION_DATABASE_URL, 'MIGRATION_DATABASE_URL'),
  );
  rejectInsecureTlsParameters(parsed);
  parsed.searchParams.set('sslmode', 'verify-full');
  parsed.searchParams.set('sslaccept', 'strict');
  environment.MIGRATION_DATABASE_URL = parsed.toString();
  environment.SSL_CERT_FILE = caFile;
}

export function createStrictPgClientConfig(databaseUrl, caFile, dependencies = {}) {
  const parsed = postgresUrl(databaseUrl);
  rejectInsecureTlsParameters(parsed);
  const ca = loadTencentDbCa(caFile, dependencies);
  const port = parsed.port.length === 0 ? 5432 : Number.parseInt(parsed.port, 10);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PostgreSQL URL port must be valid');
  }
  const user = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);
  const database = decodeURIComponent(parsed.pathname.slice(1));
  if (
    parsed.hostname.length === 0 ||
    user.length === 0 ||
    password.length === 0 ||
    database.length === 0
  ) {
    throw new Error('PostgreSQL URL must include host, user, password, and database');
  }
  const applicationName = parsed.searchParams.get('application_name');
  const checkServerIdentity = strictServerIdentityCheck(parsed.hostname, dependencies);
  return {
    host: parsed.hostname,
    port,
    user,
    password,
    database,
    ssl: { ca, rejectUnauthorized: true, checkServerIdentity },
    ...(applicationName === null ? {} : { application_name: applicationName }),
  };
}

function strictServerIdentityCheck(expectedHostname, dependencies) {
  const verifyServerIdentity = dependencies.checkServerIdentity ?? nodeCheckServerIdentity;
  return (_connectionHostname, certificate) => verifyServerIdentity(expectedHostname, certificate);
}

export function loadTencentDbCa(caFile, dependencies = {}) {
  if (!isAbsolute(caFile) || caFile.includes('CHANGE_ME')) {
    throw new Error('TENCENTDB_CA_FILE must be an explicitly configured absolute path');
  }
  let bytes;
  try {
    bytes = (dependencies.readCaFile ?? readFileSync)(caFile);
  } catch {
    throw new Error('TencentDB CA file could not be loaded');
  }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_CA_FILE_BYTES) {
    throw new Error('TencentDB CA file size is invalid');
  }
  let text;
  try {
    text = UTF8_DECODER.decode(bytes);
  } catch {
    throw new Error('TencentDB CA file must be valid UTF-8 PEM');
  }
  const certificates = text.match(PEM_CERTIFICATE) ?? [];
  if (certificates.length < 2) {
    throw new Error('TencentDB CA file must contain the complete CA chain');
  }
  for (const pem of certificates) {
    let certificate;
    try {
      certificate = new X509Certificate(pem);
    } catch {
      throw new Error('TencentDB CA file contains an invalid certificate');
    }
    if (!certificate.ca) {
      throw new Error('TencentDB CA file may contain CA certificates only');
    }
  }
  return `${certificates.join('\n')}\n`;
}

function postgresUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('PostgreSQL URL must be valid');
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('PostgreSQL URL must use the postgresql protocol');
  }
  return parsed;
}

function rejectInsecureTlsParameters(parsed) {
  const sslMode = parsed.searchParams.get('sslmode');
  if (
    sslMode === 'disable' ||
    sslMode === 'allow' ||
    sslMode === 'prefer' ||
    sslMode === 'no-verify'
  ) {
    throw new Error('PostgreSQL URL must not weaken TencentDB TLS verification');
  }
  const sslAccept = parsed.searchParams.get('sslaccept');
  if (sslAccept !== null && sslAccept !== 'strict') {
    throw new Error('PostgreSQL URL sslaccept must be strict when configured');
  }
}

function required(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.includes('CHANGE_ME')) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}
