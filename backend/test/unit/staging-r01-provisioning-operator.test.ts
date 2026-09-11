import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import type { RuntimeConfig } from '../../src/common/config/environment.js';
import {
  loadStagingR01FixtureSecret,
  STAGING_R01_CONFIRMATION,
  STAGING_R01_FIXTURE_SECRET_KEYS,
  STAGING_R01_FORBIDDEN_ENV_KEYS,
  STAGING_R01_SAFE_ALIASES,
  StagingR01ProvisioningFailure,
  type StagingR01FixtureOutcome,
} from '../../src/tools/staging-r01-fixture.js';
import {
  buildSafeStagingR01Failure,
  buildSafeStagingR01Result,
  safeStagingR01CommandLabel,
  validateStagingR01OperatorControls,
  validateStagingR01RuntimeBoundary,
} from '../../src/tools/staging-r01-provisioning-operator.js';

const SYNTHETIC_SECRET = {
  STAGING_R01_ADMIN_ACCOUNT: 'admin.r01@unit.invalid',
  STAGING_R01_ADMIN_PASSWORD: 'Synthetic-R01-Admin-Password-2026',
  STAGING_R01_TEACHER_ACCOUNT: 'teacher.r01@unit.invalid',
  STAGING_R01_TEACHER_PASSWORD: 'Synthetic-R01-Teacher-Password-2026',
};

function isFailure(code: string): (error: unknown) => boolean {
  return (error) =>
    error instanceof StagingR01ProvisioningFailure && error.code === code && error.message === code;
}

function secretDependencies(value: unknown, mode = 0o640) {
  return {
    inspectSecretFile: () =>
      Promise.resolve({ uid: 0, gid: 10_001, mode, isFile: true, isSymbolicLink: false }),
    readSecretFile: () => Promise.resolve(Buffer.from(JSON.stringify(value))),
  };
}

function runtimeConfig(databaseUrl: string): RuntimeConfig {
  return {
    appEnvironment: 'staging',
    databaseUrl,
    tencentDbCaFile: '/run/secrets/tencentdb-ca-chain.pem',
  } as RuntimeConfig;
}

