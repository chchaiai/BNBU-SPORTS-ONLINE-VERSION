import { createHash, randomBytes } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import { argon2id, hash } from 'argon2';
import { v7 as uuidv7 } from 'uuid';

import { PrismaClient } from '../src/generated/prisma/client.js';
import type { Prisma } from '../src/generated/prisma/client.js';

const SYNTHETIC_ORGANIZATION_CODE = 'BNBU';
const ISOLATION_ORGANIZATION_CODE = 'ISOLATION-TEST';
const SYNTHETIC_ADMIN_EMAIL = 'admin.local.synthetic@bnbu.invalid';
const SYNTHETIC_ADMIN_B_EMAIL = 'admin.b.local.synthetic@bnbu.invalid';
const SYNTHETIC_TEACHER_A_EMAIL = 'teacher.a.local.synthetic@bnbu.invalid';
const SYNTHETIC_TEACHER_B_EMAIL = 'teacher.b.local.synthetic@bnbu.invalid';
const ISOLATION_TEACHER_EMAIL = 'teacher.c.local.synthetic@isolation.invalid';
const SYNTHETIC_ROLE_CONFLICT_EMAIL = 'role.conflict.local.synthetic@bnbu.invalid';
const SYNTHETIC_CLOSURE_STUDENT_EMAIL = 'student.closure.local.synthetic@bnbu.invalid';
const SYNTHETIC_CONCURRENT_STUDENT_NUMBER = 'SYNTH-CONCURRENT-0001';

function requiredLocalSecret(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length < 12 || value.includes('CHANGE_ME')) {
    throw new Error(`${name} must be an explicit local-only value of at least 12 characters`);
  }
  return value;
}

function requireLocalSeedEnvironment(): {
  databaseUrl: string;
  adminPassword: string;
  teacherPassword: string;
} {
  if (process.env.APP_ENV !== 'local') {
    throw new Error('Synthetic seed is restricted to APP_ENV=local');
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl === undefined || databaseUrl.length === 0 || databaseUrl.includes('CHANGE_ME')) {
    throw new Error('DATABASE_URL must identify the isolated local application database');
  }
  return {
    databaseUrl,
    adminPassword: requiredLocalSecret('LOCAL_SEED_ADMIN_PASSWORD'),
    teacherPassword: requiredLocalSecret('LOCAL_SEED_TEACHER_PASSWORD'),
  };
}

async function upsertTeacher(
  transaction: Prisma.TransactionClient,
  input: {
    organizationId: string;
    email: string;
    passwordHash: string;
    employeeNumber: string;
    fullName: string;
    now: Date;
  },
): Promise<{ userId: string; teacherId: string }> {
  const existingProfile = await transaction.teacherProfile.findUnique({
    where: {
      organizationId_employeeNumber: {
        organizationId: input.organizationId,
        employeeNumber: input.employeeNumber,
      },
    },
  });
  const user =
    existingProfile === null
      ? await transaction.user.upsert({
          where: {
            organizationId_primaryEmailNormalized: { emailIdentityScope: 'PRIMARY',
              organizationId: input.organizationId,
              primaryEmailNormalized: input.email,
            },
          },
          create: {
            id: uuidv7(),
            organizationId: input.organizationId,
            role: 'TEACHER',
            status: 'ACTIVE',
            primaryEmail: input.email,
            primaryEmailNormalized: input.email,
            emailVerifiedAt: input.now,
            passwordHash: input.passwordHash,
            createdAt: input.now,
            updatedAt: input.now,
          },
          update: {
            role: 'TEACHER',
            status: 'ACTIVE',
            passwordHash: input.passwordHash,
            deletedAt: null,
            updatedAt: input.now,
          },
        })
      : await transaction.user.update({
          where: { id: existingProfile.userId },
          data: {
            role: 'TEACHER',
            status: 'ACTIVE',
            primaryEmail: input.email,
            primaryEmailNormalized: input.email,
            emailVerifiedAt: input.now,
            passwordHash: input.passwordHash,
            deletedAt: null,
            updatedAt: input.now,
          },
        });
  const profile = await transaction.teacherProfile.upsert({
    where: {
      organizationId_employeeNumber: {
        organizationId: input.organizationId,
        employeeNumber: input.employeeNumber,
      },
    },
    create: {
      id: uuidv7(),
      organizationId: input.organizationId,
      userId: user.id,
      employeeNumber: input.employeeNumber,
      fullName: input.fullName,
      collegeName: 'Synthetic Test College',
      departmentName: 'Synthetic Physical Education Department',
      title: 'Synthetic Test Instructor',
      status: 'ACTIVE',
      createdAt: input.now,
      updatedAt: input.now,
    },
    update: {
      userId: user.id,
      employeeNumber: input.employeeNumber,
      fullName: input.fullName,
      collegeName: 'Synthetic Test College',
      departmentName: 'Synthetic Physical Education Department',
      title: 'Synthetic Test Instructor',
      status: 'ACTIVE',
      deletedAt: null,
      updatedAt: input.now,
    },
  });
  return { userId: user.id, teacherId: profile.id };
}

