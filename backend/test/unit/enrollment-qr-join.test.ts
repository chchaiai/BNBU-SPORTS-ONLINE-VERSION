import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import type { RuntimeConfig } from '../../src/common/config/environment.js';
import { ApplicationError } from '../../src/common/errors/application-error.js';
import { QrJoinCryptoService } from '../../src/common/security/qr-join-crypto.service.js';
import { CourseInviteEntity } from '../../src/modules/course-invites/domain/course-invite.js';
import { EnrollmentEntity } from '../../src/modules/enrollments/domain/enrollment.js';
import { JoinCapabilityEntity } from '../../src/modules/join-capabilities/domain/join-capability.js';
import { IssueJoinCapabilityRequestDto } from '../../src/modules/join-capabilities/interface/http/join-capabilities.dto.js';
import { StudentIdentityNormalizer } from '../../src/modules/users/application/student-identity-normalizer.js';

const NOW = new Date('2026-08-03T12:00:00.000Z');
const ID = '0198795d-9900-7000-8000-000000000001';

function qrCrypto(): QrJoinCryptoService {
  return new QrJoinCryptoService({
    qrJoinTokenHashKey: Buffer.alloc(32, 17),
    qrJoinSecretEncryptionKey: Buffer.alloc(32, 19),
  } as RuntimeConfig);
}

describe('Stage 12 student identity and QR security', () => {
  it('normalizes the student number without losing leading zeros and applies NFC', () => {
    const normalizer = new StudentIdentityNormalizer();
    assert.deepEqual(
      normalizer.normalize({
        fullName: ' Jose\u0301 Synthetic ',
        studentNumber: ' 00ab-12 ',
        gender: 'OTHER',
        gradeYear: 9999,
      }),
      {
        fullName: 'José Synthetic',
        studentNumber: '00AB-12',
        gender: 'OTHER',
        gradeYear: 9999,
      },
    );
  });

  it('narrows QR join gender while accepting the full four-digit cohort range', () => {
    for (const [gender, gradeYear] of [
      ['MALE', 1000],
      ['FEMALE', 2028],
      ['FEMALE', 9999],
    ] as const) {
      const dto = plainToInstance(IssueJoinCapabilityRequestDto, {
        fullName: 'Synthetic',
        studentNumber: '0001',
        gender,
        gradeYear,
      });
      assert.deepEqual(validateSync(dto), []);
    }

    for (const [gender, gradeYear] of [
      ['OTHER', 2026],
      ['UNKNOWN', 2026],
      ['MALE', 999],
      ['FEMALE', 10_000],
      ['MALE', 2026.5],
    ] as const) {
      const dto = plainToInstance(IssueJoinCapabilityRequestDto, {
        fullName: 'Synthetic',
        studentNumber: '0001',
        gender,
        gradeYear,
      });
      assert.notEqual(validateSync(dto).length, 0);
    }
  });

  it('accepts any four-digit cohort year and rejects malformed identity fields', () => {
    const normalizer = new StudentIdentityNormalizer();
    assert.equal(
      normalizer.normalize({
        fullName: 'Synthetic',
        studentNumber: '0001',
        gender: 'MALE',
        gradeYear: 1000,
      }).gradeYear,
      1000,
    );
    assert.equal(
      normalizer.normalize({
        fullName: 'Synthetic',
        studentNumber: '0001',
        gender: 'FEMALE',
        gradeYear: 2028,
      }).gradeYear,
      2028,
    );
    for (const input of [
      { fullName: 'Synthetic', studentNumber: '0001', gender: 'UNKNOWN', gradeYear: 2026 },
      { fullName: 'Synthetic', studentNumber: '0001', gender: 'MALE', gradeYear: 999 },
      { fullName: 'Synthetic', studentNumber: '0001', gender: 'MALE', gradeYear: 10_000 },
      { fullName: 'Synthetic', studentNumber: '0001', gender: 'MALE', gradeYear: 2026.5 },
      { fullName: 'Synthetic', studentNumber: '0001 bad', gender: 'MALE', gradeYear: 2026 },
    ]) {
      assert.throws(
        () => normalizer.normalize(input),
        (error: unknown) =>
          error instanceof ApplicationError && error.code === 'USER_PROFILE_INVALID',
      );
    }
  });

  it('issues public-id plus 256-bit secret tokens and verifies only their HMAC digest', () => {
    const crypto = qrCrypto();
    const issued = crypto.issueToken('course-invite', ID);
    const parsed = crypto.parseToken('course-invite', issued.token);
    assert.notEqual(parsed, null);
    assert.equal(parsed?.publicId, ID);
    assert.equal(crypto.matches(issued.tokenHash, parsed?.tokenHash ?? ''), true);
    assert.equal(issued.token.split('.')[1]?.length, 43);
    assert.equal(
      crypto.parseToken('course-invite', `${issued.token.slice(0, -1)}x`)?.tokenHash ===
        issued.tokenHash,
      false,
    );
    assert.equal(crypto.parseToken('join-capability', 'malformed'), null);
  });

  it('authenticates encrypted identity and result escrows with purpose-bound AAD', () => {
    const crypto = qrCrypto();
    const ciphertext = crypto.encrypt('join-identity-snapshot', ID, {
      studentNumber: '00001234',
    });
    assert.equal(ciphertext.includes('00001234'), false);
    assert.deepEqual(crypto.decrypt('join-identity-snapshot', ID, ciphertext), {
      studentNumber: '00001234',
    });
    assert.throws(
      () => crypto.decrypt('join-result-replay', ID, ciphertext),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'SYSTEM_DATA_INTEGRITY_ERROR',
    );
  });
});