describe('staging R01 provisioning operator', () => {
  it('loads exactly four isolated staff values from a hardened secret file', async () => {
    const loaded = await loadStagingR01FixtureSecret(
      '/run/secrets/bnbu_staging_r01_fixture.json',
      secretDependencies(SYNTHETIC_SECRET),
    );
    assert.deepEqual(loaded, {
      adminAccount: SYNTHETIC_SECRET.STAGING_R01_ADMIN_ACCOUNT,
      adminPassword: SYNTHETIC_SECRET.STAGING_R01_ADMIN_PASSWORD,
      teacherAccount: SYNTHETIC_SECRET.STAGING_R01_TEACHER_ACCOUNT,
      teacherPassword: SYNTHETIC_SECRET.STAGING_R01_TEACHER_PASSWORD,
    });
  });

  it('rejects unsafe metadata, unknown keys and non-isolated identities without exposing values', async () => {
    await assert.rejects(
      loadStagingR01FixtureSecret(
        '/run/secrets/bnbu_staging_r01_fixture.json',
        secretDependencies(SYNTHETIC_SECRET, 0o644),
      ),
      isFailure('R01_FIXTURE_SECRET_PERMISSIONS_INVALID'),
    );
    await assert.rejects(
      loadStagingR01FixtureSecret(
        '/run/secrets/bnbu_staging_r01_fixture.json',
        secretDependencies({ ...SYNTHETIC_SECRET, UNEXPECTED: 'sentinel-must-not-print' }),
      ),
      isFailure('R01_FIXTURE_SECRET_KEYS_INVALID'),
    );
    await assert.rejects(
      loadStagingR01FixtureSecret(
        '/run/secrets/bnbu_staging_r01_fixture.json',
        secretDependencies({
          ...SYNTHETIC_SECRET,
          STAGING_R01_TEACHER_PASSWORD: SYNTHETIC_SECRET.STAGING_R01_ADMIN_PASSWORD,
        }),
      ),
      isFailure('R01_FIXTURE_PASSWORDS_NOT_ISOLATED'),
    );
    await assert.rejects(
      loadStagingR01FixtureSecret(
        '/run/secrets/bnbu_staging_r01_fixture.json',
        secretDependencies({
          ...SYNTHETIC_SECRET,
          STAGING_R01_TEACHER_ACCOUNT: SYNTHETIC_SECRET.STAGING_R01_ADMIN_ACCOUNT,
        }),
      ),
      isFailure('R01_FIXTURE_ACCOUNTS_NOT_ISOLATED'),
    );
  });

  it('requires the exact staging command, confirmation and absolute secret path', () => {
    const fixtureSecretFile = resolve('synthetic-r01-fixture.json');
    const environment: NodeJS.ProcessEnv = {
      APP_ENV: 'staging',
      STAGING_R01_CONFIRMATION,
      STAGING_R01_FIXTURE_SECRET_FILE: fixtureSecretFile,
    };
    assert.deepEqual(validateStagingR01OperatorControls(environment, 'bootstrap'), {
      fixtureSecretFile,
    });
    assert.throws(
      () =>
        validateStagingR01OperatorControls({ ...environment, APP_ENV: 'production' }, 'bootstrap'),
      isFailure('R01_APP_ENV_NOT_STAGING'),
    );
    assert.throws(
      () =>
        validateStagingR01OperatorControls(
          { ...environment, STAGING_R01_CONFIRMATION: 'wrong' },
          'bootstrap',
        ),
      isFailure('R01_CONFIRMATION_MISMATCH'),
    );
    assert.throws(
      () =>
        validateStagingR01OperatorControls(
          { ...environment, STAGING_R01_FIXTURE_SECRET_FILE: 'relative.json' },
          'bootstrap',
        ),
      isFailure('R01_FIXTURE_SECRET_PATH_INVALID'),
    );
    assert.equal(safeStagingR01CommandLabel('bootstrap'), 'bootstrap');
    assert.equal(safeStagingR01CommandLabel('run'), 'INVALID');
  });

  it('rejects every current and retired R01 secret key from environment without reflecting values', () => {
    const fixtureSecretFile = resolve('synthetic-r01-fixture.json');
    const cleanEnvironment: NodeJS.ProcessEnv = {
      APP_ENV: 'staging',
      STAGING_R01_CONFIRMATION,
      STAGING_R01_FIXTURE_SECRET_FILE: fixtureSecretFile,
    };
    assert.deepEqual(
      [...STAGING_R01_FIXTURE_SECRET_KEYS].sort(),
      Object.keys(SYNTHETIC_SECRET).sort(),
    );
    assert.deepEqual(STAGING_R01_FORBIDDEN_ENV_KEYS, [
      ...STAGING_R01_FIXTURE_SECRET_KEYS,
      'STAGING_R01_STUDENT_ANDROID_EMAIL',
      'STAGING_R01_STUDENT_IOS_EMAIL',
      'STAGING_R01_STUDENT_WEB_EMAIL',
    ]);
    for (const name of STAGING_R01_FORBIDDEN_ENV_KEYS) {
      const sentinel = `sentinel-environment-secret-${name}`;
      let captured: unknown;
      try {
        validateStagingR01OperatorControls({ ...cleanEnvironment, [name]: sentinel }, 'bootstrap');
      } catch (error) {
        captured = error;
      }
      assert.ok(isFailure('R01_FIXTURE_SECRET_ENV_FORBIDDEN')(captured));
      const safeError = String(captured);
      const safeStdout = JSON.stringify(buildSafeStagingR01Failure('bootstrap', captured));
      assert.doesNotMatch(safeError, new RegExp(sentinel, 'u'));
      assert.doesNotMatch(safeStdout, new RegExp(sentinel, 'u'));
      assert.match(safeStdout, /"failureCode":"R01_FIXTURE_SECRET_ENV_FORBIDDEN"/u);
    }
  });

  it('accepts only the exact TLS-protected staging runtime database boundary', () => {
    assert.doesNotThrow(() =>
      validateStagingR01RuntimeBoundary(
        runtimeConfig(
          'postgresql://sports_staging_app:synthetic@10.0.0.10:5432/sports_staging_pg_01?schema=public&sslmode=verify-full&sslaccept=strict',
        ),
      ),
    );
    assert.throws(
      () =>
        validateStagingR01RuntimeBoundary(
          runtimeConfig(
            'postgresql://sports_staging_app:synthetic@127.0.0.1:5432/sports_staging_pg_01?schema=public&sslmode=verify-full&sslaccept=strict',
          ),
        ),
      isFailure('R01_STAGING_DATABASE_BOUNDARY_MISMATCH'),
    );
    assert.throws(
      () =>
        validateStagingR01RuntimeBoundary(
          runtimeConfig(
            'postgresql://sports_staging_app:synthetic@10.0.0.10:5432/sports_staging_pg_01?schema=public&sslmode=disable',
          ),
        ),
      isFailure('R01_STAGING_DATABASE_BOUNDARY_MISMATCH'),
    );
  });

  it('builds a result containing only safe aliases, counts and component labels', () => {
    const outcome: StagingR01FixtureOutcome = {
      status: 'CREATED',
      createdComponents: ['organization', 'adminUser'],
      counts: {
        managedUsers: 3,
        adminUsers: 2,
        teacherUsers: 1,
        studentUsers: 0,
        interactiveAccounts: 2,
        internalSupportAccounts: 1,
        adminProfiles: 2,
        teacherProfiles: 1,
        studentProfiles: 0,
        reservedStudentProfiles: 0,
        authSessions: 0,
        enrollments: 0,
      },
      state: {
        organizationId: '00000000-0000-0000-0000-000000000001',
        adminUserId: '00000000-0000-0000-0000-000000000002',
        teacherUserId: '00000000-0000-0000-0000-000000000003',
        teacherProfileId: '00000000-0000-0000-0000-000000000004',
        semesterId: '00000000-0000-0000-0000-000000000005',
        courseId: '00000000-0000-0000-0000-000000000006',
        classSectionId: '00000000-0000-0000-0000-000000000007',
        scoreRuleId: '00000000-0000-0000-0000-000000000008',
      },
    };
    const result = buildSafeStagingR01Result(outcome);
    assert.deepEqual(result.aliases, STAGING_R01_SAFE_ALIASES);
    const serialized = JSON.stringify(result);
    for (const value of Object.values(SYNTHETIC_SECRET)) {
      assert.doesNotMatch(serialized, new RegExp(value.replaceAll('.', '\\.')));
    }
    assert.doesNotMatch(serialized, /00000000-0000-0000-0000-/u);
    assert.match(serialized, /"studentUsersCreatedByProvisioner":0/u);
    assert.match(serialized, /"studentProfilesCreatedByProvisioner":0/u);
    assert.match(serialized, /"authSessionsCreatedByProvisioner":0/u);
    assert.match(serialized, /"enrollmentsCreatedByProvisioner":0/u);
  });
});