async function upsertStudent(
  transaction: Prisma.TransactionClient,
  input: {
    organizationId: string;
    studentNumber: string;
    fullName: string;
    gender: 'MALE' | 'FEMALE' | 'OTHER';
    gradeYear: number;
    email?: string;
    now: Date;
  },
): Promise<{ userId: string; studentId: string }> {
  const existing = await transaction.studentProfile.findUnique({
    where: {
      organizationId_studentNumber: {
        organizationId: input.organizationId,
        studentNumber: input.studentNumber,
      },
    },
  });
  const user =
    existing === null
      ? await transaction.user.create({
          data: {
            id: uuidv7(),
            organizationId: input.organizationId,
            role: 'STUDENT',
            status: 'ACTIVE',
            primaryEmail: input.email ?? null,
            primaryEmailNormalized: input.email ?? null,
            emailVerifiedAt: input.email === undefined ? null : input.now,
            passwordHash: null,
            createdAt: input.now,
            updatedAt: input.now,
          },
        })
      : await transaction.user.update({
          where: { id: existing.userId },
          data: {
            role: 'STUDENT',
            status: 'ACTIVE',
            primaryEmail: input.email ?? null,
            primaryEmailNormalized: input.email ?? null,
            emailVerifiedAt: input.email === undefined ? null : input.now,
            passwordHash: null,
            deletedAt: null,
            updatedAt: input.now,
          },
        });
  const profile = await transaction.studentProfile.upsert({
    where: {
      organizationId_studentNumber: {
        organizationId: input.organizationId,
        studentNumber: input.studentNumber,
      },
    },
    create: {
      id: uuidv7(),
      organizationId: input.organizationId,
      userId: user.id,
      studentNumber: input.studentNumber,
      fullName: input.fullName,
      gender: input.gender,
      gradeYear: input.gradeYear,
      collegeName: 'Synthetic Test College',
      majorName: 'Synthetic Test Major',
      administrativeClassName: 'Synthetic Test Administrative Class',
      status: 'ACTIVE',
      createdAt: input.now,
      updatedAt: input.now,
    },
    update: {
      userId: user.id,
      fullName: input.fullName,
      gender: input.gender,
      gradeYear: input.gradeYear,
      collegeName: 'Synthetic Test College',
      majorName: 'Synthetic Test Major',
      administrativeClassName: 'Synthetic Test Administrative Class',
      status: 'ACTIVE',
      deletedAt: null,
      updatedAt: input.now,
    },
  });
  return { userId: user.id, studentId: profile.id };
}

async function upsertEnrollmentFixture(
  transaction: Prisma.TransactionClient,
  input: {
    organizationId: string;
    semesterId: string;
    classSectionId: string;
    studentId: string;
    actorUserId: string;
    actorRole: 'STUDENT' | 'TEACHER';
    status: 'ACTIVE' | 'REMOVED' | 'WITHDRAWN';
    joinedAt: Date;
    endedAt?: Date;
  },
): Promise<{ id: string }> {
  const version = input.status === 'ACTIVE' ? 1 : 2;
  const endReason =
    input.status === 'REMOVED'
      ? 'Synthetic teacher removal fixture'
      : input.status === 'WITHDRAWN'
        ? 'Synthetic withdrawal fixture; student withdrawal remains disabled'
        : null;
  const enrollment = await transaction.enrollment.upsert({
    where: {
      classSectionId_studentId: {
        classSectionId: input.classSectionId,
        studentId: input.studentId,
      },
    },
    create: {
      id: uuidv7(),
      organizationId: input.organizationId,
      semesterId: input.semesterId,
      classSectionId: input.classSectionId,
      studentId: input.studentId,
      source: 'MANUAL',
      sourceReferenceId: null,
      status: input.status,
      joinedAt: input.joinedAt,
      endedAt: input.endedAt ?? null,
      endReason,
      createdBy: input.actorUserId,
      updatedBy: input.actorUserId,
      createdAt: input.joinedAt,
      updatedAt: input.endedAt ?? input.joinedAt,
      version,
    },
    update: {
      status: input.status,
      endedAt: input.endedAt ?? null,
      endReason,
      updatedBy: input.actorUserId,
      updatedAt: input.endedAt ?? input.joinedAt,
      version,
    },
  });
  await transaction.enrollmentStatusEvent.createMany({
    skipDuplicates: true,
    data: [
      {
        id: uuidv7(),
        organizationId: input.organizationId,
        enrollmentId: enrollment.id,
        fromStatus: null,
        toStatus: 'ACTIVE',
        source: 'MANUAL_ENROLLMENT',
        reason: 'Synthetic local enrollment fixture',
        actorUserId: input.actorUserId,
        actorRoleSnapshot: input.actorRole,
        requestId: `seed-stage12-${enrollment.id.slice(0, 8)}-v1`,
        occurredAt: input.joinedAt,
        enrollmentVersion: 1,
      },
      ...(input.status === 'ACTIVE'
        ? []
        : [
            {
              id: uuidv7(),
              organizationId: input.organizationId,
              enrollmentId: enrollment.id,
              fromStatus: 'ACTIVE',
              toStatus: input.status,
              source: input.status === 'REMOVED' ? 'TEACHER_REMOVAL' : 'STUDENT_WITHDRAWAL',
              reason: endReason!,
              actorUserId: input.actorUserId,
              actorRoleSnapshot: input.actorRole,
              requestId: `seed-stage12-${enrollment.id.slice(0, 8)}-v2`,
              occurredAt: input.endedAt!,
              enrollmentVersion: 2,
            },
          ]),
    ],
  });
  return { id: enrollment.id };
}

