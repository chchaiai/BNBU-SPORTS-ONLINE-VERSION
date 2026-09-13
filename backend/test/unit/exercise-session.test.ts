import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ApplicationError } from '../../src/common/errors/application-error.js';
import type { ExerciseSession } from '../../src/generated/prisma/client.js';
import { projectExerciseSession } from '../../src/modules/exercise-sessions/application/exercise-session-projection.js';
import {
  assertTransition,
  cappedRunningDuration,
  EXERCISE_SESSION_STATUSES,
  projectedPausedDuration,
  SESSION_DURATION_CAP_SECONDS,
  wholeSeconds,
} from '../../src/modules/exercise-sessions/domain/exercise-session.js';
import { totalValidCreditedSeconds } from '../../src/modules/scores/application/score-source.js';
import { SCORE_THRESHOLD_SECONDS } from '../../src/modules/scores/domain/score-calculation.js';

const at = (seconds: number): Date => new Date(Date.UTC(2026, 7, 4, 0, 0, seconds));

function errorCode(code: string): (error: unknown) => boolean {
  return (error) => error instanceof ApplicationError && error.code === code;
}

function session(overrides: Partial<ExerciseSession> = {}): ExerciseSession {
  return {
    id: '0197d460-a737-7b2e-8cec-a3c9a41337b4',
    organizationId: '0197d460-a737-7b2e-8cec-a3c9a41337b5',
    studentId: '0197d460-a737-7b2e-8cec-a3c9a41337b6',
    enrollmentId: '0197d460-a737-7b2e-8cec-a3c9a41337b7',
    classSectionId: '0197d460-a737-7b2e-8cec-a3c9a41337b8',
    semesterId: '0197d460-a737-7b2e-8cec-a3c9a41337b9',
    startedByAuthSessionId: '0197d460-a737-7b2e-8cec-a3c9a41337ba',
    status: 'IN_PROGRESS',
    startedAt: at(0),
    businessDate: new Date('2026-08-04T00:00:00.000Z'),
    completedAt: null,
    cancelledAt: null,
    expiredAt: null,
    endReason: null,
    actualDurationSeconds: 0n,
    maximumDurationSeconds: null,
    pausedDurationSeconds: 0n,
    currentIntervalStartedAt: at(0),
    lastHeartbeatAt: at(0),
    createdAt: at(0),
    updatedAt: at(0),
    version: 1,
    ...overrides,
  };
}

