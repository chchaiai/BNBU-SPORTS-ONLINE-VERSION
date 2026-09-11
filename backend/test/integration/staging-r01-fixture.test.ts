import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { argon2id, hash } from 'argon2';
import { v7 as uuidv7 } from 'uuid';

import type { PrismaClient } from '../../src/generated/prisma/client.js';
import {
  ensureStagingR01Fixture,
  STAGING_R01_CLASS_SECTION_CODE,
  STAGING_R01_COURSE_CODE,
  STAGING_R01_FIXTURE_AUDIT_ACTION,
  STAGING_R01_FIXTURE_PERMISSION_ID,
  STAGING_R01_ORGANIZATION_CODE,
  STAGING_R01_SAFE_ALIASES,
  StagingR01ProvisioningFailure,
  type StagingR01FixtureSecret,
} from '../../src/tools/staging-r01-fixture.js';
import { createTestPrisma, resetFoundationDatabase } from '../helpers/database.js';
import { requireTestDatabaseUrl } from '../helpers/test-environment.js';

const FIXTURE_SECRET: StagingR01FixtureSecret = {
  adminAccount: 'admin.r01@integration.invalid',
  adminPassword: 'Synthetic-R01-Admin-Integration-2026',
  teacherAccount: 'teacher.r01@integration.invalid',
  teacherPassword: 'Synthetic-R01-Teacher-Integration-2026',
};

function isFailure(code: string): (error: unknown) => boolean {
  return (error) =>
    error instanceof StagingR01ProvisioningFailure && error.code === code && error.message === code;
}