describe('Stage 12 lifecycle entities', () => {
  it('rotates an invite without deleting history', () => {
    const invite = CourseInviteEntity.create({
      id: ID,
      organizationId: '0198795d-9900-7000-8000-000000000002',
      classSectionId: '0198795d-9900-7000-8000-000000000003',
      versionNumber: 1,
      tokenHash: 'a'.repeat(64),
      secretCiphertext: 'ciphertext',
      secretKeyVersion: 1,
      secretReplayExpiresAt: new Date(NOW.getTime() + 60_000),
      createdBy: '0198795d-9900-7000-8000-000000000004',
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + 3_600_000),
    });
    invite.revoke(
      '0198795d-9900-7000-8000-000000000005',
      '0198795d-9900-7000-8000-000000000004',
      new Date(NOW.getTime() + 1_000),
    );
    assert.equal(invite.snapshot().status, 'REVOKED');
    assert.equal(invite.snapshot().rowVersion, 2);
  });

  it('keeps one Enrollment id across remove and restore transitions', () => {
    const enrollment = EnrollmentEntity.create({
      id: ID,
      organizationId: '0198795d-9900-7000-8000-000000000002',
      semesterId: '0198795d-9900-7000-8000-000000000003',
      classSectionId: '0198795d-9900-7000-8000-000000000004',
      studentId: '0198795d-9900-7000-8000-000000000005',
      source: 'MANUAL',
      sourceReferenceId: null,
      joinedAt: NOW,
      createdBy: '0198795d-9900-7000-8000-000000000006',
      updatedBy: '0198795d-9900-7000-8000-000000000006',
      createdAt: NOW,
      updatedAt: NOW,
    });
    enrollment.remove(
      'Synthetic removal',
      '0198795d-9900-7000-8000-000000000006',
      new Date(NOW.getTime() + 1_000),
    );
    assert.equal(enrollment.snapshot().status, 'REMOVED');
    enrollment.activate(
      'Synthetic restore',
      '0198795d-9900-7000-8000-000000000006',
      new Date(NOW.getTime() + 2_000),
    );
    assert.equal(enrollment.snapshot().id, ID);
    assert.equal(enrollment.snapshot().status, 'ACTIVE');
    assert.equal(enrollment.snapshot().version, 3);
  });

  it('issues an ACTIVE capability without any consumed result fields', () => {
    const capability = JoinCapabilityEntity.issue({
      id: ID,
      organizationId: '0198795d-9900-7000-8000-000000000002',
      courseInviteId: '0198795d-9900-7000-8000-000000000003',
      classSectionId: '0198795d-9900-7000-8000-000000000004',
      tokenHash: 'b'.repeat(64),
      secretCiphertext: 'ciphertext',
      secretKeyVersion: 1,
      secretReplayExpiresAt: new Date(NOW.getTime() + 60_000),
      identityFingerprint: 'c'.repeat(64),
      deviceChallengeHash: null,
      encryptedIdentitySnapshot: 'identity-ciphertext',
      identityKeyVersion: 1,
      issuedAt: NOW,
      expiresAt: new Date(NOW.getTime() + 300_000),
      createdRequestId: 'synthetic-request',
    });
    assert.equal(capability.snapshot().status, 'ACTIVE');
    assert.equal(capability.snapshot().enrollmentId, null);
    assert.equal(capability.snapshot().resultCiphertext, null);
  });
});