async function ensureSeedAuthSession(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  label: string,
  now: Date,
): Promise<string> {
  const deviceIdHash = createHash('sha256').update(`stage14-local-${label}`).digest('hex');
  const existing = await transaction.authSession.findFirst({ where: { userId, deviceIdHash } });
  if (existing !== null) return existing.id;
  const created = await transaction.authSession.create({
    data: {
      id: uuidv7(),
      organizationId,
      userId,
      deviceIdHash,
      status: 'ACTIVE',
      tokenFamilyId: uuidv7(),
      createdAt: now,
      lastSeenAt: now,
      absoluteExpiresAt: new Date(now.getTime() + 86_400_000),
      idleExpiresAt: new Date(now.getTime() + 86_400_000),
    },
  });
  return created.id;
}

async function ensureSeedExerciseSession(
  transaction: Prisma.TransactionClient,
  input: {
    organizationId: string;
    semesterId: string;
    classSectionId: string;
    studentId: string;
    enrollmentId: string;
    actorUserId: string;
    authSessionId: string;
    status: 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
    actualSeconds: number;
    pausedSeconds: number;
    now: Date;
  },
): Promise<void> {
  const existing = await transaction.exerciseSession.findFirst({
    where: {
      studentId: input.studentId,
      status: input.status,
      endReason:
        input.status === 'COMPLETED'
          ? 'USER_COMPLETED'
          : input.status === 'CANCELLED'
            ? 'USER_CANCELLED'
            : input.status === 'EXPIRED'
              ? 'SESSION_EXPIRED'
              : null,
    },
  });
  if (existing !== null) return;
  const id = uuidv7();
  const terminal = ['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(input.status);
  const intervalStartedAt = terminal ? null : new Date(input.now.getTime() - 30_000);
  const startedAt = new Date(
    input.now.getTime() - (input.actualSeconds + input.pausedSeconds + 30) * 1000,
  );
  await transaction.exerciseSession.create({
    data: {
      id,
      organizationId: input.organizationId,
      studentId: input.studentId,
      enrollmentId: input.enrollmentId,
      classSectionId: input.classSectionId,
      semesterId: input.semesterId,
      startedByAuthSessionId: input.authSessionId,
      status: input.status,
      startedAt,
      businessDate: new Date('2026-08-04T00:00:00.000Z'),
      completedAt: input.status === 'COMPLETED' ? input.now : null,
      cancelledAt: input.status === 'CANCELLED' ? input.now : null,
      expiredAt: input.status === 'EXPIRED' ? input.now : null,
      endReason:
        input.status === 'COMPLETED'
          ? 'USER_COMPLETED'
          : input.status === 'CANCELLED'
            ? 'USER_CANCELLED'
            : input.status === 'EXPIRED'
              ? 'SESSION_EXPIRED'
              : null,
      actualDurationSeconds: BigInt(input.actualSeconds),
      pausedDurationSeconds: BigInt(input.pausedSeconds),
      currentIntervalStartedAt: intervalStartedAt,
      lastHeartbeatAt: input.now,
      createdAt: startedAt,
      updatedAt: input.now,
      version: 1,
    },
  });
  await transaction.exerciseSessionSegment.create({
    data: {
      id: uuidv7(),
      organizationId: input.organizationId,
      exerciseSessionId: id,
      sequenceNumber: 1,
      segmentType: input.status === 'PAUSED' ? 'PAUSED' : 'RUNNING',
      startedAt: intervalStartedAt ?? startedAt,
      endedAt: terminal ? input.now : null,
      acceptedDurationSeconds: BigInt(terminal ? input.actualSeconds + input.pausedSeconds : 0),
      source: 'SERVER',
      createdAt: startedAt,
    },
  });
  await transaction.exerciseSessionEvent.create({
    data: {
      id: uuidv7(),
      organizationId: input.organizationId,
      exerciseSessionId: id,
      eventVersion: 1,
      eventType: input.status === 'IN_PROGRESS' ? 'STARTED' : input.status,
      fromStatus: null,
      toStatus: input.status,
      acceptedAt: input.now,
      actorUserId: input.actorUserId,
      authSessionId: input.authSessionId,
      requestId: `seed-stage14-${id.slice(0, 8)}`,
      createdAt: input.now,
    },
  });
}

async function main(): Promise<void> {
  const { databaseUrl, adminPassword, teacherPassword } = requireLocalSeedEnvironment();
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

  try {
    const [adminPasswordHash, teacherPasswordHash] = await Promise.all([
      hash(adminPassword, { type: argon2id }),
      hash(teacherPassword, { type: argon2id }),
    ]);
    const now = new Date();

    await prisma.$transaction(async (transaction) => {
      const organization = await transaction.organization.upsert({
        where: { organizationCode: SYNTHETIC_ORGANIZATION_CODE },
        create: {
          id: uuidv7(),
          organizationCode: SYNTHETIC_ORGANIZATION_CODE,
          legalName: 'BNBU Synthetic Local Test Organization',
          displayName: 'BNBU Local Test',
          timezone: 'Asia/Shanghai',
          defaultLocale: 'zh-CN',
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        },
        update: {
          legalName: 'BNBU Synthetic Local Test Organization',
          displayName: 'BNBU Local Test',
          status: 'ACTIVE',
          updatedAt: now,
        },
      });
      const isolationOrganization = await transaction.organization.upsert({
        where: { organizationCode: ISOLATION_ORGANIZATION_CODE },
        create: {
          id: uuidv7(),
          organizationCode: ISOLATION_ORGANIZATION_CODE,
          legalName: 'Synthetic Isolation Test Organization',
          displayName: 'Isolation Test Organization',
          timezone: 'Asia/Shanghai',
          defaultLocale: 'zh-CN',
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        },
        update: { status: 'ACTIVE', updatedAt: now },
      });

      const admin = await transaction.user.upsert({
        where: {
          organizationId_primaryEmailNormalized: { emailIdentityScope: 'PRIMARY',
            organizationId: organization.id,
            primaryEmailNormalized: SYNTHETIC_ADMIN_EMAIL,
          },
        },
        create: {
          id: uuidv7(),
          organizationId: organization.id,
          role: 'ADMIN',
          status: 'ACTIVE',
          primaryEmail: SYNTHETIC_ADMIN_EMAIL,
          primaryEmailNormalized: SYNTHETIC_ADMIN_EMAIL,
          emailVerifiedAt: now,
          passwordHash: adminPasswordHash,
          createdAt: now,
          updatedAt: now,
        },
        update: { status: 'ACTIVE', passwordHash: adminPasswordHash, updatedAt: now },
      });
      await transaction.adminProfile.upsert({
        where: { userId: admin.id },
        create: {
          id: uuidv7(),
          organizationId: organization.id,
          userId: admin.id,
          employeeNumber: 'SYNTH-ADMIN-A',
          fullName: 'Synthetic Admin A',
          departmentName: 'Synthetic Test Office',
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        },
        update: { status: 'ACTIVE', fullName: 'Synthetic Admin A', updatedAt: now },
      });
      const adminB = await transaction.user.upsert({
        where: {
          organizationId_primaryEmailNormalized: { emailIdentityScope: 'PRIMARY',
            organizationId: organization.id,
            primaryEmailNormalized: SYNTHETIC_ADMIN_B_EMAIL,
          },
        },
        create: {
          id: uuidv7(),
          organizationId: organization.id,
          role: 'ADMIN',
          status: 'ACTIVE',
          primaryEmail: SYNTHETIC_ADMIN_B_EMAIL,
          primaryEmailNormalized: SYNTHETIC_ADMIN_B_EMAIL,
          emailVerifiedAt: now,
          passwordHash: adminPasswordHash,
          createdAt: now,
          updatedAt: now,
        },
        update: {
          role: 'ADMIN',
          status: 'ACTIVE',
          passwordHash: adminPasswordHash,
          updatedAt: now,
        },
      });
      await transaction.adminProfile.upsert({
        where: { userId: adminB.id },
        create: {
          id: uuidv7(),
          organizationId: organization.id,
          userId: adminB.id,
          employeeNumber: 'SYNTH-ADMIN-B',
          fullName: 'Synthetic Admin B',
          departmentName: 'Synthetic Test Office',
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        },
        update: { status: 'ACTIVE', fullName: 'Synthetic Admin B', updatedAt: now },
      });

      const teacherA = await upsertTeacher(transaction, {
        organizationId: organization.id,
        email: SYNTHETIC_TEACHER_A_EMAIL,
        passwordHash: teacherPasswordHash,
        employeeNumber: 'SYNTH-TEACHER-A',
        fullName: 'Synthetic Teacher A',
        now,
      });
      const teacherB = await upsertTeacher(transaction, {
        organizationId: organization.id,
        email: SYNTHETIC_TEACHER_B_EMAIL,
        passwordHash: teacherPasswordHash,
        employeeNumber: 'SYNTH-TEACHER-B',
        fullName: 'Synthetic Teacher B',
        now,
      });
      const teacherC = await upsertTeacher(transaction, {
        organizationId: isolationOrganization.id,
        email: ISOLATION_TEACHER_EMAIL,
        passwordHash: teacherPasswordHash,
        employeeNumber: 'SYNTH-TEACHER-C',
        fullName: 'Synthetic Teacher C',
        now,
      });
      await upsertTeacher(transaction, {
        organizationId: organization.id,
        email: SYNTHETIC_ROLE_CONFLICT_EMAIL,
        passwordHash: teacherPasswordHash,
        employeeNumber: 'SYNTH-ROLE-CONFLICT',
        fullName: 'Synthetic Non-Student Role Conflict Fixture',
        now,
      });

      for (const policy of [
        { organizationId: organization.id, changedBy: admin.id },
        { organizationId: isolationOrganization.id, changedBy: teacherC.userId },
      ]) {
        await transaction.systemPolicy.upsert({
          where: { organizationId: policy.organizationId },
          create: {
            organizationId: policy.organizationId,
            systemMode: 'NORMAL',
            changedBy: policy.changedBy,
            changeReason: 'Synthetic local teaching structure seed',
            updatedAt: now,
          },
          update: {
            systemMode: 'NORMAL',
            changedBy: policy.changedBy,
            changeReason: 'Synthetic local teaching structure seed',
            updatedAt: now,
          },
        });
      }

      const localAndroidPolicy = await transaction.appReleasePolicy.findUnique({
        where: {
          platform_policyVersion: {
            platform: 'ANDROID',
            policyVersion: 'local-android-0.1.0-mvp',
          },
        },
      });
      if (localAndroidPolicy === null) {
        await transaction.appReleasePolicy.create({
          data: {
            id: uuidv7(),
            platform: 'ANDROID',
            minimumSupportedVersion: '0.1.0-mvp',
            latestVersion: '0.1.0-mvp',
            minimumSupportedBuildNumber: null,
            latestBuildNumber: null,
            enforcement: 'NONE',
            message: 'Synthetic local environment release policy.',
            downloadUrl: null,
            effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
            expiresAt: null,
            policyVersion: 'local-android-0.1.0-mvp',
            createdAt: now,
          },
        });
      }

      for (const article of [
        {
          id: '11111111-1111-4111-8111-111111111111',
          locale: 'zh-CN',
          title: '如何完成运动打卡',
          bodyMarkdown:
            '开始运动后请保持应用运行。少于 1 小时的会话会取消，不会生成有效记录；达到 1 小时后请核对说明并提交真实凭证。',
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          locale: 'en',
          title: 'How to complete an exercise check-in',
          bodyMarkdown:
            'Keep the app running after starting exercise. Sessions under one hour are cancelled without a valid record. At one hour, review the description and submit genuine evidence.',
        },
      ]) {
        await transaction.helpArticle.upsert({
          where: { id: article.id },
          create: {
            ...article,
            category: 'checkin',
            status: 'PUBLISHED',
            publishedAt: now,
            createdAt: now,
            updatedAt: now,
          },
          update: {
            title: article.title,
            bodyMarkdown: article.bodyMarkdown,
            status: 'PUBLISHED',
            publishedAt: now,
            updatedAt: now,
          },
        });
      }

      const currentSemester = await transaction.semester.upsert({
        where: {
          organizationId_academicYear_termCode: {
            organizationId: organization.id,
            academicYear: '2026-2027',
            termCode: 'FIRST',
          },
        },
        create: {
          id: uuidv7(),
          organizationId: organization.id,
          academicYear: '2026-2027',
          termCode: 'FIRST',
          displayName: 'Synthetic BNBU Current Semester',
          startDate: new Date('2026-08-01T00:00:00.000Z'),
          endDate: new Date('2027-01-31T00:00:00.000Z'),
          status: 'CURRENT',
          createdBy: admin.id,
          createdAt: now,
          updatedAt: now,
        },
        update: {
          status: 'CURRENT',
          displayName: 'Synthetic BNBU Current Semester',
          updatedAt: now,
        },
      });
      const archivedSemester = await transaction.semester.upsert({
        where: {
          organizationId_academicYear_termCode: {
            organizationId: organization.id,
            academicYear: '2025-2026',
            termCode: 'SECOND',
          },
        },
        create: {
          id: uuidv7(),
          organizationId: organization.id,
          academicYear: '2025-2026',
          termCode: 'SECOND',
          displayName: 'Synthetic BNBU Archived Semester',
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          endDate: new Date('2026-07-31T00:00:00.000Z'),
          status: 'ARCHIVED',
          createdBy: admin.id,
          createdAt: now,
          updatedAt: now,
        },
        update: { status: 'ARCHIVED', updatedAt: now },
      });
      const isolationSemester = await transaction.semester.upsert({
        where: {
          organizationId_academicYear_termCode: {
            organizationId: isolationOrganization.id,
            academicYear: '2026-2027',
            termCode: 'FIRST',
          },
        },
        create: {
          id: uuidv7(),
          organizationId: isolationOrganization.id,
          academicYear: '2026-2027',
          termCode: 'FIRST',
          displayName: 'Synthetic Isolation Current Semester',
          startDate: new Date('2026-08-01T00:00:00.000Z'),
          endDate: new Date('2027-01-31T00:00:00.000Z'),
          status: 'CURRENT',
          createdBy: teacherC.userId,
          createdAt: now,
          updatedAt: now,
        },
        update: { status: 'CURRENT', updatedAt: now },
      });

      const courseInputs = [
        {
          organizationId: organization.id,
          code: 'SYNTH-PE-101',
          name: 'Synthetic Active Course 1',
          status: 'ACTIVE',
          actor: admin.id,
        },
        {
          organizationId: organization.id,
          code: 'SYNTH-PE-102',
          name: 'Synthetic Active Course 2',
          status: 'ACTIVE',
          actor: admin.id,
        },
        {
          organizationId: organization.id,
          code: 'SYNTH-PE-103',
          name: 'Synthetic Inactive Course 3',
          status: 'INACTIVE',
          actor: admin.id,
        },
        {
          organizationId: isolationOrganization.id,
          code: 'SYNTH-ISO-101',
          name: 'Synthetic Isolation Course',
          status: 'ACTIVE',
          actor: teacherC.userId,
        },
      ] as const;
      const courses = new Map<string, { id: string }>();
      for (const input of courseInputs) {
        const course = await transaction.course.upsert({
          where: {
            organizationId_courseCode: {
              organizationId: input.organizationId,
              courseCode: input.code,
            },
          },
          create: {
            id: uuidv7(),
            organizationId: input.organizationId,
            courseCode: input.code,
            courseName: input.name,
            description: 'Clearly synthetic local validation data',
            status: input.status,
            createdBy: input.actor,
            updatedBy: input.actor,
            createdAt: now,
            updatedAt: now,
          },
          update: {
            courseName: input.name,
            status: input.status,
            updatedBy: input.actor,
            updatedAt: now,
          },
        });
        courses.set(input.code, course);
      }

      const sectionInputs = [
        {
          organizationId: organization.id,
          semesterId: currentSemester.id,
          courseId: courses.get('SYNTH-PE-101')!.id,
          teacherId: teacherA.teacherId,
          actor: teacherA.userId,
          code: 'SYNTH-A-01',
          name: 'Synthetic Teacher A Active Section',
          status: 'ACTIVE',
          enrollmentOpen: true,
          closed: false,
        },
        {
          organizationId: organization.id,
          semesterId: currentSemester.id,
          courseId: courses.get('SYNTH-PE-102')!.id,
          teacherId: teacherA.teacherId,
          actor: teacherA.userId,
          code: 'SYNTH-A-02',
          name: 'Synthetic Teacher A Closed Section',
          status: 'CLOSED',
          enrollmentOpen: false,
          closed: true,
        },
        {
          organizationId: organization.id,
          semesterId: currentSemester.id,
          courseId: courses.get('SYNTH-PE-101')!.id,
          teacherId: teacherB.teacherId,
          actor: teacherB.userId,
          code: 'SYNTH-B-01',
          name: 'Synthetic Teacher B Active Section',
          status: 'ACTIVE',
          enrollmentOpen: true,
          closed: false,
        },
        {
          organizationId: organization.id,
          semesterId: archivedSemester.id,
          courseId: courses.get('SYNTH-PE-102')!.id,
          teacherId: teacherB.teacherId,
          actor: teacherB.userId,
          code: 'SYNTH-B-ARCH',
          name: 'Synthetic Teacher B Archived Section',
          status: 'ARCHIVED',
          enrollmentOpen: false,
          closed: true,
        },
        {
          organizationId: isolationOrganization.id,
          semesterId: isolationSemester.id,
          courseId: courses.get('SYNTH-ISO-101')!.id,
          teacherId: teacherC.teacherId,
          actor: teacherC.userId,
          code: 'SYNTH-C-01',
          name: 'Synthetic Isolation Teacher C Section',
          status: 'ACTIVE',
          enrollmentOpen: false,
          closed: false,
        },
      ] as const;
      const sections = new Map<string, { id: string }>();
      for (const input of sectionInputs) {
        const section = await transaction.classSection.upsert({
          where: {
            semesterId_courseId_classCode: {
              semesterId: input.semesterId,
              courseId: input.courseId,
              classCode: input.code,
            },
          },
          create: {
            id: uuidv7(),
            organizationId: input.organizationId,
            courseId: input.courseId,
            semesterId: input.semesterId,
            teacherId: input.teacherId,
            classCode: input.code,
            displayName: input.name,
            status: input.status,
            isEnrollmentOpen: input.enrollmentOpen,
            checkInWindowMode: 'UNAVAILABLE',
            createdBy: input.actor,
            updatedBy: input.actor,
            createdAt: now,
            updatedAt: now,
            ...(input.closed
              ? {
                  closedAt: now,
                  closedBy: input.actor,
                  closeReason: 'Synthetic seed lifecycle state',
                }
              : {}),
          },
          update: {
            displayName: input.name,
            status: input.status,
            isEnrollmentOpen: input.enrollmentOpen,
            updatedBy: input.actor,
            updatedAt: now,
            closedAt: input.closed ? now : null,
            closedBy: input.closed ? input.actor : null,
            closeReason: input.closed ? 'Synthetic seed lifecycle state' : null,
          },
        });
        sections.set(input.code, section);
      }

      const activeSectionId = sections.get('SYNTH-A-01')!.id;
      let activeScoreRule = await transaction.scoreRule.findFirst({
        where: { classSectionId: activeSectionId, status: 'ACTIVE' },
        orderBy: { ruleVersion: 'desc' },
      });
      if (activeScoreRule === null) {
        const latestRule = await transaction.scoreRule.aggregate({
          where: { classSectionId: activeSectionId },
          _max: { ruleVersion: true },
        });
        activeScoreRule = await transaction.scoreRule.create({
          data: {
            id: uuidv7(),
            organizationId: organization.id,
            classSectionId: activeSectionId,
            semesterId: currentSemester.id,
            ruleCode: 'SYNTHETIC_LOCAL_TOTAL_20H',
            ruleVersion: (latestRule._max.ruleVersion ?? 0) + 1,
            displayName: 'Synthetic local 20-hour rule',
            totalRequiredSeconds: 72_000n,
            calculationDefinition: {
              formulaType: 'LINEAR_CAPPED',
              maximumScore: 100,
              categoryAllocationMode: 'TOTAL_ONLY',
            },
            roundingMode: 'HALF_UP',
            roundingScale: 2,
            status: 'ACTIVE',
            createdBy: teacherA.userId,
            submittedAt: now,
            activatedAt: now,
            createdAt: now,
            updatedAt: now,
          },
        });
      }
      for (const actorUserId of [admin.id, adminB.id]) {
        await transaction.scoreRuleApprovalEvent.upsert({
          where: {
            scoreRuleId_actorUserId_action: {
              scoreRuleId: activeScoreRule.id,
              actorUserId,
              action: 'APPROVE',
            },
          },
          create: {
            id: uuidv7(),
            organizationId: organization.id,
            scoreRuleId: activeScoreRule.id,
            action: 'APPROVE',
            actorUserId,
            reason: 'Synthetic local two-person approval fixture',
            requestId: `seed-${actorUserId.slice(0, 8)}`,
            createdAt: now,
          },
          update: {},
        });
      }

      await upsertStudent(transaction, {
        organizationId: organization.id,
        studentNumber: 'SYNTH-STUDENT-0001',
        fullName: 'Synthetic Student A No Enrollment',
        gender: 'FEMALE',
        gradeYear: 2026,
        now,
      });
      const studentB = await upsertStudent(transaction, {
        organizationId: organization.id,
        studentNumber: 'SYNTH-STUDENT-0002',
        fullName: 'Synthetic Student B Historical Relation',
        gender: 'MALE',
        gradeYear: 2025,
        now,
      });
      const activeStudent = await upsertStudent(transaction, {
        organizationId: organization.id,
        studentNumber: 'SYNTH-CLOSURE-0001',
        fullName: 'Synthetic Cross-Client Closure Student',
        gender: 'OTHER',
        gradeYear: 2026,
        email: SYNTHETIC_CLOSURE_STUDENT_EMAIL,
        now,
      });
      const removedStudent = await upsertStudent(transaction, {
        organizationId: organization.id,
        studentNumber: 'SYNTH-REMOVED-0001',
        fullName: 'Synthetic Removed Enrollment Student',
        gender: 'FEMALE',
        gradeYear: 2026,
        now,
      });
      await upsertStudent(transaction, {
        organizationId: organization.id,
        studentNumber: 'SYNTH-IDENTITY-CONFLICT-0001',
        fullName: 'Synthetic Identity Conflict Fixture',
        gender: 'OTHER',
        gradeYear: 2026,
        now,
      });
      await upsertEnrollmentFixture(transaction, {
        organizationId: organization.id,
        semesterId: currentSemester.id,
        classSectionId: sections.get('SYNTH-A-01')!.id,
        studentId: activeStudent.studentId,
        actorUserId: teacherA.userId,
        actorRole: 'TEACHER',
        status: 'ACTIVE',
        joinedAt: new Date('2026-08-02T00:00:00.000Z'),
      });
      await upsertEnrollmentFixture(transaction, {
        organizationId: organization.id,
        semesterId: currentSemester.id,
        classSectionId: sections.get('SYNTH-B-01')!.id,
        studentId: removedStudent.studentId,
        actorUserId: teacherB.userId,
        actorRole: 'TEACHER',
        status: 'REMOVED',
        joinedAt: new Date('2026-08-01T00:00:00.000Z'),
        endedAt: new Date('2026-08-02T00:00:00.000Z'),
      });
      await upsertEnrollmentFixture(transaction, {
        organizationId: organization.id,
        semesterId: archivedSemester.id,
        classSectionId: sections.get('SYNTH-B-ARCH')!.id,
        studentId: studentB.studentId,
        actorUserId: studentB.userId,
        actorRole: 'STUDENT',
        status: 'WITHDRAWN',
        joinedAt: new Date('2026-01-05T00:00:00.000Z'),
        endedAt: new Date('2026-02-01T00:00:00.000Z'),
      });

      await transaction.classSection.update({
        where: { id: sections.get('SYNTH-A-01')!.id },
        data: {
          checkInWindowMode: 'AVAILABLE',
          checkInStartDate: currentSemester.startDate,
          checkInEndDate: currentSemester.endDate,
          dailyStartTime: null,
          dailyEndTime: null,
          submissionDeadlineAt: new Date('2027-02-01T00:00:00.000Z'),
          updatedAt: now,
        },
      });
      await transaction.classSection.update({
        where: { id: sections.get('SYNTH-B-01')!.id },
        data: {
          checkInWindowMode: 'AVAILABLE',
          checkInStartDate: currentSemester.startDate,
          checkInEndDate: currentSemester.endDate,
          dailyStartTime: new Date('1970-01-01T00:00:00.000Z'),
          dailyEndTime: new Date('1970-01-01T00:01:00.000Z'),
          updatedAt: now,
        },
      });
      await transaction.classSectionExcludedDate.upsert({
        where: {
          classSectionId_excludedDate: {
            classSectionId: sections.get('SYNTH-B-01')!.id,
            excludedDate: new Date('2026-08-04T00:00:00.000Z'),
          },
        },
        create: {
          organizationId: organization.id,
          classSectionId: sections.get('SYNTH-B-01')!.id,
          excludedDate: new Date('2026-08-04T00:00:00.000Z'),
          createdBy: teacherB.userId,
          createdAt: now,
        },
        update: {},
      });

      const sessionFixtureInputs = [
        { number: 'SYNTH-SESSION-B', label: 'B', status: 'IN_PROGRESS', actual: 60, paused: 0 },
        { number: 'SYNTH-SESSION-C', label: 'C', status: 'PAUSED', actual: 300, paused: 30 },
        {
          number: 'SYNTH-SESSION-CAP',
          label: 'CAP',
          status: 'IN_PROGRESS',
          actual: 7198,
          paused: 0,
        },
        {
          number: 'SYNTH-SESSION-DONE',
          label: 'DONE',
          status: 'COMPLETED',
          actual: 3600,
          paused: 120,
        },
        {
          number: 'SYNTH-SESSION-CANCEL',
          label: 'CANCEL',
          status: 'CANCELLED',
          actual: 120,
          paused: 10,
        },
        {
          number: 'SYNTH-SESSION-EXPIRED',
          label: 'EXPIRED',
          status: 'EXPIRED',
          actual: 30,
          paused: 0,
        },
      ] as const;
      for (const input of sessionFixtureInputs) {
        const candidate = await upsertStudent(transaction, {
          organizationId: organization.id,
          studentNumber: input.number,
          fullName: `Synthetic Session Student ${input.label}`,
          gender: 'OTHER',
          gradeYear: 2026,
          now,
        });
        const enrollment = await upsertEnrollmentFixture(transaction, {
          organizationId: organization.id,
          semesterId: currentSemester.id,
          classSectionId: sections.get('SYNTH-A-01')!.id,
          studentId: candidate.studentId,
          actorUserId: teacherA.userId,
          actorRole: 'TEACHER',
          status: 'ACTIVE',
          joinedAt: new Date('2026-08-02T00:00:00.000Z'),
        });
        const authSessionId = await ensureSeedAuthSession(
          transaction,
          organization.id,
          candidate.userId,
          input.label,
          now,
        );
        await ensureSeedExerciseSession(transaction, {
          organizationId: organization.id,
          semesterId: currentSemester.id,
          classSectionId: sections.get('SYNTH-A-01')!.id,
          studentId: candidate.studentId,
          enrollmentId: enrollment.id,
          actorUserId: candidate.userId,
          authSessionId,
          status: input.status,
          actualSeconds: input.actual,
          pausedSeconds: input.paused,
          now,
        });
      }

      const isolationStudent = await upsertStudent(transaction, {
        organizationId: isolationOrganization.id,
        studentNumber: 'SYNTH-SESSION-E',
        fullName: 'Synthetic Session Student E Isolation',
        gender: 'OTHER',
        gradeYear: 2026,
        now,
      });
      await upsertEnrollmentFixture(transaction, {
        organizationId: isolationOrganization.id,
        semesterId: isolationSemester.id,
        classSectionId: sections.get('SYNTH-C-01')!.id,
        studentId: isolationStudent.studentId,
        actorUserId: teacherC.userId,
        actorRole: 'TEACHER',
        status: 'ACTIVE',
        joinedAt: new Date('2026-08-02T00:00:00.000Z'),
      });

      const inviteSectionId = sections.get('SYNTH-A-01')!.id;
      await transaction.courseInvite.updateMany({
        where: { classSectionId: inviteSectionId, status: 'ACTIVE', expiresAt: { lte: now } },
        data: {
          status: 'EXPIRED',
          secretCiphertext: null,
          secretReplayExpiresAt: null,
          rowVersion: { increment: 1 },
        },
      });
      const activeInvite = await transaction.courseInvite.findFirst({
        where: { classSectionId: inviteSectionId, status: 'ACTIVE', expiresAt: { gt: now } },
      });
      if (activeInvite === null) {
        const versions = await transaction.courseInvite.aggregate({
          where: { classSectionId: inviteSectionId },
          _max: { versionNumber: true },
        });
        await transaction.courseInvite.create({
          data: {
            id: uuidv7(),
            organizationId: organization.id,
            classSectionId: inviteSectionId,
            versionNumber: (versions._max.versionNumber ?? 0) + 1,
            status: 'ACTIVE',
            tokenHash: randomBytes(32).toString('hex'),
            secretCiphertext: null,
            secretKeyVersion: 1,
            secretReplayExpiresAt: null,
            createdBy: teacherA.userId,
            createdAt: now,
            expiresAt: new Date(now.getTime() + 86_400_000),
          },
        });
      }
    });

    process.stdout.write(
      `Synthetic local Stage 14 seed completed. ${SYNTHETIC_CONCURRENT_STUDENT_NUMBER} remains absent for concurrent identity creation tests. ExerciseSession fixtures cover active, paused, near-cap, completed, cancelled, expired, removed, isolation, excluded-date, and daily-window scenarios. No real identity data or plaintext invite token was used.\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

await main();
