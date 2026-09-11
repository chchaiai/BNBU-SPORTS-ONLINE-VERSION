import { PrismaPg } from '@prisma/adapter-pg';
import { argon2id, hash } from 'argon2';
import { v7 as uuidv7 } from 'uuid';

import { PrismaClient } from '../../src/generated/prisma/client.js';
import { TEST_PASSWORD } from './test-environment.js';

export interface FoundationFixture {
  organizationId: string;
  isolationOrganizationId: string;
  adminUserId: string;
  teacherUserId: string;
  teacherProfileId: string;
  teacherEmail: string;
  teacherBUserId: string;
  teacherBProfileId: string;
  teacherBEmail: string;
  teacherCUserId: string;
  teacherCProfileId: string;
  teacherCEmail: string;
  adminEmail: string;
  semesterId: string;
  archivedSemesterId: string;
  isolationSemesterId: string;
  activeCourseId: string;
  secondActiveCourseId: string;
  inactiveCourseId: string;
  isolationCourseId: string;
  teacherAActiveSectionId: string;
  teacherAClosedSectionId: string;
  teacherBActiveSectionId: string;
  teacherBArchivedSectionId: string;
  teacherCSectionId: string;
}

export function createTestPrisma(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

export async function resetFoundationDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      rate_limit_windows,
      location_retention_events,
      location_summaries,
      location_sample_secrets,
      location_samples,
      location_track_events,
      location_tracks,
      location_consent_events,
      location_consents,
      location_privacy_policies,
      sport_catalog_items,
      exemption_application_media,
      exemption_review_records,
      exemption_application_events,
      exemption_applications,
      feedback_events,
      feedback,
      help_articles,
      user_preference_events,
      user_preferences,
      push_device_events,
      push_devices,
      notification_events,
      notifications,
      app_release_policies,
      auth_rate_limit_facts,
      email_verification_challenges,
      account_recovery_challenges,
      student_sign_in_challenges,
      review_records,
      exercise_record_events,
      exercise_record_daily_slots,
      exercise_record_media,
      exercise_records,
      media_processing_attempts,
      media_status_events,
      media_upload_sessions,
      media_evidence,
      exercise_session_events,
      exercise_session_segments,
      exercise_sessions,
      roster_resolution_events,
      roster_alignment_results,
      roster_alignment_platform_entries,
      roster_alignment_runs,
      official_roster_entries,
      official_roster_imports,
      join_capabilities,
      enrollment_status_events,
      enrollments,
      course_invites,
      class_section_excluded_dates,
      class_sections,
      courses,
      outbox_events,
      audit_logs,
      idempotency_records,
      semesters,
      refresh_tokens,
      auth_sessions,
      system_policies,
      admin_profiles,
      teacher_profiles,
      student_profiles,
      users,
      organizations
    RESTART IDENTITY CASCADE
  `);
}

export async function seedFoundationFixture(prisma: PrismaClient, namespace = ''): Promise<FoundationFixture> {
  const now = new Date('2026-08-02T12:00:00.000Z');
  const passwordHash = await hash(TEST_PASSWORD, { type: argon2id });
  const organizationId = uuidv7();
  const isolationOrganizationId = uuidv7();
  const adminUserId = uuidv7();
  const teacherUserId = uuidv7();
  const teacherProfileId = uuidv7();
  const teacherBUserId = uuidv7();
  const teacherBProfileId = uuidv7();
  const teacherCUserId = uuidv7();
  const teacherCProfileId = uuidv7();
  const semesterId = uuidv7();
  const archivedSemesterId = uuidv7();
  const isolationSemesterId = uuidv7();
  const activeCourseId = uuidv7();
  const secondActiveCourseId = uuidv7();
  const inactiveCourseId = uuidv7();
  const isolationCourseId = uuidv7();
  const teacherAActiveSectionId = uuidv7();
  const teacherAClosedSectionId = uuidv7();
  const teacherBActiveSectionId = uuidv7();
  const teacherBArchivedSectionId = uuidv7();
  const teacherCSectionId = uuidv7();
  const emailNamespace = namespace.toLowerCase();
  const adminEmail = `admin.e2e.synthetic${emailNamespace}@bnbu.invalid`;
  const teacherEmail = `teacher.a.e2e.synthetic${emailNamespace}@bnbu.invalid`;
  const teacherBEmail = `teacher.b.e2e.synthetic${emailNamespace}@bnbu.invalid`;
  const teacherCEmail = `teacher.c.e2e.synthetic${emailNamespace}@isolation.invalid`;

  await prisma.$transaction(async (transaction) => {
    await transaction.organization.createMany({
      data: [
        {
          id: organizationId,
          organizationCode: `BNBU-TEST${namespace}`,
          legalName: 'BNBU Synthetic Test Organization',
          displayName: 'BNBU Synthetic Test',
          timezone: 'Asia/Shanghai',
          defaultLocale: 'zh-CN',
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: isolationOrganizationId,
          organizationCode: `ISOLATION-TEST${namespace}`,
          legalName: 'Synthetic Isolation Test Organization',
          displayName: 'Synthetic Isolation Test',
          timezone: 'Asia/Shanghai',
          defaultLocale: 'zh-CN',
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    await transaction.user.createMany({
      data: [
        {
          id: adminUserId,
          organizationId,
          role: 'ADMIN',
          status: 'ACTIVE',
          primaryEmail: adminEmail,
          primaryEmailNormalized: adminEmail,
          emailVerifiedAt: now,
          passwordHash,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: teacherUserId,
          organizationId,
          role: 'TEACHER',
          status: 'ACTIVE',
          primaryEmail: teacherEmail,
          primaryEmailNormalized: teacherEmail,
          emailVerifiedAt: now,
          passwordHash,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: teacherBUserId,
          organizationId,
          role: 'TEACHER',
          status: 'ACTIVE',
          primaryEmail: teacherBEmail,
          primaryEmailNormalized: teacherBEmail,
          emailVerifiedAt: now,
          passwordHash,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: teacherCUserId,
          organizationId: isolationOrganizationId,
          role: 'TEACHER',
          status: 'ACTIVE',
          primaryEmail: teacherCEmail,
          primaryEmailNormalized: teacherCEmail,
          emailVerifiedAt: now,
          passwordHash,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    await transaction.adminProfile.create({
      data: {
        id: uuidv7(),
        organizationId,
        userId: adminUserId,
        employeeNumber: 'SYNTH-ADMIN-A',
        fullName: 'Synthetic Test Admin A',
        departmentName: 'Synthetic Test Office',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
    });
    await transaction.teacherProfile.createMany({
      data: [
        {
          id: teacherProfileId,
          organizationId,
          userId: teacherUserId,
          employeeNumber: 'SYNTH-TEACHER-A',
          fullName: 'Synthetic Test Teacher A',
          collegeName: 'Synthetic Test College',
          departmentName: 'Synthetic Physical Education',
          title: 'Synthetic Instructor',
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: teacherBProfileId,
          organizationId,
          userId: teacherBUserId,
          employeeNumber: 'SYNTH-TEACHER-B',
          fullName: 'Synthetic Test Teacher B',
          collegeName: 'Synthetic Test College',
          departmentName: 'Synthetic Physical Education',
          title: 'Synthetic Instructor',
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: teacherCProfileId,
          organizationId: isolationOrganizationId,
          userId: teacherCUserId,
          employeeNumber: 'SYNTH-TEACHER-C',
          fullName: 'Synthetic Test Teacher C',
          collegeName: 'Synthetic Isolation College',
          departmentName: 'Synthetic Isolation Department',
          title: 'Synthetic Instructor',
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    await transaction.systemPolicy.createMany({
      data: [
        {
          organizationId,
          systemMode: 'NORMAL',
          changedBy: adminUserId,
          changeReason: 'Synthetic E2E fixture',
          updatedAt: now,
        },
        {
          organizationId: isolationOrganizationId,
          systemMode: 'NORMAL',
          changedBy: teacherCUserId,
          changeReason: 'Synthetic E2E isolation fixture',
          updatedAt: now,
        },
      ],
    });
    await transaction.semester.createMany({
      data: [
        {
          id: semesterId,
          organizationId,
          academicYear: '2026-2027',
          termCode: 'FIRST',
          displayName: 'Synthetic Current Semester',
          startDate: new Date('2026-08-01T00:00:00.000Z'),
          endDate: new Date('2027-01-31T00:00:00.000Z'),
          status: 'CURRENT',
          createdBy: adminUserId,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: archivedSemesterId,
          organizationId,
          academicYear: '2025-2026',
          termCode: 'SECOND',
          displayName: 'Synthetic Archived Semester',
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          endDate: new Date('2026-07-31T00:00:00.000Z'),
          status: 'ARCHIVED',
          createdBy: adminUserId,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: isolationSemesterId,
          organizationId: isolationOrganizationId,
          academicYear: '2026-2027',
          termCode: 'FIRST',
          displayName: 'Synthetic Isolation Current Semester',
          startDate: new Date('2026-08-01T00:00:00.000Z'),
          endDate: new Date('2027-01-31T00:00:00.000Z'),
          status: 'CURRENT',
          createdBy: teacherCUserId,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    await transaction.course.createMany({
      data: [
        {
          id: activeCourseId,
          organizationId,
          courseCode: 'SYNTH-PE-101',
          courseName: 'Synthetic Active Course 1',
          description: 'Synthetic test data',
          status: 'ACTIVE',
          createdBy: adminUserId,
          updatedBy: adminUserId,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: secondActiveCourseId,
          organizationId,
          courseCode: 'SYNTH-PE-102',
          courseName: 'Synthetic Active Course 2',
          description: 'Synthetic test data',
          status: 'ACTIVE',
          createdBy: adminUserId,
          updatedBy: adminUserId,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: inactiveCourseId,
          organizationId,
          courseCode: 'SYNTH-PE-103',
          courseName: 'Synthetic Inactive Course 3',
          description: 'Synthetic test data',
          status: 'INACTIVE',
          createdBy: adminUserId,
          updatedBy: adminUserId,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: isolationCourseId,
          organizationId: isolationOrganizationId,
          courseCode: 'SYNTH-ISO-101',
          courseName: 'Synthetic Isolation Course',
          description: 'Synthetic isolation data',
          status: 'ACTIVE',
          createdBy: teacherCUserId,
          updatedBy: teacherCUserId,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    await transaction.classSection.createMany({
      data: [
        {
          id: teacherAActiveSectionId,
          organizationId,
          courseId: activeCourseId,
          semesterId,
          teacherId: teacherProfileId,
          classCode: 'SYNTH-A-01',
          displayName: 'Synthetic Teacher A Active Section',
          status: 'ACTIVE',
          isEnrollmentOpen: false,
          checkInWindowMode: 'UNAVAILABLE',
          createdBy: teacherUserId,
          updatedBy: teacherUserId,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: teacherAClosedSectionId,
          organizationId,
          courseId: secondActiveCourseId,
          semesterId,
          teacherId: teacherProfileId,
          classCode: 'SYNTH-A-02',
          displayName: 'Synthetic Teacher A Closed Section',
          status: 'CLOSED',
          isEnrollmentOpen: false,
          checkInWindowMode: 'UNAVAILABLE',
          createdBy: teacherUserId,
          updatedBy: teacherUserId,
          createdAt: now,
          updatedAt: now,
          closedAt: now,
          closedBy: teacherUserId,
          closeReason: 'Synthetic fixture closed state',
        },
        {
          id: teacherBActiveSectionId,
          organizationId,
          courseId: activeCourseId,
          semesterId,
          teacherId: teacherBProfileId,
          classCode: 'SYNTH-B-01',
          displayName: 'Synthetic Teacher B Active Section',
          status: 'ACTIVE',
          isEnrollmentOpen: false,
          checkInWindowMode: 'UNAVAILABLE',
          createdBy: teacherBUserId,
          updatedBy: teacherBUserId,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: teacherBArchivedSectionId,
          organizationId,
          courseId: secondActiveCourseId,
          semesterId: archivedSemesterId,
          teacherId: teacherBProfileId,
          classCode: 'SYNTH-B-ARCH',
          displayName: 'Synthetic Teacher B Archived Section',
          status: 'ARCHIVED',
          isEnrollmentOpen: false,
          checkInWindowMode: 'UNAVAILABLE',
          createdBy: teacherBUserId,
          updatedBy: teacherBUserId,
          createdAt: now,
          updatedAt: now,
          closedAt: now,
          closedBy: teacherBUserId,
          closeReason: 'Synthetic fixture archived state',
        },
        {
          id: teacherCSectionId,
          organizationId: isolationOrganizationId,
          courseId: isolationCourseId,
          semesterId: isolationSemesterId,
          teacherId: teacherCProfileId,
          classCode: 'SYNTH-C-01',
          displayName: 'Synthetic Teacher C Isolation Section',
          status: 'ACTIVE',
          isEnrollmentOpen: false,
          checkInWindowMode: 'UNAVAILABLE',
          createdBy: teacherCUserId,
          updatedBy: teacherCUserId,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
  });

  return {
    organizationId,
    isolationOrganizationId,
    adminUserId,
    teacherUserId,
    teacherProfileId,
    teacherEmail,
    teacherBUserId,
    teacherBProfileId,
    teacherBEmail,
    teacherCUserId,
    teacherCProfileId,
    teacherCEmail,
    adminEmail,
    semesterId,
    archivedSemesterId,
    isolationSemesterId,
    activeCourseId,
    secondActiveCourseId,
    inactiveCourseId,
    isolationCourseId,
    teacherAActiveSectionId,
    teacherAClosedSectionId,
    teacherBActiveSectionId,
    teacherBArchivedSectionId,
    teacherCSectionId,
  };
}
