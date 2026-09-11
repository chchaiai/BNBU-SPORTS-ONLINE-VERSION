import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ApplicationError } from '../../src/common/errors/application-error.js';
import {
  assertCreditableDuration,
  creditedDuration,
  normalizeRecordContent,
} from '../../src/modules/exercise-records/domain/exercise-record.js';

describe('ExerciseRecord domain rules', () => {
  it('applies V8.1 selectable thresholds, whole minutes and the 60-minute credit cap', () => {
    for (const minimum of [30, 45, 60]) {
      const boundary = BigInt(minimum * 60);
      assert.equal(creditedDuration(boundary - 1n, minimum), 0n);
      assert.equal(creditedDuration(boundary, minimum), boundary);
      assert.equal(creditedDuration(boundary + 59n, minimum), boundary);
      assert.equal(creditedDuration(4800n, minimum), 3600n);
    }
    assert.equal(creditedDuration(2100n), 2100n);
    assert.equal(assertCreditableDuration(1799n), 0n);
    for (const [seconds, minimum] of [[-1n, 30], [3600n, 35]] as const) {
      assert.throws(() => creditedDuration(seconds, minimum),
        (error: unknown) => error instanceof ApplicationError && error.code === 'EXERCISE_RECORD_DURATION_NOT_CREDITABLE');
    }
  });

  it('normalizes optional content without inventing a second sport taxonomy', () => {
    assert.deepEqual(
      normalizeRecordContent({
        creditType: 'GENERAL',
        sportType: 'RUNNING',
        sportName: null,
        description: '  Synthetic run  ',
      }),
      {
        creditType: 'GENERAL',
        sportType: 'RUNNING',
        sportName: null,
        description: 'Synthetic run',
      },
    );
    assert.deepEqual(
      normalizeRecordContent({
        creditType: 'COURSE_RELATED',
        sportType: 'BADMINTON',
        description: '   ',
      }),
      {
        creditType: 'COURSE_RELATED',
        sportType: 'BADMINTON',
        sportName: null,
        description: null,
      },
    );
    assert.throws(
      () =>
        normalizeRecordContent({
          creditType: 'GENERAL',
          sportType: 'RUNNING',
          description: null,
        }),
      (error: unknown) => error instanceof ApplicationError && error.code === 'VALIDATION_FAILED',
    );
    assert.throws(
      () =>
        normalizeRecordContent({
          creditType: 'GENERAL',
          sportType: 'OTHER',
          description: 'Synthetic exercise',
        }),
      (error: unknown) => error instanceof ApplicationError && error.code === 'VALIDATION_FAILED',
    );
    assert.throws(
      () =>
        normalizeRecordContent({
          creditType: 'GENERAL',
          sportType: 'RUNNING',
          sportName: 'forged subtype',
          description: 'Synthetic exercise',
        }),
      (error: unknown) => error instanceof ApplicationError && error.code === 'VALIDATION_FAILED',
    );
  });
});
