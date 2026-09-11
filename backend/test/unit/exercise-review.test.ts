import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ApplicationError } from '../../src/common/errors/application-error.js';
import { normalizeReviewDecision } from '../../src/modules/exercise-reviews/domain/exercise-review.js';

describe('ExerciseReview domain rules', () => {
  it('normalizes a valid decision without inventing credited duration', () => {
    assert.deepEqual(
      normalizeReviewDecision({
        result: 'VALID',
        reason: '  evidence accepted  ',
        publicComment: '  good  ',
        internalNote: '   ',
      }),
      {
        result: 'VALID',
        reasonCode: null,
        reason: 'evidence accepted',
        publicComment: 'good',
        internalNote: null,
      },
    );
  });

  it('requires an approved invalid reason and nonblank OTHER detail', () => {
    for (const input of [
      { result: 'INVALID' as const },
      { result: 'INVALID' as const, reasonCode: 'OTHER' as const, reason: '   ' },
    ]) {
      assert.throws(
        () => normalizeReviewDecision(input),
        (error: unknown) =>
          error instanceof ApplicationError && error.code === 'REVIEW_INVALID_REASON_REQUIRED',
      );
    }
  });

  it('rejects reason codes on VALID decisions', () => {
    assert.throws(
      () => normalizeReviewDecision({ result: 'VALID', reasonCode: 'INVALID_MEDIA' }),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'REVIEW_CHANGE_NOT_ALLOWED',
    );
  });
});
