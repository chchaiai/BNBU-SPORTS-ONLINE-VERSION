import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { v7 as uuidv7 } from 'uuid';

import type { PrismaClient } from '../../src/generated/prisma/client.js';
import {
  ensureCompletedClosureSession,
  ensureStagingBusinessFixture,
  STAGING_BUSINESS_FIXTURE_AUDIT_ACTION,
  STAGING_BUSINESS_FIXTURE_PERMISSION_ID,
  STAGING_BUSINESS_ORGANIZATION_CODE,
  STAGING_BUSINESS_SESSION_REQUEST_ID,
  STAGING_BUSINESS_SESSION_START_REQUEST_ID,
  StagingBusinessOperatorFailure,
  type StagingBusinessFixtureSecret,
} from '../../src/tools/staging-business-fixture.js';
import { createTestPrisma, resetFoundationDatabase } from '../helpers/database.js';
import { requireTestDatabaseUrl } from '../helpers/test-environment.js';

const FIXTURE_SECRET: StagingBusinessFixtureSecret = {
  adminPassword: 'Synthetic-Business-Admin-Only-2026',
  teacherPassword: 'Synthetic-Business-Teacher-Only-2026',
  studentEmail: 'student.business.closure@unit.verityai.cn',
};

function isFailure(code: string): (error: unknown) => boolean {
  return (error) =>
    error instanceof StagingBusinessOperatorFailure &&
    error.code === code &&
    error.message === code;
}

