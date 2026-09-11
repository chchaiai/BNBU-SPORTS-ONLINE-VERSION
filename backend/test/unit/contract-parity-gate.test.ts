import assert from 'node:assert/strict';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { describe, it } from 'node:test';

import 'reflect-metadata';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants.js';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  ApplicationError,
  applicationErrorFromSnapshot,
} from '../../src/common/errors/application-error.js';
import { ERROR_CODE_LIFECYCLE } from '../../src/common/errors/error-http-status.js';
import { RosterEntryListQueryDto } from '../../src/modules/roster/interface/http/roster.dto.js';
import { UpdateStudentRequestDto } from '../../src/modules/users/users.dto.js';
import { ClientCapabilitiesController } from '../../src/modules/client-capabilities/client-capabilities.controller.js';

function runParity(...arguments_: string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, ['./scripts/check-contract-parity.mjs', ...arguments_], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}

describe('Contract 1.3 parity regression gate', () => {
  it('detects the six required synthetic mismatch scenarios', () => {
    const result = runParity('--self-test');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /PASS \(6 scenarios\)/);
  });

  it('accepts the repository only with the frozen, explicit contract-defect ledger', () => {
    const result = runParity();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Contract parity: PASS/);
    assert.match(
      result.stdout,
      /Frozen 1\.3 contract defects: 0 \(staticExceptions=0, semanticLimitations=0\)/,
    );
  });

  it('enforces the canonical HTTP status at runtime and when restoring snapshots', () => {
    assert.throws(
      () => new ApplicationError('AUTH_ACCOUNT_DISABLED', 401),
      /must use canonical HTTP status 403/,
    );
    const restored = applicationErrorFromSnapshot({
      code: 'AUTH_ACCOUNT_DISABLED',
      status: 401,
      message: 'historical snapshot',
      details: {},
    });
    assert.equal(restored.status, 403);
    assert.equal(ERROR_CODE_LIFECYCLE.AUTH_ACCOUNT_DISABLED, 'runtime');
    assert.equal(ERROR_CODE_LIFECYCLE.USER_STATUS_NOT_ACTIVE, 'runtime');
    assert.equal(ERROR_CODE_LIFECYCLE.AUDIT_RETENTION_POLICY_REQUIRED, 'reserved');
    assert.equal(Object.keys(ERROR_CODE_LIFECYCLE).length, 154);
  });

  it('pins both location POST handlers to the published 200 success status', () => {
    for (const methodName of [
      'appendExerciseLocationSamples',
      'finalizeExerciseLocationTrack',
    ] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(
        ClientCapabilitiesController.prototype,
        methodName,
      );
      assert.ok(descriptor);
      const method = descriptor.value as object;
      assert.equal(Reflect.getMetadata(HTTP_CODE_METADATA, method), 200);
    }
  });

  it('rejects the removed search alias and accepts the contract q parameter', async () => {
    const legacy = plainToInstance(RosterEntryListQueryDto, { search: 'student' });
    const legacyErrors = await validate(legacy, { whitelist: true, forbidNonWhitelisted: true });
    assert.ok(legacyErrors.some((error) => error.property === 'search'));

    const contract = plainToInstance(RosterEntryListQueryDto, { q: 'student' });
    assert.deepEqual(await validate(contract, { whitelist: true, forbidNonWhitelisted: true }), []);
  });

  it('rejects contract-external and null gender values while allowing omission', async () => {
    for (const gender of ['UNSPECIFIED', null]) {
      const input = plainToInstance(UpdateStudentRequestDto, { gender, expectedVersion: 1 });
      const errors = await validate(input, { whitelist: true, forbidNonWhitelisted: true });
      assert.ok(errors.some((error) => error.property === 'gender'));
    }

    const omitted = plainToInstance(UpdateStudentRequestDto, { expectedVersion: 1 });
    assert.deepEqual(await validate(omitted, { whitelist: true, forbidNonWhitelisted: true }), []);
  });
});
