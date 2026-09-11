import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ApplicationError } from '../../src/common/errors/application-error.js';
import { Prisma } from '../../src/generated/prisma/client.js';
import { projectStudentScore } from '../../src/modules/scores/application/score-projection.js';
import {
  applyApprovedAdjustments,
  calculateScore,
} from '../../src/modules/scores/domain/score-calculation.js';

describe('Stage 18 Score domain', () => {
  it('matches every frozen formula boundary with HALF_UP rounding and a hard cap', () => {
    const vectors = [
      [0n, 'NOT_QUALIFIED', 0n, 0n, '0.00'],
      [1n, 'NOT_QUALIFIED', 1n, 0n, '0.00'],
      [3599n, 'NOT_QUALIFIED', 3599n, 0n, '5.00'],
      [3600n, 'NOT_QUALIFIED', 3600n, 0n, '5.00'],
      [7199n, 'NOT_QUALIFIED', 7199n, 0n, '10.00'],
      [7200n, 'NOT_QUALIFIED', 7200n, 0n, '10.00'],
      [36_000n, 'NOT_QUALIFIED', 36_000n, 0n, '50.00'],
      [71_999n, 'NOT_QUALIFIED', 71_999n, 0n, '99.99'],
      [72_000n, 'QUALIFIED', 72_000n, 0n, '100.00'],
      [72_001n, 'QUALIFIED', 72_000n, 1n, '100.00'],
      [90_000n, 'QUALIFIED', 72_000n, 18_000n, '100.00'],
      [144_000n, 'QUALIFIED', 72_000n, 72_000n, '100.00'],
    ] as const;
    for (const [seconds, qualification, scoring, excess, final] of vectors) {
      const result = calculateScore(seconds);
      assert.equal(result.qualificationStatus, qualification);
      assert.equal(result.scoringSeconds, scoring);
      assert.equal(result.excessSeconds, excess);
      assert.equal(result.finalScore.toFixed(2), final);
    }
    assert.throws(() => calculateScore(-1n), RangeError);
  });

  it('applies approved adjustments in immutable chronological order and rejects overflow', () => {
    const adjusted = applyApprovedAdjustments(new Prisma.Decimal('50.00'), [
      { adjustmentType: 'FINAL_SCORE_DELTA', adjustmentValue: new Prisma.Decimal('5.555') },
      { adjustmentType: 'FINAL_SCORE_REPLACEMENT', adjustmentValue: new Prisma.Decimal('80.00') },
      { adjustmentType: 'FINAL_SCORE_DELTA', adjustmentValue: new Prisma.Decimal('-0.005') },
    ]);
    assert.equal(adjusted.toFixed(2), '80.00');
    assert.throws(
      () =>
        applyApprovedAdjustments(new Prisma.Decimal('99.00'), [
          { adjustmentType: 'FINAL_SCORE_DELTA', adjustmentValue: new Prisma.Decimal('2.00') },
        ]),
      RangeError,
    );
  });

  it('denies student access to legacy course score projections under V8.1', () => {
    const now = new Date('2026-08-04T00:00:00.000Z');
    const revision = {
      id: 'revision-1',
      organizationId: 'organization-1',
      studentScoreId: 'score-1',
      scoreRuleId: 'rule-1',
      calculationRevision: 1,
      totalValidCreditedSeconds: 3600n,
      scoringSeconds: 3600n,
      excessSeconds: 0n,
      qualificationStatus: 'NOT_QUALIFIED',
      calculatedScore: new Prisma.Decimal('5.00'),
      adjustedScore: new Prisma.Decimal('5.00'),
      finalScore: new Prisma.Decimal('5.00'),
      sourceFingerprint: 'a'.repeat(64),
      status: 'CALCULATED',
      calculatedAt: now,
      createdAt: now,
      contributions: [
        {
          id: 'contribution-1',
          organizationId: 'organization-1',
          studentScoreRevisionId: 'revision-1',
          recordId: 'record-1',
          reviewId: 'review-1',
          scoreRuleId: 'rule-1',
          creditType: 'COURSE_RELATED',
          contributionSeconds: 3600n,
          createdAt: now,
        },
      ],
    };
    assert.throws(() => projectStudentScore(
      {
        id: 'score-1',
        organizationId: 'organization-1',
        semesterId: 'semester-1',
        classSectionId: 'section-1',
        studentId: 'student-1',
        enrollmentId: 'enrollment-1',
        currentWorkingRevisionId: 'revision-1',
        publishedRevisionId: null,
        createdAt: now,
        updatedAt: now,
        version: 2,
        currentWorkingRevision: revision,
        publishedRevision: null,
        publicationEvents: [],
      },
      {
        userId: 'student-user',
        organizationId: 'organization-1',
        role: 'STUDENT',
        sessionId: 'session-1',
        tokenVersion: 0,
        jti: 'jti-1',
      },
    ), (error: unknown) => error instanceof ApplicationError && error.code === 'PERMISSION_RESOURCE_SCOPE_DENIED');

  });
});