describe('staging business fixture PostgreSQL integration', () => {
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

  async function fixtureTopologyCounts() {
    const [
      organizations,
      users,
      adminProfiles,
      teacherProfiles,
      studentProfiles,
      systemPolicies,
      semesters,
      courses,
      classSections,
      scoreRules,
      scoreRuleApprovals,
      auditLogs,
    ] = await Promise.all([
      prisma.organization.count(),
      prisma.user.count(),
      prisma.adminProfile.count(),
      prisma.teacherProfile.count(),
      prisma.studentProfile.count(),
      prisma.systemPolicy.count(),
      prisma.semester.count(),
      prisma.course.count(),
      prisma.classSection.count(),
      prisma.scoreRule.count(),
      prisma.scoreRuleApprovalEvent.count(),
      prisma.auditLog.count(),
    ]);
    return {
      organizations,
      users,
      adminProfiles,
      teacherProfiles,
      studentProfiles,
      systemPolicies,
      semesters,
      courses,
      classSections,
      scoreRules,
      scoreRuleApprovals,
      auditLogs,
    };
  }

  it('creates the complete fixture once and verifies it without adding rows', async () => {
    const created = await ensureStagingBusinessFixture(prisma, FIXTURE_SECRET);
    assert.equal(created.status, 'CREATED');
    assert.equal(created.createdComponents.length, 16);
    assert.deepEqual(
      new Set(created.createdComponents),
      new Set([
        'organization',
        'adminUser',
        'adminProfile',
        'secondAdminUser',
        'secondAdminProfile',
        'teacherUser',
        'teacherProfile',
        'studentUser',
        'studentProfile',
        'systemPolicy',
        'semester',
        'course',
        'classSection',
        'scoreRule',
        'scoreRuleApproval1',
        'scoreRuleApproval2',
      ]),
    );
    const countsAfterCreate = await fixtureTopologyCounts();
    assert.deepEqual(countsAfterCreate, {
      organizations: 1,
      users: 4,
      adminProfiles: 2,
      teacherProfiles: 1,
      studentProfiles: 1,
      systemPolicies: 1,
      semesters: 1,
      courses: 1,
      classSections: 1,
      scoreRules: 1,
      scoreRuleApprovals: 2,
      auditLogs: 1,
    });

    const verified = await ensureStagingBusinessFixture(prisma, FIXTURE_SECRET);
    assert.equal(verified.status, 'VERIFIED');
    assert.deepEqual(verified.createdComponents, []);
    assert.deepEqual(verified.state, created.state);
    assert.deepEqual(await fixtureTopologyCounts(), countsAfterCreate);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        organizationId: created.state.organizationId,
        permissionId: STAGING_BUSINESS_FIXTURE_PERMISSION_ID,
        actionType: STAGING_BUSINESS_FIXTURE_AUDIT_ACTION,
        targetType: 'USER',
      },
    });
    assert.equal(audit.outcome, 'SUCCEEDED');
    assert.equal(JSON.stringify(audit.safeMetadata).includes('password'), false);
  });

  it('reports a deterministic conflict without changing the conflicting database state', async () => {
    const created = await ensureStagingBusinessFixture(prisma, FIXTURE_SECRET);
    const conflictingDisplayName = 'Conflicting Synthetic Staging Organization';
    await prisma.organization.update({
      where: { id: created.state.organizationId },
      data: { displayName: conflictingDisplayName },
    });
    const countsBeforeConflict = await fixtureTopologyCounts();

    await assert.rejects(
      ensureStagingBusinessFixture(prisma, FIXTURE_SECRET),
      isFailure('BUSINESS_FIXTURE_ORGANIZATION_CONFLICT'),
    );

    assert.deepEqual(await fixtureTopologyCounts(), countsBeforeConflict);
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { organizationCode: STAGING_BUSINESS_ORGANIZATION_CODE },
    });
    assert.equal(organization.displayName, conflictingDisplayName);
  });

  it('creates one completed one-hour session and verifies the same closure on replay', async () => {
    const fixture = await ensureStagingBusinessFixture(prisma, FIXTURE_SECRET);
    const now = new Date();
    const enrollmentId = uuidv7();
    const authSessionId = uuidv7();
    await prisma.enrollment.create({
      data: {
        id: enrollmentId,
        organizationId: fixture.state.organizationId,
        semesterId: fixture.state.semesterId,
        classSectionId: fixture.state.classSectionId,
        studentId: fixture.state.studentProfileId,
        source: 'QR_CODE',
        sourceReferenceId: uuidv7(),
        status: 'ACTIVE',
        joinedAt: now,
        endedAt: null,
        endReason: null,
        createdBy: fixture.state.studentUserId,
        updatedBy: fixture.state.studentUserId,
        createdAt: now,
        updatedAt: now,
        version: 1,
      },
    });
    await prisma.authSession.create({
      data: {
        id: authSessionId,
        organizationId: fixture.state.organizationId,
        userId: fixture.state.studentUserId,
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

    const created = await ensureCompletedClosureSession(prisma, fixture.state, authSessionId);
    assert.equal(created.status, 'CREATED');
    const verified = await ensureCompletedClosureSession(prisma, fixture.state, authSessionId);
    assert.deepEqual(verified, {
      status: 'VERIFIED',
      sessionId: created.sessionId,
      businessDate: created.businessDate,
    });

    const session = await prisma.exerciseSession.findUniqueOrThrow({
      where: { id: created.sessionId },
      include: { segments: true, events: true },
    });
    assert.equal(session.enrollmentId, enrollmentId);
    assert.equal(session.status, 'COMPLETED');
    assert.equal(session.endReason, 'USER_COMPLETED');
    assert.equal(session.actualDurationSeconds, 3600n);
    assert.equal(session.pausedDurationSeconds, 0n);
    assert.equal(session.segments.length, 1);
    assert.equal(session.segments[0]?.acceptedDurationSeconds, 3600n);
    assert.equal(session.version, 2);
    assert.equal(session.events.length, 2);
    const orderedEvents = session.events.toSorted(
      (left, right) => left.eventVersion - right.eventVersion,
    );
    assert.deepEqual(
      orderedEvents.map((event) => ({
        eventVersion: event.eventVersion,
        eventType: event.eventType,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        requestId: event.requestId,
      })),
      [
        {
          eventVersion: 1,
          eventType: 'STARTED',
          fromStatus: null,
          toStatus: 'IN_PROGRESS',
          requestId: STAGING_BUSINESS_SESSION_START_REQUEST_ID,
        },
        {
          eventVersion: 2,
          eventType: 'COMPLETED',
          fromStatus: 'IN_PROGRESS',
          toStatus: 'COMPLETED',
          requestId: STAGING_BUSINESS_SESSION_REQUEST_ID,
        },
      ],
    );

    assert.equal(
      await prisma.exerciseSession.count({
        where: { organizationId: fixture.state.organizationId },
      }),
      1,
    );
    assert.equal(
      await prisma.exerciseSessionEvent.count({
        where: {
          organizationId: fixture.state.organizationId,
          requestId: STAGING_BUSINESS_SESSION_START_REQUEST_ID,
          eventType: 'STARTED',
        },
      }),
      1,
    );
    assert.equal(
      await prisma.exerciseSessionEvent.count({
        where: {
          organizationId: fixture.state.organizationId,
          requestId: STAGING_BUSINESS_SESSION_REQUEST_ID,
          eventType: 'COMPLETED',
        },
      }),
      1,
    );
    assert.equal(
      await prisma.auditLog.count({
        where: {
          organizationId: fixture.state.organizationId,
          requestId: STAGING_BUSINESS_SESSION_REQUEST_ID,
          targetType: 'EXERCISE_SESSION',
          targetId: created.sessionId,
        },
      }),
      1,
    );
  });
});
