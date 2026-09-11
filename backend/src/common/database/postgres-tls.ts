import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { checkServerIdentity as nodeCheckServerIdentity, type PeerCertificate } from 'node:tls';
import { TextDecoder } from 'node:util';

import type { PoolConfig } from 'pg';

const MAX_CA_FILE_BYTES = 128 * 1024;
const PEM_CERTIFICATE = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/gu;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });
const POSTGRES_SCHEMA = /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/u;

interface PostgresTlsDependencies {
  readCaFile?: (path: string) => Uint8Array;
  checkServerIdentity?: (hostname: string, certificate: PeerCertificate) => Error | undefined;
}

export interface PrismaPgConfiguration {
  pool: PoolConfig;
  schema: string;
}

export function createPrismaPgConfiguration(
  databaseUrl: string,
  caFile: string | null,
  dependencies: PostgresTlsDependencies = {},
): PrismaPgConfiguration {
  const parsed = postgresUrl(databaseUrl);
  const schema = parsed.searchParams.get('schema') ?? 'public';
  if (!POSTGRES_SCHEMA.test(schema)) {
    throw new Error('DATABASE_URL schema must be a safe PostgreSQL identifier');
  }

  if (caFile === null) {
    return { pool: { connectionString: databaseUrl }, schema };
  }

  const ca = loadTencentDbCa(caFile, dependencies);
  rejectInsecureTlsParameters(parsed);
  const port = parsed.port.length === 0 ? 5432 : Number.parseInt(parsed.port, 10);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('DATABASE_URL port must be valid');
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
    throw new Error('DATABASE_URL must include host, user, password, and database');
  }

  const applicationName = parsed.searchParams.get('application_name');
  const checkServerIdentity = strictServerIdentityCheck(parsed.hostname, dependencies);
  return {
    pool: {
      host: parsed.hostname,
      port,
      user,
      password,
      database,
      ssl: { ca, rejectUnauthorized: true, checkServerIdentity },
      ...(applicationName === null ? {} : { application_name: applicationName }),
    },
    schema,
  };
}

function strictServerIdentityCheck(
  expectedHostname: string,
  dependencies: PostgresTlsDependencies,
): (hostname: string, certificate: PeerCertificate) => Error | undefined {
  const verifyServerIdentity = dependencies.checkServerIdentity ?? nodeCheckServerIdentity;
  return (_connectionHostname, certificate) => verifyServerIdentity(expectedHostname, certificate);
}

export function loadTencentDbCa(
  caFile: string,
  dependencies: PostgresTlsDependencies = {},
): string {
  if (!isAbsolute(caFile) || caFile.includes('CHANGE_ME')) {
    throw new Error('TENCENTDB_CA_FILE must be an explicitly configured absolute path');
  }

  let bytes: Uint8Array;
  try {
    bytes = (dependencies.readCaFile ?? readFileSync)(caFile);
  } catch {
    throw new Error('TencentDB CA file could not be loaded');
  }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_CA_FILE_BYTES) {
    throw new Error('TencentDB CA file size is invalid');
  }

  let text: string;
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
    let certificate: X509Certificate;
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

function postgresUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('DATABASE_URL must use the postgresql protocol');
  }
  return parsed;
}

function rejectInsecureTlsParameters(parsed: URL): void {
  const sslMode = parsed.searchParams.get('sslmode');
  if (
    sslMode === 'disable' ||
    sslMode === 'allow' ||
    sslMode === 'prefer' ||
    sslMode === 'no-verify'
  ) {
    throw new Error('DATABASE_URL must not weaken TencentDB TLS verification');
  }
  const sslAccept = parsed.searchParams.get('sslaccept');
  if (sslAccept !== null && sslAccept !== 'strict') {
    throw new Error('DATABASE_URL sslaccept must be strict when configured');
  }
}
