import assert from 'node:assert/strict';
import { type PeerCertificate, rootCertificates } from 'node:tls';
import { describe, it } from 'node:test';

import {
  createPrismaPgConfiguration,
  loadTencentDbCa,
} from '../../src/common/database/postgres-tls.js';

const completeCaChain = `${rootCertificates[0]}\n${rootCertificates[1]}\n`;
const caDependencies = {
  readCaFile: (): Uint8Array => Buffer.from(completeCaChain, 'utf8'),
};

describe('TencentDB PostgreSQL TLS configuration', () => {
  it('uses explicit pool fields so connection-string parsing cannot replace strict TLS', () => {
    const certificate = {} as PeerCertificate;
    let checkedHostname: string | null = null;
    let checkedCertificate: PeerCertificate | null = null;
    const result = createPrismaPgConfiguration(
      'postgresql://runtime:synthetic@10.0.0.10:5432/sports?schema=public&sslmode=require',
      '/run/secrets/tencentdb-ca-chain.pem',
      {
        ...caDependencies,
        checkServerIdentity: (hostname, peerCertificate) => {
          checkedHostname = hostname;
          checkedCertificate = peerCertificate;
          return undefined;
        },
      },
    );

    assert.equal(result.schema, 'public');
    assert.equal(result.pool.connectionString, undefined);
    assert.equal(result.pool.host, '10.0.0.10');
    assert.equal(result.pool.port, 5432);
    assert.equal(result.pool.user, 'runtime');
    assert.equal(result.pool.password, 'synthetic');
    assert.equal(result.pool.database, 'sports');
    assert.equal(typeof result.pool.ssl, 'object');
    const ssl = result.pool.ssl as Exclude<typeof result.pool.ssl, boolean | undefined>;
    assert.equal(ssl.rejectUnauthorized, true);
    assert.equal(ssl.ca, completeCaChain);
    assert.equal('servername' in ssl, false);
    assert.equal(typeof ssl.checkServerIdentity, 'function');
    assert.equal(ssl.checkServerIdentity?.('localhost', certificate), undefined);
    assert.equal(checkedHostname, '10.0.0.10');
    assert.equal(checkedCertificate, certificate);
  });

  it('preserves local connection-string behavior when no managed CA is configured', () => {
    const databaseUrl = 'postgresql://local:synthetic@127.0.0.1:5432/test?schema=public';
    const result = createPrismaPgConfiguration(databaseUrl, null);
    assert.equal(result.pool.connectionString, databaseUrl);
    assert.equal(result.schema, 'public');
  });

  it('rejects insecure URL overrides and incomplete CA files without exposing input values', () => {
    assert.throws(
      () =>
        createPrismaPgConfiguration(
          'postgresql://runtime:sentinel-password@10.0.0.10:5432/sports?sslmode=disable',
          '/run/secrets/tencentdb-ca-chain.pem',
          caDependencies,
        ),
      (error: unknown) =>
        error instanceof Error &&
        error.message.includes('must not weaken') &&
        !error.message.includes('sentinel-password'),
    );
    assert.throws(
      () =>
        loadTencentDbCa('/run/secrets/tencentdb-ca-chain.pem', {
          readCaFile: () => Buffer.from(`${rootCertificates[0]}\n`, 'utf8'),
        }),
      /complete CA chain/,
    );
  });
});
