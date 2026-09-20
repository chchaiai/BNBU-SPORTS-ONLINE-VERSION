import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ExerciseRecordsService} from '../../src/modules/exercise-records/application/exercise-records.service.js';
import {ApplicationError} from '../../src/common/errors/application-error.js';
import {readyProfileDatabase} from '../helpers/profile-policy.js';

for (const transient of [true, false]) {
  test(`submission ${transient ? 'releases a transient failure for retry' : 'retains a permanent failure for replay'}`, async () => {
    const error = transient
      ? new ApplicationError('SYSTEM_SERVICE_UNAVAILABLE', 503, {dependency: 'CREDIT_COMPUTATION'})
      : new ApplicationError('EXERCISE_RECORD_DURATION_NOT_CREDITABLE', 422);
    let storedFailures = 0;
    const transaction = {
      ...readyProfileDatabase(),
      $executeRaw: async () => 0,
      exerciseRecord: {findUnique: async () => {throw error;}},
    };
    const service = Object.create(ExerciseRecordsService.prototype) as ExerciseRecordsService;
    Object.assign(service, {idempotency: {
      execute: async (_options: unknown, action: (tx: unknown) => Promise<unknown>) => action(transaction),
      failure: (value: unknown) => {storedFailures++; return value;},
    }});
    const invoke = () => service.submit(
      {role: 'STUDENT', organizationId: 'org', userId: 'student'} as never,
      {organizationId: 'org', studentUserId: 'student', recordId: 'record', enrollmentId: 'enrollment'} as never,
      {mediaIds: [], expectedVersion: 1},
      {idempotencyKey: 'same-key', requestId: 'synthetic'} as never,
    );
    if (transient) {
      await assert.rejects(invoke, (received) => received === error);
      await assert.rejects(invoke, (received) => received === error);
      assert.equal(storedFailures, 0);
    } else {
      assert.equal(await invoke(), error);
      assert.equal(storedFailures, 1);
    }
  });
}