describe('staging R01 fixture PostgreSQL integration', () => {
  let prisma: PrismaClient;

  before(() => {
    prisma = createTestPrisma(requireTestDatabaseUrl());
  });

  beforeEach(async () => {
    await resetFoundationDatabase(prisma);
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it('creates only the isolated staff topology once and verifies it without Student side effects', async () => {
    const now = new Date();
    const phase12Organization = await prisma.organization.create({
      data: {
        id: uuidv7(),
        organizationCode: 'STAGING-BUSINESS-SYNTHETIC',
        legalName: 'Phase 12 Synthetic Organization',
        displayName: 'Phase 12 Synthetic',
        timezone: 'Asia/Shanghai',
        defaultLocale: 'zh-CN',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
    });

    const created = await ensureStagingR01Fixture(prisma, FIXTURE_SECRET);
    assert.equal(created.status, 'CREATED');
    assert.equal(created.createdComponents.length, 14);
    assert.deepEqual(created.counts, {
      managedUsers: 3,
      adminUsers: 2,
      teacherUsers: 1,
      studentUsers: 0,
      interactiveAccounts: 2,
      internalSupportAccounts: 1,
      adminProfiles: 2,
      teacherProfiles: 1,
      studentProfiles: 0,
      reservedStudentProfiles: 0,
      authSessions: 0,
      enrollments: 0,
    });
    assert.notEqual(created.state.organizationId, phase12Organization.id);
    assert.deepEqual(
      new Set(created.createdComponents),
      new Set([
        'organization',
        'adminUser',
        'adminProfile',
        'internalApprovalUser',
        'internalApprovalProfile',
        'teacherUser',
        'teacherProfile',
        'systemPolicy',
        'semester',
        'course',
        'classSection',
        'scoreRule',
        'scoreRuleApproval1',
        'scoreRuleApproval2',
      ]),
    );

    const organization = await prisma.organization.findUniqueOrThrow({
      where: { organizationCode: STAGING_R01_ORGANIZATION_CODE },
    });
    assert.equal(organization.id, created.state.organizationId);
    assert.equal(await prisma.user.count({ where: { organizationId: organization.id } }), 3);
    assert.equal(
      await prisma.user.count({
        where: { organizationId: organization.id, primaryEmailNormalized: { not: null } },
      }),
      2,
    );
    assert.equal(
      await prisma.studentProfile.count({ where: { organizationId: organization.id } }),
      0,
    );
    assert.deepEqual(
      (
        await prisma.studentProfile.findMany({
          where: { organizationId: organization.id },
          orderBy: { studentNumber: 'asc' },
          select: { studentNumber: true },
        })
      ).map((profile) => profile.studentNumber),
      [],
    );
    assert.equal(
      await prisma.user.count({ where: { organizationId: organization.id, role: 'STUDENT' } }),
      0,
    );
    assert.equal(await prisma.authSession.count({ where: { organizationId: organization.id } }), 0);
    assert.equal(await prisma.enrollment.count({ where: { organizationId: organization.id } }), 0);

    const course = await prisma.course.findUniqueOrThrow({
      where: {
        organizationId_courseCode: {
          organizationId: organization.id,
          courseCode: STAGING_R01_COURSE_CODE,
        },
      },
    });
    const section = await prisma.classSection.findUniqueOrThrow({
      where: { id: created.state.classSectionId },
    });
    assert.equal(section.courseId, course.id);
    assert.equal(section.classCode, STAGING_R01_CLASS_SECTION_CODE);
    assert.equal(section.teacherId, created.state.teacherProfileId);
    assert.equal(section.isEnrollmentOpen, true);
    assert.equal(section.status, 'ACTIVE');

    const internalApprover = await prisma.adminProfile.findUniqueOrThrow({
      where: {
        organizationId_employeeNumber: {
          organizationId: organization.id,
          employeeNumber: 'R01-INTERNAL-APPROVER',
        },
      },
      include: { user: true },
    });
    assert.equal(internalApprover.user.primaryEmail, null);
    assert.equal(internalApprover.user.passwordHash, null);
    assert.equal(
      await prisma.scoreRuleApprovalEvent.count({
        where: { scoreRuleId: created.state.scoreRuleId, action: 'APPROVE' },
      }),
      2,
    );

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        organizationId: organization.id,
        permissionId: STAGING_R01_FIXTURE_PERMISSION_ID,
        actionType: STAGING_R01_FIXTURE_AUDIT_ACTION,
      },
    });
    const metadata = JSON.stringify(audit.safeMetadata);
    assert.match(metadata, /STAGING_R01_MANUAL_TESTING/u);
    for (const value of [
      FIXTURE_SECRET.adminAccount,
      FIXTURE_SECRET.adminPassword,
      FIXTURE_SECRET.teacherAccount,
      FIXTURE_SECRET.teacherPassword,
    ])
      assert.equal(metadata.includes(value), false);

    const countsBeforeReplay = {
      users: await prisma.user.count(),
      studentProfiles: await prisma.studentProfile.count(),
      authSessions: await prisma.authSession.count(),
      enrollments: await prisma.enrollment.count(),
      approvals: await prisma.scoreRuleApprovalEvent.count(),
      auditLogs: await prisma.auditLog.count(),
    };
    const verified = await ensureStagingR01Fixture(prisma, FIXTURE_SECRET);
    assert.equal(verified.status, 'VERIFIED');
    assert.deepEqual(verified.createdComponents, []);
    assert.deepEqual(verified.state, created.state);
    assert.deepEqual(
      {
        users: await prisma.user.count(),
        studentProfiles: await prisma.studentProfile.count(),
        authSessions: await prisma.authSession.count(),
        enrollments: await prisma.enrollment.count(),
        approvals: await prisma.scoreRuleApprovalEvent.count(),
        auditLogs: await prisma.auditLog.count(),
      },
      countsBeforeReplay,
    );
  });

  it('fails atomically when an existing BNBU organization has conflicting metadata', async () => {
    const now = new Date();
    await prisma.organization.create({
      data: {
        id: uuidv7(),
        organizationCode: STAGING_R01_ORGANIZATION_CODE,
        legalName: 'Unexpected Existing Organization',
        displayName: 'Unexpected Existing Organization',
        timezone: 'Asia/Shanghai',
        defaultLocale: 'zh-CN',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
    });

    await assert.rejects(
      ensureStagingR01Fixture(prisma, FIXTURE_SECRET),
      isFailure('R01_FIXTURE_ORGANIZATION_CONFLICT'),
    );
    assert.equal(await prisma.user.count(), 0);
    assert.equal(await prisma.course.count(), 0);
    assert.equal(await prisma.classSection.count(), 0);
    assert.equal(await prisma.auditLog.count(), 0);
  });

  for (const reservedStudentNumber of STAGING_R01_SAFE_ALIASES.reservedStudentNumbers) {
    it(`fails closed and rolls back when reserved Student ${reservedStudentNumber} already exists`, async () => {
      const now = new Date();
      const organizationId = uuidv7();
      const studentUserId = uuidv7();
      await prisma.organization.create({
        data: {
          id: organizationId,
          organizationCode: STAGING_R01_ORGANIZATION_CODE,
          legalName: 'BNBU Sports R01 Synthetic Staging Organization',
          displayName: 'BNBU Sports R01 Staging',
          timezone: 'Asia/Shanghai',
          defaultLocale: 'zh-CN',
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        },
      });
      await prisma.user.create({
        data: {
          id: studentUserId,
          organizationId,
          role: 'STUDENT',
          status: 'ACTIVE',
          primaryEmail: null,
          primaryEmailNormalized: null,
          emailVerifiedAt: null,
          passwordHash: null,
          createdAt: now,
          updatedAt: now,
        },
      });
      await prisma.studentProfile.create({
        data: {
          id: uuidv7(),
          organizationId,
          userId: studentUserId,
          studentNumber: reservedStudentNumber,
          fullName: 'Pre-existing Reserved R01 Student',
          gender: 'FEMALE',
          gradeYear: 2026,
          collegeName: 'R01 Conflict College',
          majorName: 'R01 Conflict Major',
          administrativeClassName: 'R01 Conflict Class',
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
          deletedAt: reservedStudentNumber === 'STUDENT-IOS-01' ? now : null,
        },
      });
      const countsBeforeConflict = {
        users: await prisma.user.count(),
        adminProfiles: await prisma.adminProfile.count(),
        teacherProfiles: await prisma.teacherProfile.count(),
        studentProfiles: await prisma.studentProfile.count(),
        authSessions: await prisma.authSession.count(),
        enrollments: await prisma.enrollment.count(),
        courses: await prisma.course.count(),
        classSections: await prisma.classSection.count(),
        approvals: await prisma.scoreRuleApprovalEvent.count(),
        auditLogs: await prisma.auditLog.count(),
      };

      await assert.rejects(
        ensureStagingR01Fixture(prisma, FIXTURE_SECRET),
        isFailure('R01_FIXTURE_RESERVED_STUDENT_CONFLICT'),
      );
      assert.deepEqual(
        {
          users: await prisma.user.count(),
          adminProfiles: await prisma.adminProfile.count(),
          teacherProfiles: await prisma.teacherProfile.count(),
          studentProfiles: await prisma.studentProfile.count(),
          authSessions: await prisma.authSession.count(),
          enrollments: await prisma.enrollment.count(),
          courses: await prisma.course.count(),
          classSections: await prisma.classSection.count(),
          approvals: await prisma.scoreRuleApprovalEvent.count(),
          auditLogs: await prisma.auditLog.count(),
        },
        countsBeforeConflict,
      );
    });
  }

  it('rejects an extra identity and rolls back all attempted fixture writes', async () => {
    const now = new Date();
    const organizationId = uuidv7();
    const extraAdminUserId = uuidv7();
    await prisma.organization.create({
      data: {
        id: organizationId,
        organizationCode: STAGING_R01_ORGANIZATION_CODE,
        legalName: 'BNBU Sports R01 Synthetic Staging Organization',
        displayName: 'BNBU Sports R01 Staging',
        timezone: 'Asia/Shanghai',
        defaultLocale: 'zh-CN',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
    });
    await prisma.user.create({
      data: {
        id: extraAdminUserId,
        organizationId,
        role: 'ADMIN',
        status: 'ACTIVE',
        primaryEmail: null,
        primaryEmailNormalized: null,
        emailVerifiedAt: null,
        passwordHash: null,
        createdAt: now,
        updatedAt: now,
      },
    });
    await prisma.adminProfile.create({
      data: {
        id: uuidv7(),
        organizationId,
        userId: extraAdminUserId,
        employeeNumber: 'R01-UNEXPECTED-ADMIN',
        fullName: 'Unexpected R01 Admin',
        departmentName: 'Unexpected R01 Department',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
    });
    const countsBeforeConflict = {
      users: await prisma.user.count(),
      adminProfiles: await prisma.adminProfile.count(),
      teacherProfiles: await prisma.teacherProfile.count(),
      studentProfiles: await prisma.studentProfile.count(),
      authSessions: await prisma.authSession.count(),
      enrollments: await prisma.enrollment.count(),
      courses: await prisma.course.count(),
      classSections: await prisma.classSection.count(),
      scoreRules: await prisma.scoreRule.count(),
      approvals: await prisma.scoreRuleApprovalEvent.count(),
      auditLogs: await prisma.auditLog.count(),
    };

    await assert.rejects(
      ensureStagingR01Fixture(prisma, FIXTURE_SECRET),
      isFailure('R01_FIXTURE_IDENTITY_COUNT_CONFLICT'),
    );
    assert.deepEqual(
      {
        users: await prisma.user.count(),
        adminProfiles: await prisma.adminProfile.count(),
        teacherProfiles: await prisma.teacherProfile.count(),
        studentProfiles: await prisma.studentProfile.count(),
        authSessions: await prisma.authSession.count(),
        enrollments: await prisma.enrollment.count(),
        courses: await prisma.course.count(),
        classSections: await prisma.classSection.count(),
        scoreRules: await prisma.scoreRule.count(),
        approvals: await prisma.scoreRuleApprovalEvent.count(),
        auditLogs: await prisma.auditLog.count(),
      },
      countsBeforeConflict,
    );
  });

  it('rejects any existing AuthSession with a dedicated conflict', async () => {
    const created = await ensureStagingR01Fixture(prisma, FIXTURE_SECRET);
    const now = new Date();
    await prisma.authSession.create({
      data: {
        id: uuidv7(),
        organizationId: created.state.organizationId,
        userId: created.state.adminUserId,
        deviceIdHash: null,
        status: 'ACTIVE',
        tokenFamilyId: uuidv7(),
        createdAt: now,
        lastSeenAt: now,
        absoluteExpiresAt: new Date(now.getTime() + 3_600_000),
        idleExpiresAt: new Date(now.getTime() + 600_000),
        revokedAt: null,
        revokeReasonCode: null,
        version: 1,
      },
    });
    const countsBeforeConflict = {
      users: await prisma.user.count(),
      authSessions: await prisma.authSession.count(),
      auditLogs: await prisma.auditLog.count(),
    };

    await assert.rejects(
      ensureStagingR01Fixture(prisma, FIXTURE_SECRET),
      isFailure('R01_FIXTURE_AUTH_SESSION_CONFLICT'),
    );
    assert.deepEqual(
      {
        users: await prisma.user.count(),
        authSessions: await prisma.authSession.count(),
        auditLogs: await prisma.auditLog.count(),
      },
      countsBeforeConflict,
    );
  });

  it('rejects any existing Enrollment with a dedicated conflict before identity counts', async () => {
    const created = await ensureStagingR01Fixture(prisma, FIXTURE_SECRET);
    const now = new Date();
    const studentUserId = uuidv7();
    const studentProfileId = uuidv7();
    await prisma.user.create({
      data: {
        id: studentUserId,
        organizationId: created.state.organizationId,
        role: 'STUDENT',
        status: 'ACTIVE',
        primaryEmail: null,
        primaryEmailNormalized: null,
        emailVerifiedAt: null,
        passwordHash: null,
        createdAt: now,
        updatedAt: now,
      },
    });
    await prisma.studentProfile.create({
      data: {
        id: studentProfileId,
        organizationId: created.state.organizationId,
        userId: studentUserId,
        studentNumber: 'R01-UNEXPECTED-STUDENT',
        fullName: 'Unexpected R01 Student',
        gender: 'FEMALE',
        gradeYear: 2026,
        collegeName: 'R01 Conflict College',
        majorName: 'R01 Conflict Major',
        administrativeClassName: 'R01 Conflict Class',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
    });
    await prisma.enrollment.create({
      data: {
        id: uuidv7(),
        organizationId: created.state.organizationId,
        semesterId: created.state.semesterId,
        classSectionId: created.state.classSectionId,
        studentId: studentProfileId,
        source: 'QR_CODE',
        sourceReferenceId: uuidv7(),
        status: 'ACTIVE',
        joinedAt: now,
        endedAt: null,
        endReason: null,
        createdBy: studentUserId,
        updatedBy: studentUserId,
        createdAt: now,
        updatedAt: now,
        version: 1,
      },
    });
    const countsBeforeConflict = {
      users: await prisma.user.count(),
      studentProfiles: await prisma.studentProfile.count(),
      enrollments: await prisma.enrollment.count(),
      auditLogs: await prisma.auditLog.count(),
    };

    await assert.rejects(
      ensureStagingR01Fixture(prisma, FIXTURE_SECRET),
      isFailure('R01_FIXTURE_ENROLLMENT_CONFLICT'),
    );
    assert.deepEqual(
      {
        users: await prisma.user.count(),
        studentProfiles: await prisma.studentProfile.count(),
        enrollments: await prisma.enrollment.count(),
        auditLogs: await prisma.auditLog.count(),
      },
      countsBeforeConflict,
    );
  });

  it('rejects a cross-role Profile and rolls back earlier fixture writes', async () => {
    const now = new Date();
    const organizationId = uuidv7();
    const teacherUserId = uuidv7();
    await prisma.organization.create({
      data: {
        id: organizationId,
        organizationCode: STAGING_R01_ORGANIZATION_CODE,
        legalName: 'BNBU Sports R01 Synthetic Staging Organization',
        displayName: 'BNBU Sports R01 Staging',
        timezone: 'Asia/Shanghai',
        defaultLocale: 'zh-CN',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
    });
    await prisma.user.create({
      data: {
        id: teacherUserId,
        organizationId,
        role: 'TEACHER',
        status: 'ACTIVE',
        primaryEmail: FIXTURE_SECRET.teacherAccount,
        primaryEmailNormalized: FIXTURE_SECRET.teacherAccount,
        emailVerifiedAt: now,
        passwordHash: await hash(FIXTURE_SECRET.teacherPassword, { type: argon2id }),
        createdAt: now,
        updatedAt: now,
      },
    });
    await prisma.$transaction(async (transaction) => {
      // Seed a deliberately corrupted legacy row so the fixture's own fail-closed check is tested
      // independently of the Foundation profile trigger.
      await transaction.$executeRaw`SET LOCAL session_replication_role = replica`;
      await transaction.adminProfile.create({
        data: {
          id: uuidv7(),
          organizationId,
          userId: teacherUserId,
          employeeNumber: 'R01-MIXED-ROLE-PROFILE',
          fullName: 'R01 Synthetic Mixed Role Conflict',
          departmentName: 'R01 Synthetic Conflict',
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        },
      });
    });
    const countsBeforeConflict = {
      users: await prisma.user.count(),
      adminProfiles: await prisma.adminProfile.count(),
      teacherProfiles: await prisma.teacherProfile.count(),
      studentProfiles: await prisma.studentProfile.count(),
      courses: await prisma.course.count(),
      classSections: await prisma.classSection.count(),
      auditLogs: await prisma.auditLog.count(),
    };

    await assert.rejects(
      ensureStagingR01Fixture(prisma, FIXTURE_SECRET),
      isFailure('R01_FIXTURE_TEACHER_PROFILE_CONFLICT'),
    );
    assert.deepEqual(
      {
        users: await prisma.user.count(),
        adminProfiles: await prisma.adminProfile.count(),
        teacherProfiles: await prisma.teacherProfile.count(),
        studentProfiles: await prisma.studentProfile.count(),
        courses: await prisma.course.count(),
        classSections: await prisma.classSection.count(),
        auditLogs: await prisma.auditLog.count(),
      },
      countsBeforeConflict,
    );
  });

  it('rejects a changed password without rotating or overwriting the existing account', async () => {
    const created = await ensureStagingR01Fixture(prisma, FIXTURE_SECRET);
    const existing = await prisma.user.findUniqueOrThrow({
      where: { id: created.state.adminUserId },
      select: { passwordHash: true, version: true },
    });
    await assert.rejects(
      ensureStagingR01Fixture(prisma, {
        ...FIXTURE_SECRET,
        adminPassword: 'Synthetic-R01-Changed-Admin-Password-2026',
      }),
      isFailure('R01_FIXTURE_ADMIN_CONFLICT_PASSWORD'),
    );
    assert.deepEqual(
      await prisma.user.findUniqueOrThrow({
        where: { id: created.state.adminUserId },
        select: { passwordHash: true, version: true },
      }),
      existing,
    );
  });
});
