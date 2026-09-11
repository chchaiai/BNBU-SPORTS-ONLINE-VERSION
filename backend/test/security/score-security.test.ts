import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { operationPolicies } from '../../src/generated/operation-policies.generated.js';
import { isSafeScoreEvidenceReference } from '../../src/modules/scores/domain/score-evidence.js';
import {
  CreateScoreAdjustmentRequestDto,
  CreateScoreRuleRequestDto,
  ExpectedVersionRequestDto,
  ScoreApprovalRequestDto,
} from '../../src/modules/scores/interface/http/scores.dto.js';

describe('Stage 18 Score security', () => {
  it('strips forged score facts and identity from rule, approval, and recalculate requests', async () => {
    const rule = plainToInstance(CreateScoreRuleRequestDto, {
      ruleCode: 'FIXED_V1',
      displayName: 'Fixed score rule',
      organizationId: 'attacker',
      createdBy: 'attacker',
      totalRequiredSeconds: 1,
      calculationDefinition: { formula: 'attacker' },
      status: 'ACTIVE',
      finalScore: 100,
    });
    assert.equal((await validate(rule, { whitelist: true })).length, 0);
    for (const field of [
      'organizationId',
      'createdBy',
      'totalRequiredSeconds',
      'calculationDefinition',
      'status',
      'finalScore',
    ]) {
      assert.equal(Object.hasOwn(rule, field), false);
    }

    const approval = plainToInstance(ScoreApprovalRequestDto, {
      expectedVersion: 2,
      actorUserId: 'attacker',
      adminId: 'attacker',
      organizationId: 'attacker',
    });
    assert.equal((await validate(approval, { whitelist: true })).length, 0);
    assert.deepEqual(Object.keys(approval), ['expectedVersion', 'reason']);
    assert.equal(approval.reason, undefined);

    const recalculate = plainToInstance(ExpectedVersionRequestDto, {
      expectedVersion: 3,
      sourceFingerprint: 'a'.repeat(64),
      finalScore: 100,
      studentId: 'attacker',
    });
    assert.equal((await validate(recalculate, { whitelist: true })).length, 0);
    assert.deepEqual(Object.keys(recalculate), ['expectedVersion']);
  });

  it('accepts only bounded adjustment inputs and rejects URL or script evidence injection', async () => {
    const valid = plainToInstance(CreateScoreAdjustmentRequestDto, {
      expectedVersion: 2,
      adjustmentType: 'FINAL_SCORE_DELTA',
      adjustmentValue: 1.25,
      reasonCode: 'VERIFIED_DATA_ERROR',
      reason: 'Synthetic verified correction',
      evidenceReference: 'audit:case/SYNTH-001',
      requestedBy: 'attacker',
      studentId: 'attacker',
      finalScore: 100,
    });
    assert.equal((await validate(valid, { whitelist: true })).length, 0);
    for (const field of ['requestedBy', 'studentId', 'finalScore']) {
      assert.equal(Object.hasOwn(valid, field), false);
    }
    for (const evidenceReference of [
      'https://attacker.invalid/secret',
      'javascript:alert(1)',
      '../private/key',
      '<script>alert(1)</script>',
    ]) {
      const injected = plainToInstance(CreateScoreAdjustmentRequestDto, {
        ...valid,
        evidenceReference,
      });
      const validationErrors = await validate(injected, { whitelist: true });
      assert.equal(
        validationErrors.length > 0 || !isSafeScoreEvidenceReference(evidenceReference),
        true,
      );
    }
  });

  it('keeps every score operation fail-closed with the frozen role boundary', () => {
    const roles = [
      ['createScoreRule', ['ADMIN']],
      ['approveScoreRule', ['ADMIN']],
      ['createScoreAdjustment', ['TEACHER']],
      ['approveScoreAdjustment', ['ADMIN']],
      ['openStudentScoreCorrection', ['TEACHER']],
    ] as const;
    for (const [operationId, allowedRoles] of roles) {
      const policy = operationPolicies[operationId];
      assert.ok(policy);
      assert.equal(policy.defaultDeny, true);
      assert.deepEqual(policy.allowedRoles, allowedRoles);
    }
  });
});
