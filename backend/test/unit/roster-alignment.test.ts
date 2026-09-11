import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  computeRosterAlignment,
  normalizeRosterFullName,
  normalizeRosterStudentNumber,
  platformSnapshotFingerprint,
  rosterSubjectKey,
  type OfficialAlignmentEntry,
  type PlatformAlignmentEntry,
} from '../../src/modules/roster/domain/roster-alignment-algorithm.js';

const TARGET_SECTION = 'section-target';
const OTHER_SECTION = 'section-other';

function official(
  studentNumber: string,
  overrides: Partial<OfficialAlignmentEntry> = {},
): OfficialAlignmentEntry {
  return {
    id: `official-${studentNumber.trim()}`,
    normalizedStudentNumber: studentNumber,
    fullName: `Student ${studentNumber.trim()}`,
    gender: 'OTHER',
    gradeYear: 2026,
    ...overrides,
  };
}

function platform(
  studentNumber: string,
  classSectionId = TARGET_SECTION,
  overrides: Partial<PlatformAlignmentEntry> = {},
): PlatformAlignmentEntry {
  const suffix = `${studentNumber.trim()}-${classSectionId}`;
  return {
    id: `platform-${suffix}`,
    enrollmentId: `enrollment-${suffix}`,
    studentId: `student-${suffix}`,
    classSectionId,
    normalizedStudentNumber: studentNumber,
    fullName: `Student ${studentNumber.trim()}`,
    gender: 'OTHER',
    gradeYear: 2026,
    ...overrides,
  };
}

describe('Stage 13 deterministic roster alignment', () => {
  it('classifies every subject into exactly one of the six frozen outcomes', () => {
    const officialEntries = [
      official('0001'),
      official('0002'),
      official('0004'),
      official('0005', { fullName: 'Official Name', gender: 'FEMALE', gradeYear: 2025 }),
      official('0006'),
    ];
    const platformEntries = [
      platform('0001'),
      platform('0003'),
      platform('0004', OTHER_SECTION),
      platform('0005', TARGET_SECTION, {
        fullName: 'Platform Name',
        gender: 'MALE',
        gradeYear: 2024,
      }),
      platform('0006'),
      platform('0006', OTHER_SECTION, { id: 'platform-duplicate-0006' }),
    ];

    const computation = computeRosterAlignment({
      organizationId: 'organization-1',
      semesterId: 'semester-1',
      targetClassSectionId: TARGET_SECTION,
      officialEntries,
      platformEntries,
    });
    const byNumber = new Map(
      computation.results.map((result) => [result.normalizedStudentNumber, result]),
    );

    assert.equal(computation.results.length, 6);
    assert.equal(byNumber.get('0001')?.status, 'MATCHED');
    assert.equal(byNumber.get('0002')?.status, 'MISSING_IN_PLATFORM');
    assert.equal(byNumber.get('0003')?.status, 'EXTRA_IN_PLATFORM');
    assert.equal(byNumber.get('0004')?.status, 'WRONG_COURSE');
    assert.equal(byNumber.get('0005')?.status, 'IDENTITY_CONFLICT');
    assert.equal(byNumber.get('0006')?.status, 'DUPLICATED');
    assert.deepEqual(
      byNumber.get('0005')?.differences.map(({ field }) => field),
      ['FULL_NAME', 'GENDER', 'GRADE_YEAR'],
    );
    assert.deepEqual(byNumber.get('0004')?.differences, [
      {
        field: 'CLASS_SECTION',
        officialValue: TARGET_SECTION,
        platformValue: 'OTHER_CLASS_SECTION',
      },
    ]);
    assert.equal(byNumber.get('0006')?.platformEntryId, null);
    assert.deepEqual(
      computation.results.map(({ normalizedStudentNumber }) => normalizedStudentNumber),
      ['0001', '0002', '0003', '0004', '0005', '0006'],
    );
  });

  it('keeps fingerprints, subject keys, normalization, and result order deterministic', () => {
    const officialEntries = [official(' aa-02 '), official('AA-01')];
    const platformEntries = [platform('AA-01'), platform('AA-02')];
    const input = {
      organizationId: 'organization-1',
      semesterId: 'semester-1',
      targetClassSectionId: TARGET_SECTION,
      officialEntries,
      platformEntries,
    };
    const forward = computeRosterAlignment(input);
    const reversed = computeRosterAlignment({
      ...input,
      officialEntries: [...officialEntries].reverse(),
      platformEntries: [...platformEntries].reverse(),
    });

    assert.deepEqual(reversed, forward);
    assert.match(forward.platformSnapshotFingerprint, /^[0-9a-f]{64}$/);
    assert.equal(
      forward.platformSnapshotFingerprint,
      '9ca02b84a51370e13af62cb802f7c78b49db4b03bc1082db4e3cdcef7384f39d',
    );
    assert.equal(
      platformSnapshotFingerprint({
        organizationId: 'organization-1',
        semesterId: 'semester-1',
        entries: [...platformEntries].reverse(),
      }),
      platformSnapshotFingerprint({
        organizationId: 'organization-1',
        semesterId: 'semester-1',
        entries: platformEntries,
      }),
    );
    assert.notEqual(
      platformSnapshotFingerprint({
        organizationId: 'organization-1',
        semesterId: 'semester-1',
        entries: [{ ...platformEntries[0]!, fullName: 'Changed Name' }, platformEntries[1]!],
      }),
      forward.platformSnapshotFingerprint,
    );
    assert.equal(
      platformSnapshotFingerprint({
        organizationId: 'organization-1',
        semesterId: 'semester-1',
        entries: platformEntries.map((entry) => ({ ...entry, id: `new-${entry.id}` })),
      }),
      forward.platformSnapshotFingerprint,
    );
    assert.notEqual(
      platformSnapshotFingerprint({
        organizationId: 'organization-2',
        semesterId: 'semester-1',
        entries: platformEntries,
      }),
      forward.platformSnapshotFingerprint,
    );

    const subject = rosterSubjectKey('organization-1', 'semester-1', 'AA-01');
    assert.match(subject, /^[0-9a-f]{64}$/);
    assert.equal(subject, rosterSubjectKey('organization-1', 'semester-1', 'AA-01'));
    assert.notEqual(subject, rosterSubjectKey('organization-2', 'semester-1', 'AA-01'));
    assert.notEqual(subject, rosterSubjectKey('organization-1', 'semester-2', 'AA-01'));
    assert.notEqual(subject, rosterSubjectKey('organization-1', 'semester-1', 'AA-02'));
    assert.equal(normalizeRosterStudentNumber(' aa-01 '), 'AA-01');
    assert.equal(normalizeRosterFullName(' A\u030A '), 'Å');
  });

  it('classifies official duplicates without merging identities, regardless of input order or platform match', () => {
    const entries = [official('AA-01'), official(' aa-01 ')];
    for (const platformEntries of [[], [platform('AA-01')]]) {
      const input = {organizationId:'organization-1',semesterId:'semester-1',targetClassSectionId:TARGET_SECTION,officialEntries:entries,platformEntries};
      const forward = computeRosterAlignment(input);
      assert.deepEqual(forward, computeRosterAlignment({...input,officialEntries:[...entries].reverse()}));
      assert.equal(forward.results.length,1);
      assert.equal(forward.results[0]!.status,'DUPLICATED');
      assert.equal(forward.results[0]!.enrollmentId,null);
      assert.equal(forward.results[0]!.studentId,null);
    }
  });
});