describe('ExerciseSession authoritative domain', () => {
  it('stops at the snapshotted limit and excludes paused intervals', () => {
    assert.deepEqual(cappedRunningDuration(20n, at(100), at(139), 60), {
      actualDurationSeconds: 59, reachedCap: false, capAt: at(139),
    });
    for (const observed of [140, 141, 1000]) {
      assert.deepEqual(cappedRunningDuration(20n, at(100), at(observed), 60), {
        actualDurationSeconds: 60, reachedCap: true, capAt: at(140),
      });
    }
    assert.equal(cappedRunningDuration(20n, at(100), at(1000)).actualDurationSeconds, 920);
  });
  it('freezes the five states and every permitted lifecycle transition', () => {
    assert.deepEqual(EXERCISE_SESSION_STATUSES, [
      'IN_PROGRESS',
      'PAUSED',
      'COMPLETED',
      'CANCELLED',
      'EXPIRED',
    ]);
    for (const [from, to] of [
      ['IN_PROGRESS', 'PAUSED'],
      ['IN_PROGRESS', 'COMPLETED'],
      ['IN_PROGRESS', 'CANCELLED'],
      ['PAUSED', 'IN_PROGRESS'],
      ['PAUSED', 'COMPLETED'],
      ['PAUSED', 'CANCELLED'],
    ] as const) {
      assert.doesNotThrow(() => assertTransition(from, to));
    }
  });

  it('rejects terminal and otherwise invalid transitions', () => {
    assert.throws(
      () => assertTransition('COMPLETED', 'IN_PROGRESS'),
      errorCode('SESSION_ALREADY_COMPLETED'),
    );
    for (const [from, to] of [
      ['CANCELLED', 'IN_PROGRESS'],
      ['EXPIRED', 'IN_PROGRESS'],
      ['IN_PROGRESS', 'IN_PROGRESS'],
      ['PAUSED', 'PAUSED'],
    ] as const) {
      assert.throws(() => assertTransition(from, to), errorCode('SESSION_TRANSITION_NOT_ALLOWED'));
    }
  });

  it('uses exact whole server seconds for all boundary vectors', () => {
    for (const seconds of [0, 3599, 3600, 7199, 7200]) {
      assert.equal(wholeSeconds(at(0), at(seconds)), seconds);
      assert.equal(cappedRunningDuration(0n, at(0), at(seconds)).actualDurationSeconds, seconds);
    }
    assert.equal(cappedRunningDuration(7199n, at(0), at(1)).actualDurationSeconds, 7200);
    assert.equal(cappedRunningDuration(7199n, at(0), at(1)).reachedCap, false);
    assert.equal(SESSION_DURATION_CAP_SECONDS, Number.MAX_SAFE_INTEGER);
    assert.throws(() => wholeSeconds(at(1), at(0)), errorCode('SESSION_TIMELINE_INVALID'));
  });

  it('preserves actual running time beyond two hours and rejects unsafe numeric totals', () => {
    const result = cappedRunningDuration(7100n, at(0), at(3600));
    assert.deepEqual(result, {
      actualDurationSeconds: 10700,
      reachedCap: false,
      capAt: at(3600),
    });
    assert.throws(
      () => cappedRunningDuration(BigInt(Number.MAX_SAFE_INTEGER), at(0), at(1)),
      errorCode('SESSION_TIMELINE_INVALID'),
    );
  });

  it('keeps paused time separate from trusted activity time', () => {
    assert.equal(projectedPausedDuration(7n, at(0), at(13)), 20);
    const projection = projectExerciseSession(
      session({
        status: 'PAUSED',
        actualDurationSeconds: 3600n,
        pausedDurationSeconds: 10n,
        currentIntervalStartedAt: at(0),
      }),
      at(20),
    );
    assert.equal(projection.actualDurationSeconds, 3600);
    assert.equal(projection.pausedDurationSeconds, 30);
  });

  it('exposes only the stable public projection and preserves start businessDate', () => {
    const projection = projectExerciseSession(
      session({ actualDurationSeconds: 3599n, currentIntervalStartedAt: at(0) }),
      at(1),
    );
    assert.deepEqual(Object.keys(projection), [
      'id',
      'organizationId',
      'semesterId',
      'studentId',
      'enrollmentId',
      'classSectionId',
      'status',
      'startedAt',
      'endedAt',
      'actualDurationSeconds',
      'maximumDurationSeconds',
      'pausedDurationSeconds',
      'businessDate',
      'lastHeartbeatAt',
      'endReason',
      'version',
    ]);
    assert.equal(projection.actualDurationSeconds, 3600);
    assert.equal(projection.businessDate, '2026-08-04');
    assert.equal(Object.hasOwn(projection, 'currentIntervalStartedAt'), false);
    assert.equal(Object.hasOwn(projection, 'startedByAuthSessionId'), false);
  });

  it('uses the exact VALID credited-duration boundary for new-session admission', () => {
    const sources = (seconds: bigint[]) =>
      seconds.map((creditedDurationSeconds) => ({ record: { creditedDurationSeconds } }));

    assert.equal(totalValidCreditedSeconds(sources([71_999n])), SCORE_THRESHOLD_SECONDS - 1n);
    assert.equal(totalValidCreditedSeconds(sources([36_000n, 36_000n])), SCORE_THRESHOLD_SECONDS);
  });
});
