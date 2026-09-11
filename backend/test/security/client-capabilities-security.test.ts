import 'reflect-metadata';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { REDACTED_VALUE, redactSensitive } from '../../src/common/logging/redaction.js';
import { operationPolicies } from '../../src/generated/operation-policies.generated.js';
import {
  AppendLocationSamplesRequestDto,
  AccountRecoveryRequestDto,
  ClientPlatformQueryDto,
  FeedbackClientContextDto,
  PushDeviceRegistrationRequestDto,
  StudentSignInCodeRequestDto,
} from '../../src/modules/client-capabilities/client-capabilities.dto.js';

describe('Stage 21 client capability security', () => {
  it('keeps locally integrated client capabilities inside their approved principal scope', () => {
    for (const operationId of [
      'listNotifications',
      'markNotificationRead',
      'registerPushDevice',
      'unregisterPushDevice',
      'getCurrentUserPreferences',
      'updateCurrentUserPreferences',
      'createFeedback',
    ] as const) {
      const policy = operationPolicies[operationId];
      assert.equal(policy.authentication, 'ACCESS_TOKEN');
      assert.deepEqual(policy.allowedRoles, ['STUDENT', 'TEACHER', 'ADMIN']);
      assert.equal(policy.organizationScope, 'PRINCIPAL_ORGANIZATION');
      assert.equal(policy.resourceScope, 'SELF');
      assert.equal(policy.resourceResolver, 'PRINCIPAL_USER');
    }

    for (const operationId of ['listFeedback', 'getFeedback'] as const) {
      const policy = operationPolicies[operationId];
      assert.equal(policy.authentication, 'ACCESS_TOKEN');
      assert.deepEqual(policy.allowedRoles, ['STUDENT', 'TEACHER', 'ADMIN']);
      assert.equal(policy.organizationScope, 'PRINCIPAL_ORGANIZATION');
      assert.equal(policy.resourceScope, 'ROLE_SCOPED');
      assert.equal(policy.resourceResolver, 'NONE');
    }

    for (const operationId of [
      'listHelpArticles',
      'getHelpArticle',
      'getAppReleasePolicy',
    ] as const) {
      const policy = operationPolicies[operationId];
      assert.equal(policy.authentication, 'PUBLIC');
      assert.deepEqual(policy.allowedRoles, []);
      assert.equal(policy.organizationScope, 'NONE');
      assert.equal(policy.resourceScope, 'NONE');
      assert.equal(policy.resourceResolver, 'NONE');
    }
  });

  it('redacts authentication, push, and location secrets recursively', () => {
    const redacted = redactSensitive({
      challengeId: 'challenge-id',
      code: '123456',
      verificationCode: '654321',
      registrationToken: 'apns-token',
      registrationTokenHash: 'token-hash',
      registrationTokenCiphertext: 'token-ciphertext',
      samples: [
        {
          latitude: 22.3,
          longitude: 114.2,
          accuracyMeters: 10,
        },
      ],
      safe: 'visible',
    }) as Record<string, unknown>;

    assert.equal(redacted.code, REDACTED_VALUE);
    assert.equal(redacted.verificationCode, REDACTED_VALUE);
    assert.equal(redacted.registrationToken, REDACTED_VALUE);
    assert.equal(redacted.registrationTokenHash, REDACTED_VALUE);
    assert.equal(redacted.registrationTokenCiphertext, REDACTED_VALUE);
    assert.equal(redacted.samples, REDACTED_VALUE);
    assert.equal(redacted.safe, 'visible');
  });

  it('accepts only EMAIL for student sign-in and staff recovery requests', async () => {
    const studentPhone = plainToInstance(StudentSignInCodeRequestDto, {
      organizationCode: 'BNBU',
      account: 'student@example.edu',
      channel: 'PHONE',
      locale: 'zh-CN',
    });
    const recoveryPhone = plainToInstance(AccountRecoveryRequestDto, {
      organizationCode: 'BNBU',
      account: 'teacher@example.edu',
      requestedRole: 'TEACHER',
      channel: 'PHONE',
      locale: 'en',
    });
    assert.ok((await validate(studentPhone)).length > 0);
    assert.ok((await validate(recoveryPhone)).length > 0);

    const studentEmail = plainToInstance(StudentSignInCodeRequestDto, {
      organizationCode: 'BNBU',
      account: 'student@example.edu',
      channel: 'EMAIL',
      locale: 'zh-CN',
    });
    assert.deepEqual(await validate(studentEmail), []);
  });

  it('binds every GPS mutation to a student-owned existing ExerciseSession', () => {
    for (const operationId of [
      'startExerciseLocationTrack',
      'appendExerciseLocationSamples',
      'finalizeExerciseLocationTrack',
    ] as const) {
      const policy = operationPolicies[operationId];
      assert.deepEqual(policy.allowedRoles, ['STUDENT']);
      assert.equal(policy.organizationScope, 'PRINCIPAL_ORGANIZATION');
      assert.equal(policy.resourceScope, 'SELF');
      assert.equal(policy.resourceResolver, 'EXERCISE_SESSION_FROM_PATH');
    }
  });

  it('uses record scope for summaries and reserves privacy-policy mutation for ADMIN', () => {
    const summary = operationPolicies.getExerciseRecordLocationSummary;
    assert.deepEqual(summary.allowedRoles, ['STUDENT', 'TEACHER', 'ADMIN']);
    assert.equal(summary.resourceScope, 'ROLE_SCOPED');
    assert.equal(summary.resourceResolver, 'EXERCISE_RECORD_FROM_PATH');

    const updatePolicy = operationPolicies.updateLocationPrivacyPolicy;
    assert.deepEqual(updatePolicy.allowedRoles, ['ADMIN']);
    assert.equal(updatePolicy.resourceScope, 'ORGANIZATION');
    assert.equal(updatePolicy.resourceResolver, 'PRINCIPAL_ORGANIZATION');
  });

  it('rejects out-of-range coordinates and more than one bounded batch', async () => {
    const invalidCoordinate = plainToInstance(AppendLocationSamplesRequestDto, {
      samples: [
        {
          sampleId: '0198c74b-7dc0-7000-8000-000000000011',
          observedAt: '2026-08-05T12:00:00Z',
          latitude: 100,
          longitude: 200,
          accuracyMeters: 10,
        },
      ],
      expectedVersion: 1,
    });
    assert.ok((await validate(invalidCoordinate)).length > 0);

    const oversized = plainToInstance(AppendLocationSamplesRequestDto, {
      samples: Array.from({ length: 101 }, (_, index) => ({
        sampleId: `0198c74b-7dc0-7000-8000-${String(index).padStart(12, '0')}`,
        observedAt: '2026-08-05T12:00:00Z',
        latitude: 22.3,
        longitude: 114.2,
        accuracyMeters: 10,
      })),
      expectedVersion: 1,
    });
    assert.ok((await validate(oversized)).length > 0);
  });

  it('accepts Android, Web, and iOS while rejecting unknown client platforms', async () => {
    for (const platform of ['ANDROID', 'WEB', 'IOS']) {
      const push = plainToInstance(PushDeviceRegistrationRequestDto, {
        platform,
        registrationToken: 'synthetic-registration-token',
        appVersion: '1.0.0',
        locale: 'zh-CN',
      });
      const feedback = plainToInstance(FeedbackClientContextDto, { platform });
      const releasePolicy = plainToInstance(ClientPlatformQueryDto, { platform });
      assert.deepEqual(await validate(push), []);
      assert.deepEqual(await validate(feedback), []);
      assert.deepEqual(await validate(releasePolicy), []);
    }

    for (const value of [
      plainToInstance(PushDeviceRegistrationRequestDto, {
        platform: 'WINDOWS',
        registrationToken: 'synthetic-registration-token',
        appVersion: '1.0.0',
        locale: 'zh-CN',
      }),
      plainToInstance(FeedbackClientContextDto, { platform: 'WINDOWS' }),
      plainToInstance(ClientPlatformQueryDto, { platform: 'WINDOWS' }),
    ]) {
      assert.ok((await validate(value)).length > 0);
    }
  });
});
