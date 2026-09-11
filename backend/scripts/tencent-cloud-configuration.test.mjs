import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { rootCertificates } from 'node:tls';

import YAML from 'yaml';

import { loadFileJsonSecret } from './file-json-secret.mjs';
import { createStrictPgClientConfig, prepareStrictMigrationEnvironment } from './postgres-tls.mjs';

const completeCaChain = `${rootCertificates[0]}\n${rootCertificates[1]}\n`;

describe('Tencent Cloud configuration tooling', () => {
  it('preserves only Backend-valid request IDs through the Nginx proxy and access log', () => {
    const logFormat = readFileSync(
      resolve('../docs/deployment/nginx/bnbu-sports-log-format.conf'),
      'utf8',
    );
    const apiLocations = readFileSync(
      resolve('../docs/deployment/nginx/bnbu-sports-api-locations.conf'),
      'utf8',
    );
    const webHttps = readFileSync(
      resolve('../docs/deployment/nginx/bnbu-sports-web-https.conf'),
      'utf8',
    );
    const requestIdSource = readFileSync(resolve('src/common/http/request-id.ts'), 'utf8');

    assert.match(requestIdSource, /\^\[A-Za-z0-9\._:-\]\{1,64\}\$/u);
    assert.match(logFormat, /map \$http_x_request_id \$bnbu_request_id \{/u);
    assert.match(logFormat, /"~\^\[A-Za-z0-9\._:-\]\{1,64\}\$" \$http_x_request_id;/u);
    assert.match(logFormat, /default \$request_id;/u);
    assert.match(logFormat, /request_id=\$bnbu_request_id upstream=\$upstream_addr/u);
    assert.doesNotMatch(logFormat, /request_id=\$request_id upstream=\$upstream_addr/u);
    assert.equal(
      [...apiLocations.matchAll(/proxy_set_header X-Request-Id \$bnbu_request_id;/gu)].length,
      2,
    );
    assert.equal(
      [...webHttps.matchAll(/proxy_set_header X-Request-Id \$bnbu_request_id;/gu)].length,
      1,
    );
    assert.doesNotMatch(apiLocations, /proxy_set_header X-Request-Id \$request_id;/u);
    assert.doesNotMatch(webHttps, /proxy_set_header X-Request-Id \$request_id;/u);
    assert.ok(
      logFormat.includes('~^/join/[^/]+$ /join/:inviteToken;'),
      'Student Web invite tokens must be templated before access logging',
    );
    assert.match(webHttps, /server_name www\.verityai\.cn;/u);
    assert.match(webHttps, /root \/opt\/bnbu-sports\/web\/current\/student;/u);
    assert.match(webHttps, /try_files \$uri \$uri\/ \/index\.html;/u);
    assert.match(webHttps, /add_header Cache-Control "no-store" always;/u);
    assert.match(webHttps, /add_header Referrer-Policy "no-referrer" always;/u);
  });

  it('loads an exact key set from a mounted file without returning unrelated values', async () => {
    const environment = {};
    const result = await loadFileJsonSecret({
      filePath: '/run/secrets/bnbu_migrator.json',
      expectedKeys: ['MIGRATION_DATABASE_URL'],
      environment,
      readSecretFile: () =>
        Promise.resolve(
          Buffer.from(JSON.stringify({ MIGRATION_DATABASE_URL: 'synthetic-secret-value' })),
        ),
    });
    assert.deepEqual(result, { keys: ['MIGRATION_DATABASE_URL'] });
    assert.equal(environment.MIGRATION_DATABASE_URL, 'synthetic-secret-value');
  });

  it('reports missing names while redacting values and provider failures', async () => {
    await assert.rejects(
      loadFileJsonSecret({
        filePath: '/run/secrets/bnbu_runtime.json',
        expectedKeys: ['DATABASE_URL', 'SECURITY_HASH_KEY'],
        environment: {},
        readSecretFile: () =>
          Promise.resolve(Buffer.from(JSON.stringify({ DATABASE_URL: 'synthetic-secret-value' }))),
      }),
      (error) =>
        error instanceof Error &&
        error.message.includes('SECURITY_HASH_KEY') &&
        !error.message.includes('synthetic-secret-value'),
    );
    await assert.rejects(
      loadFileJsonSecret({
        filePath: '/run/secrets/bnbu_runtime.json',
        expectedKeys: ['DATABASE_URL'],
        environment: {},
        readSecretFile: () => Promise.reject(new Error('sensitive file-system detail')),
      }),
      (error) => error instanceof Error && error.message === 'JSON secret file could not be loaded',
    );
  });

  it('prints only configuration status and ownership in the preflight report', () => {
    const manifest = JSON.parse(
      readFileSync(resolve('config/staging-configuration-requirements.json'), 'utf8'),
    );
    const environment = { ...process.env };
    for (const item of manifest.nonSecret) {
      environment[item.name] = syntheticNonSecretValue(item);
    }
    environment.DATABASE_URL = 'sentinel-must-not-print';
    const result = spawnSync(
      process.execPath,
      [resolve('scripts/check-staging-configuration.mjs')],
      {
        cwd: process.cwd(),
        env: environment,
        encoding: 'utf8',
        windowsHide: true,
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /CONFIGURED\tAPP_ENV\tDEPLOYMENT/);
    assert.match(result.stdout, /UNKNOWN_FILE_NOT_READ\tDATABASE_URL\tDOCKER_COMPOSE_SECRET/);
    assert.match(
      result.stdout,
      /UNKNOWN_CONSOLE_VERIFICATION\tCVM_INSTANCE_ROLE_BINDING\tUSER_TENCENT_CONSOLE/,
    );
    assert.doesNotMatch(result.stdout, /sentinel-must-not-print/);

    environment.TENCENT_SES_TEMPLATE_ID = 'sentinel-wrong-template-id';
    const mismatch = spawnSync(
      process.execPath,
      [resolve('scripts/check-staging-configuration.mjs')],
      {
        cwd: process.cwd(),
        env: environment,
        encoding: 'utf8',
        windowsHide: true,
      },
    );
    assert.equal(mismatch.status, 1, mismatch.stderr);
    assert.match(mismatch.stdout, /MISMATCH\tTENCENT_SES_TEMPLATE_ID\tUSER_TENCENT_CONSOLE/);
    assert.doesNotMatch(mismatch.stdout, /sentinel-wrong-template-id/);

    environment.TENCENT_SES_TEMPLATE_ID = '56852';
    environment.CORS_ALLOWLIST = 'http://129.204.146.192';
    const insecureCors = spawnSync(
      process.execPath,
      [resolve('scripts/check-staging-configuration.mjs')],
      {
        cwd: process.cwd(),
        env: environment,
        encoding: 'utf8',
        windowsHide: true,
      },
    );
    assert.equal(insecureCors.status, 1, insecureCors.stderr);
    assert.match(insecureCors.stdout, /MISMATCH\tCORS_ALLOWLIST\tDEPLOYMENT/);

    environment.CORS_ALLOWLIST = 'https://unexpected.verityai.cn';
    const unexpectedCors = spawnSync(
      process.execPath,
      [resolve('scripts/check-staging-configuration.mjs')],
      {
        cwd: process.cwd(),
        env: environment,
        encoding: 'utf8',
        windowsHide: true,
      },
    );
    assert.equal(unexpectedCors.status, 1, unexpectedCors.stderr);
    assert.match(unexpectedCors.stdout, /MISMATCH\tCORS_ALLOWLIST\tDEPLOYMENT/);

    environment.CORS_ALLOWLIST = 'https://web-origin-not-configured.invalid';
    const deferredCors = spawnSync(
      process.execPath,
      [resolve('scripts/check-staging-configuration.mjs')],
      {
        cwd: process.cwd(),
        env: environment,
        encoding: 'utf8',
        windowsHide: true,
      },
    );
    assert.equal(deferredCors.status, 0, deferredCors.stderr);
    assert.match(deferredCors.stdout, /DEFERRED\tCORS_ALLOWLIST\tDEPLOYMENT/);
  });

  it('checks host Compose secret sources without replacing container target paths', () => {
    const manifest = JSON.parse(
      readFileSync(resolve('config/staging-configuration-requirements.json'), 'utf8'),
    );
    const directory = mkdtempSync(join(tmpdir(), 'bnbu-staging-config-test-'));
    const runtimePath = join(directory, 'runtime.json');
    const migratorPath = join(directory, 'migrator.json');
    const fixturePath = join(directory, 'staging-fixture.json');
    const businessFixturePath = join(directory, 'staging-business-fixture.json');
    const r01FixturePath = join(directory, 'staging-r01-fixture.json');
    const caPath = join(directory, 'tencentdb-ca-chain.pem');
    const runtimeSecret = Object.fromEntries(
      manifest.runtimeSecret.map((name) => [name, `synthetic-${name}`]),
    );
    const migratorSecret = Object.fromEntries(
      manifest.migratorSecret.map((name) => [name, `synthetic-${name}`]),
    );
    const fixtureSecret = Object.fromEntries(
      manifest.fixtureSecret.map((name) => [name, `synthetic-${name}`]),
    );
    const businessFixtureSecret = Object.fromEntries(
      manifest.businessFixtureSecret.map((name) => [name, `synthetic-${name}`]),
    );
    const r01FixtureSecret = Object.fromEntries(
      manifest.r01FixtureSecret.map((name) => [name, `synthetic-${name}`]),
    );
    assert.deepEqual(manifest.r01FixtureSecret, [
      'STAGING_R01_ADMIN_ACCOUNT',
      'STAGING_R01_ADMIN_PASSWORD',
      'STAGING_R01_TEACHER_ACCOUNT',
      'STAGING_R01_TEACHER_PASSWORD',
    ]);
    assert.deepEqual(manifest.r01FixtureForbiddenEnvironment, [
      ...manifest.r01FixtureSecret,
      'STAGING_R01_STUDENT_ANDROID_EMAIL',
      'STAGING_R01_STUDENT_IOS_EMAIL',
      'STAGING_R01_STUDENT_WEB_EMAIL',
    ]);
    writeFileSync(runtimePath, JSON.stringify(runtimeSecret), 'utf8');
    writeFileSync(migratorPath, JSON.stringify(migratorSecret), 'utf8');
    writeFileSync(fixturePath, JSON.stringify(fixtureSecret), 'utf8');
    writeFileSync(businessFixturePath, JSON.stringify(businessFixtureSecret), 'utf8');
    writeFileSync(r01FixturePath, JSON.stringify(r01FixtureSecret), 'utf8');
    writeFileSync(caPath, completeCaChain, 'utf8');

    try {
      const environment = { ...process.env };
      for (const secretName of new Set([
        ...manifest.runtimeSecret,
        ...manifest.migratorSecret,
        ...manifest.fixtureSecret,
        ...manifest.businessFixtureSecret,
        ...manifest.r01FixtureForbiddenEnvironment,
      ])) {
        delete environment[secretName];
      }
      for (const item of manifest.nonSecret) {
        environment[item.name] = syntheticNonSecretValue(item);
      }
      environment.BNBU_RUNTIME_SECRET_FILE = runtimePath;
      environment.BNBU_MIGRATOR_SECRET_FILE = migratorPath;
      environment.BNBU_STAGING_FIXTURE_SECRET_FILE = fixturePath;
      environment.BNBU_STAGING_BUSINESS_FIXTURE_SECRET_FILE = businessFixturePath;
      environment.BNBU_STAGING_R01_FIXTURE_SECRET_FILE = r01FixturePath;
      environment.BNBU_TENCENTDB_CA_FILE = caPath;
      const result = spawnSync(
        process.execPath,
        [resolve('scripts/check-staging-configuration.mjs'), '--files'],
        {
          cwd: process.cwd(),
          env: environment,
          encoding: 'utf8',
          windowsHide: true,
        },
      );
      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.match(result.stdout, /CONFIGURED\tDATABASE_URL\tDOCKER_COMPOSE_SECRET/);
      assert.match(result.stdout, /CONFIGURED\tMIGRATION_DATABASE_URL\tDOCKER_COMPOSE_SECRET/);
      assert.match(result.stdout, /CONFIGURED\tSTAGING_ADMIN_PASSWORD\tDOCKER_COMPOSE_SECRET/);
      assert.match(
        result.stdout,
        /CONFIGURED\tSTAGING_BUSINESS_STUDENT_EMAIL\tDOCKER_COMPOSE_SECRET/,
      );
      assert.match(
        result.stdout,
        /CONFIGURED\tSTAGING_R01_TEACHER_PASSWORD\tDOCKER_COMPOSE_SECRET/,
      );
      assert.doesNotMatch(result.stdout, /STAGING_R01_STUDENT_/u);
      assert.match(result.stdout, /CONFIGURED\tTENCENTDB_CA_CHAIN\tDOCKER_COMPOSE_SECRET/);
      assert.doesNotMatch(result.stdout, /synthetic-DATABASE_URL/);

      for (const forbiddenName of manifest.r01FixtureForbiddenEnvironment) {
        const environmentSentinel = `sentinel-r01-secret-must-not-print-${forbiddenName}`;
        const contaminatedResult = spawnSync(
          process.execPath,
          [resolve('scripts/check-staging-configuration.mjs'), '--files'],
          {
            cwd: process.cwd(),
            env: { ...environment, [forbiddenName]: environmentSentinel },
            encoding: 'utf8',
            windowsHide: true,
          },
        );
        assert.equal(contaminatedResult.status, 1, contaminatedResult.stderr);
        assert.match(
          contaminatedResult.stdout,
          /INVALID_OR_UNAVAILABLE\tSTAGING_R01_FIXTURE_JSON_SECRET\tUSER_TENCENT_CONSOLE/,
        );
        assert.doesNotMatch(contaminatedResult.stdout, new RegExp(environmentSentinel, 'u'));
        assert.doesNotMatch(contaminatedResult.stderr, new RegExp(environmentSentinel, 'u'));
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('grants all non-root containers only the dedicated secret reader group', () => {
    const compose = YAML.parse(readFileSync(resolve('docker-compose.staging.yml'), 'utf8'));

    assert.deepEqual(compose.services.backend.group_add, ['10001']);
    assert.deepEqual(compose.services.migrator.group_add, ['10001']);
    assert.deepEqual(compose.services['health-operator'].group_add, ['10001']);
    assert.deepEqual(compose.services['business-operator'].group_add, ['10001']);
    assert.deepEqual(compose.services['r01-provisioner'].group_add, ['10001']);
    assert.deepEqual(compose.services.backend.secrets, [
      { source: 'bnbu_runtime', target: 'bnbu_runtime.json' },
      { source: 'tencentdb_ca', target: 'tencentdb-ca-chain.pem' },
    ]);
    assert.deepEqual(compose.services.migrator.secrets, [
      { source: 'bnbu_migrator', target: 'bnbu_migrator.json' },
      { source: 'tencentdb_ca', target: 'tencentdb-ca-chain.pem' },
    ]);
    assert.deepEqual(compose.services['health-operator'].secrets, [
      { source: 'bnbu_runtime', target: 'bnbu_runtime.json' },
      { source: 'bnbu_staging_fixture', target: 'bnbu_staging_fixture.json' },
      { source: 'tencentdb_ca', target: 'tencentdb-ca-chain.pem' },
    ]);
    assert.deepEqual(compose.services['business-operator'].secrets, [
      { source: 'bnbu_runtime', target: 'bnbu_runtime.json' },
      {
        source: 'bnbu_staging_business_fixture',
        target: 'bnbu_staging_business_fixture.json',
      },
      { source: 'tencentdb_ca', target: 'tencentdb-ca-chain.pem' },
    ]);
    assert.deepEqual(compose.services['r01-provisioner'].secrets, [
      { source: 'bnbu_runtime', target: 'bnbu_runtime.json' },
      {
        source: 'bnbu_staging_r01_fixture',
        target: 'bnbu_staging_r01_fixture.json',
      },
      { source: 'tencentdb_ca', target: 'tencentdb-ca-chain.pem' },
    ]);
    assert.equal(
      compose.services.backend.secrets.some((item) => item.source.includes('fixture')),
      false,
    );
    assert.equal(
      compose.services['business-operator'].secrets.some(
        (item) => item.source === 'bnbu_staging_fixture' || item.source === 'bnbu_migrator',
      ),
      false,
    );
    assert.equal(
      compose.services['r01-provisioner'].secrets.some(
        (item) =>
          item.source === 'bnbu_staging_fixture' ||
          item.source === 'bnbu_staging_business_fixture' ||
          item.source === 'bnbu_migrator',
      ),
      false,
    );
    assert.equal(
      compose.secrets.tencentdb_ca.file,
      '${BNBU_TENCENTDB_CA_FILE:?Set the host TencentDB CA chain file}',
    );
    assert.equal(
      compose.services['health-operator'].environment.STAGING_BOOTSTRAP_CONFIRMATION,
      '${STAGING_BOOTSTRAP_CONFIRMATION:-NOT_CONFIRMED}',
    );
    assert.equal(
      compose.secrets.bnbu_staging_fixture.file,
      '${BNBU_STAGING_FIXTURE_SECRET_FILE:-/nonexistent/bnbu-staging-fixture-not-configured.json}',
    );
    assert.equal(
      compose.services['business-operator'].environment.STAGING_BUSINESS_CONFIRMATION,
      '${STAGING_BUSINESS_CONFIRMATION:-NOT_CONFIRMED}',
    );
    assert.equal(
      compose.services['business-operator'].environment.STAGING_QR_PATH_LOG_REDACTION_CONFIRMED,
      '${STAGING_QR_PATH_LOG_REDACTION_CONFIRMED:-NOT_CONFIRMED}',
    );
    assert.equal(
      compose.secrets.bnbu_staging_business_fixture.file,
      '${BNBU_STAGING_BUSINESS_FIXTURE_SECRET_FILE:-/nonexistent/bnbu-staging-business-fixture-not-configured.json}',
    );
    assert.equal(
      compose.services['r01-provisioner'].environment.STAGING_R01_CONFIRMATION,
      '${STAGING_R01_CONFIRMATION:-NOT_CONFIRMED}',
    );
    assert.deepEqual(Object.keys(compose.services['r01-provisioner'].environment).sort(), [
      'STAGING_R01_CONFIRMATION',
      'STAGING_R01_FIXTURE_SECRET_FILE',
    ]);
    assert.equal(compose.services['r01-provisioner'].pull_policy, 'never');
    assert.equal(
      compose.secrets.bnbu_staging_r01_fixture.file,
      '${BNBU_STAGING_R01_FIXTURE_SECRET_FILE:-/nonexistent/bnbu-staging-r01-fixture-not-configured.json}',
    );
  });

  it('pins the R01 one-shot runbook to the already-frozen local image', () => {
    const runbook = readFileSync(
      resolve('../docs/deployment/STAGING-R01-PROVISIONING-RUNBOOK.md'),
      'utf8',
    );
    const lines = runbook.split(/\r?\n/u).map((line) => line.trim());
    const runIndex = lines.indexOf('--profile operations run \\');
    assert.notEqual(runIndex, -1);
    assert.deepEqual(lines.slice(runIndex, runIndex + 4), [
      '--profile operations run \\',
      '--pull never \\',
      '--name <fixed-r01-one-shot-name> \\',
      '--no-deps r01-provisioner bootstrap',
    ]);
    assert.equal(lines.filter((line) => line === '--pull never \\').length, 1);
  });

  it('bounds every staging Compose service log with explicit json-file rotation', () => {
    const compose = YAML.parse(readFileSync(resolve('docker-compose.staging.yml'), 'utf8'));
    const expectedLogging = {
      driver: 'json-file',
      options: {
        'max-size': '10m',
        'max-file': '5',
      },
    };

    assert.deepEqual(Object.keys(compose.services).sort(), [
      'backend',
      'business-operator',
      'health-operator',
      'migrator',
      'r01-provisioner',
    ]);
    for (const [serviceName, service] of Object.entries(compose.services)) {
      assert.deepEqual(service.logging, expectedLogging, `${serviceName} logging must be bounded`);
    }
  });

  it('bounds CPU, memory and process counts for every staging Compose service', () => {
    const compose = YAML.parse(readFileSync(resolve('docker-compose.staging.yml'), 'utf8'));
    const expected = {
      backend: { cpus: 1.5, mem_limit: '1536m', pids_limit: 256 },
      migrator: { cpus: 1, mem_limit: '768m', pids_limit: 256 },
      'health-operator': { cpus: 1, mem_limit: '768m', pids_limit: 256 },
      'business-operator': { cpus: 1, mem_limit: '768m', pids_limit: 256 },
      'r01-provisioner': { cpus: 1, mem_limit: '768m', pids_limit: 256 },
    };

    for (const [serviceName, resources] of Object.entries(expected)) {
      const service = compose.services[serviceName];
      assert.deepEqual(
        {
          cpus: service.cpus,
          mem_limit: service.mem_limit,
          pids_limit: service.pids_limit,
        },
        resources,
        `${serviceName} resource limits must match the staging capacity baseline`,
      );
    }
  });

  it('prepares strict Prisma migration and pg client settings without retaining URL TLS downgrades', () => {
    const directory = mkdtempSync(join(tmpdir(), 'bnbu-tencentdb-ca-test-'));
    const caPath = join(directory, 'tencentdb-ca-chain.pem');
    writeFileSync(caPath, completeCaChain, 'utf8');
    try {
      const environment = {
        TENCENTDB_CA_FILE: caPath,
        MIGRATION_DATABASE_URL:
          'postgresql://migrator:synthetic@10.0.0.10:5432/sports?schema=public&sslmode=require',
      };
      prepareStrictMigrationEnvironment(environment);
      const strictUrl = new URL(environment.MIGRATION_DATABASE_URL);
      assert.equal(strictUrl.searchParams.get('sslmode'), 'verify-full');
      assert.equal(strictUrl.searchParams.get('sslaccept'), 'strict');
      assert.equal(environment.SSL_CERT_FILE, caPath);

      const certificate = {};
      let checkedHostname = null;
      let checkedCertificate = null;
      const client = createStrictPgClientConfig(environment.MIGRATION_DATABASE_URL, caPath, {
        checkServerIdentity: (hostname, peerCertificate) => {
          checkedHostname = hostname;
          checkedCertificate = peerCertificate;
          return undefined;
        },
      });
      assert.equal(client.host, '10.0.0.10');
      assert.equal(client.ssl.rejectUnauthorized, true);
      assert.equal(client.ssl.ca, completeCaChain);
      assert.equal(client.connectionString, undefined);
      assert.equal('servername' in client.ssl, false);
      assert.equal(typeof client.ssl.checkServerIdentity, 'function');
      assert.equal(client.ssl.checkServerIdentity('localhost', certificate), undefined);
      assert.equal(checkedHostname, '10.0.0.10');
      assert.equal(checkedCertificate, certificate);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('pins COS permissions to the staging bucket and two application prefixes', () => {
    const policy = JSON.parse(
      readFileSync(resolve('config/tencent-cloud-staging-cam-policy.json'), 'utf8'),
    );
    const statements = policy.statement;
    const actions = statements.flatMap((statement) => statement.action);
    const resources = statements.flatMap((statement) => statement.resource);
    assert.equal(policy.version, '2.0');
    assert.equal(actions.includes('*'), false);
    assert.equal(
      actions.some((action) => action.includes('FullControl')),
      false,
    );
    assert.equal(actions.includes('name/cos:DeleteBucket'), false);
    assert.equal(actions.includes('name/cos:HeadBucket'), true);
    assert.equal(actions.includes('name/cos:PutObject'), true);
    assert.equal(actions.includes('name/cos:GetObject'), true);
    assert.equal(actions.includes('name/cos:DeleteObject'), true);
    assert.equal(
      resources.every(
        (resource) =>
          resource.startsWith(
            'qcs::cos:ap-guangzhou:uid/1443273655:sports-staging-media-1443273655/',
          ) && !resource.includes('*:*'),
      ),
      true,
    );
    assert.equal(
      resources.some((resource) => resource.endsWith('/roster-sources/*')),
      true,
    );
    assert.equal(
      resources.some((resource) => resource.endsWith('/media/*')),
      true,
    );
  });

  it('pins SES permissions to SendEmail only', () => {
    const policy = JSON.parse(
      readFileSync(resolve('config/tencent-cloud-staging-ses-cam-policy.json'), 'utf8'),
    );
    assert.deepEqual(policy, {
      version: '2.0',
      statement: [
        {
          effect: 'allow',
          action: ['name/ses:SendEmail'],
          resource: ['*'],
        },
      ],
    });
  });
});

function syntheticNonSecretValue(item) {
  if (item.expected !== undefined) return String(item.expected);
  if (item.validation === 'HTTPS_ORIGIN_LIST') return 'https://staging-web.example.test';
  return 'synthetic-configured';
}
