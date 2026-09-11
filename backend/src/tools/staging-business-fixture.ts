import { lstat, readFile } from 'node:fs/promises';
import { TextDecoder } from 'node:util';

import { argon2id, hash, verify } from 'argon2';
import { v7 as uuidv7 } from 'uuid';

import {
  Prisma,
  type AdminProfile,
  type ClassSection,
  type Course,
  type Organization,
  type PrismaClient,
  type ScoreRule,
  type Semester,
  type StudentProfile,
  type TeacherProfile,
  type User,
} from '../generated/prisma/client.js';

export const STAGING_BUSINESS_CONFIRMATION = 'BNBU_SPORTS_STAGING_BUSINESS_CLOSURE_V1';
export const STAGING_BUSINESS_PUBLIC_BASE_URL = 'https://api.verityai.cn/api/v1';
export const STAGING_QR_PATH_LOG_REDACTION_CONFIRMATION = 'BNBU_QR_PATH_LOG_REDACTION_VERIFIED_V1';
export const STAGING_BUSINESS_FIXTURE_AUDIT_ACTION = 'STAGING_FIXTURE_BOOTSTRAP';
export const STAGING_BUSINESS_FIXTURE_PERMISSION_ID = 'OPERATIONS-STAGING-BUSINESS-FIXTURE';

export const STAGING_BUSINESS_ORGANIZATION_CODE = 'STAGING-BUSINESS-SYNTHETIC';
export const STAGING_BUSINESS_ADMIN_EMAIL = 'admin.business.staging.synthetic@bnbu.invalid';
export const STAGING_BUSINESS_TEACHER_EMAIL = 'teacher.business.staging.synthetic@bnbu.invalid';
export const STAGING_BUSINESS_STUDENT_NUMBER = 'SYNTH-STAGING-STUDENT';
export const STAGING_BUSINESS_STUDENT_NAME = 'Synthetic Staging Student';
export const STAGING_BUSINESS_CLASS_CODE = 'SYNTH-STAGING-01';
export const STAGING_BUSINESS_COURSE_CODE = 'SYNTH-STAGING-PE';
export const STAGING_BUSINESS_SESSION_START_REQUEST_ID = 'staging-business-session-start-v1';
export const STAGING_BUSINESS_SESSION_REQUEST_ID = 'staging-business-session-complete-v1';

const SECRET_KEYS = [
  'STAGING_BUSINESS_ADMIN_PASSWORD',
  'STAGING_BUSINESS_TEACHER_PASSWORD',
  'STAGING_BUSINESS_STUDENT_EMAIL',
] as const;
const SECRET_MAX_BYTES = 8 * 1024;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });
const RESERVED_MAIL_DOMAINS = new Set(['example.com', 'example.net', 'example.org', 'localhost']);

type SecretKey = (typeof SECRET_KEYS)[number];

export interface StagingBusinessFixtureSecret {
  adminPassword: string;
  teacherPassword: string;
  studentEmail: string;
}

export interface BusinessFixtureState {
  organizationId: string;
  adminUserId: string;
  teacherUserId: string;
  teacherProfileId: string;
  studentUserId: string;
  studentProfileId: string;
  semesterId: string;
  courseId: string;
  classSectionId: string;
  scoreRuleId: string;
}

export interface BusinessFixtureBootstrapOutcome {
  status: 'CREATED' | 'VERIFIED';
  createdComponents: string[];
  state: BusinessFixtureState;
}

export interface CompletedClosureSession {
  status: 'CREATED' | 'VERIFIED';
  sessionId: string;
  businessDate: string;
}

export class StagingBusinessOperatorFailure extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'StagingBusinessOperatorFailure';
  }
}

interface SecretFileMetadata {
  uid: number;
  gid: number;
  mode: number;
  isFile: boolean;
  isSymbolicLink: boolean;
}

interface SecretFileDependencies {
  readSecretFile?: (path: string) => Promise<Uint8Array>;
  inspectSecretFile?: (path: string) => Promise<SecretFileMetadata>;
}

export async function loadStagingBusinessFixtureSecret(
  filePath: string,
  dependencies: SecretFileDependencies = {},
): Promise<StagingBusinessFixtureSecret> {
  let metadata: SecretFileMetadata;
  try {
    metadata = await (
      dependencies.inspectSecretFile ??
      (async (path: string): Promise<SecretFileMetadata> => {
        const value = await lstat(path);
        return {
          uid: value.uid,
          gid: value.gid,
          mode: value.mode,
          isFile: value.isFile(),
          isSymbolicLink: value.isSymbolicLink(),
        };
      })
    )(filePath);
  } catch {
    throw new StagingBusinessOperatorFailure('BUSINESS_FIXTURE_SECRET_UNAVAILABLE');
  }
  if (
    metadata.uid !== 0 ||
    metadata.gid !== 10_001 ||
    (metadata.mode & 0o7777) !== 0o640 ||
    !metadata.isFile ||
    metadata.isSymbolicLink
  ) {
    throw new StagingBusinessOperatorFailure('BUSINESS_FIXTURE_SECRET_PERMISSIONS_INVALID');
  }

  let bytes: Uint8Array;
  try {
    bytes = await (dependencies.readSecretFile ?? readFile)(filePath);
  } catch {
    throw new StagingBusinessOperatorFailure('BUSINESS_FIXTURE_SECRET_UNAVAILABLE');
  }
  if (bytes.byteLength > SECRET_MAX_BYTES) {
    throw new StagingBusinessOperatorFailure('BUSINESS_FIXTURE_SECRET_TOO_LARGE');
  }

  let text: string;
  try {
    text = UTF8_DECODER.decode(bytes);
  } catch {
    throw new StagingBusinessOperatorFailure('BUSINESS_FIXTURE_SECRET_NOT_UTF8');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new StagingBusinessOperatorFailure('BUSINESS_FIXTURE_SECRET_INVALID_JSON');
  }
  if (!isRecord(parsed)) {
    throw new StagingBusinessOperatorFailure('BUSINESS_FIXTURE_SECRET_INVALID_SHAPE');
  }
  const keys = Object.keys(parsed).sort();
  if (
    keys.length !== SECRET_KEYS.length ||
    keys.some((key, index) => key !== [...SECRET_KEYS].sort()[index])
  ) {
    throw new StagingBusinessOperatorFailure('BUSINESS_FIXTURE_SECRET_KEYS_INVALID');
  }

  const values = parsed as Record<SecretKey, unknown>;
  const adminPassword = validatePassword(values.STAGING_BUSINESS_ADMIN_PASSWORD);
  const teacherPassword = validatePassword(values.STAGING_BUSINESS_TEACHER_PASSWORD);
  if (adminPassword === teacherPassword) {
    throw new StagingBusinessOperatorFailure('BUSINESS_FIXTURE_PASSWORDS_NOT_ISOLATED');
  }
  const studentEmail = validateControlledMailbox(values.STAGING_BUSINESS_STUDENT_EMAIL);
  return { adminPassword, teacherPassword, studentEmail };
}

export async function ensureStagingBusinessFixture(
  prisma: PrismaClient,
  secret: StagingBusinessFixtureSecret,
): Promise<BusinessFixtureBootstrapOutcome> {
  return prisma.$transaction(
    async (transaction) => {
      const created: string[] = [];
      const now = new Date();

      const organization = await ensureOrganization(transaction, now, created);
      const admin = await ensurePasswordUser(
        transaction,
        {
          organizationId: organization.id,
          email: STAGING_BUSINESS_ADMIN_EMAIL,
          role: 'ADMIN',
          password: secret.adminPassword,
          conflictCode: 'BUSINESS_FIXTURE_ADMIN_CONFLICT',
          component: 'adminUser',
        },
        now,
        created,
      );
      await ensureAdminProfile(
        transaction,
        organization.id,
        admin.id,
        'SYNTH-STAGING-ADMIN-A',
        'Synthetic Staging Business Admin A',
        now,
        created,
        'adminProfile',
      );
      const secondAdmin = await ensureSecondAdmin(transaction, organization.id, now, created);
      const teacher = await ensurePasswordUser(
        transaction,
        {
          organizationId: organization.id,
          email: STAGING_BUSINESS_TEACHER_EMAIL,
          role: 'TEACHER',
          password: secret.teacherPassword,
          conflictCode: 'BUSINESS_FIXTURE_TEACHER_CONFLICT',
          component: 'teacherUser',
        },
        now,
        created,
      );
      const teacherProfile = await ensureTeacherProfile(
        transaction,
        organization.id,
        teacher.id,
        now,
        created,
      );
      const student = await ensureStudent(
        transaction,
        organization.id,
        secret.studentEmail,
        now,
        created,
      );
      await ensureSystemPolicy(transaction, organization.id, admin.id, now, created);
      const semester = await ensureSemester(transaction, organization.id, admin.id, now, created);
      const course = await ensureCourse(transaction, organization.id, admin.id, now, created);
      const classSection = await ensureClassSection(
        transaction,
        organization.id,
        semester.id,
        course.id,
        teacher.id,
        teacherProfile.id,
        now,
        created,
      );
      const scoreRule = await ensureScoreRule(
        transaction,
        organization.id,
        semester.id,
        classSection.id,
        teacher.id,
        admin.id,
        secondAdmin.id,
        now,
        created,
      );

      if (created.length > 0) {
        await transaction.auditLog.create({
          data: {
            id: uuidv7(),
            organizationId: organization.id,
            actorUserId: admin.id,
            actorRoleSnapshot: 'ADMIN',
            permissionId: STAGING_BUSINESS_FIXTURE_PERMISSION_ID,
            actionType: STAGING_BUSINESS_FIXTURE_AUDIT_ACTION,
            targetType: 'USER',
            targetId: admin.id,
            requestId: `staging-business-bootstrap-${uuidv7()}`,
            idempotencyKeyReference: null,
            outcome: 'SUCCEEDED',
            reasonCode: null,
            safeMetadata: {
              fixtureKind: 'STAGING_BUSINESS',
              createdComponents: created,
            },
            sourceIpHash: null,
            deviceFingerprintHash: null,
            occurredAt: now,
          },
        });
      }

      return {
        status: created.length === 0 ? 'VERIFIED' : 'CREATED',
        createdComponents: created,
        state: {
          organizationId: organization.id,
          adminUserId: admin.id,
          teacherUserId: teacher.id,
          teacherProfileId: teacherProfile.id,
          studentUserId: student.userId,
          studentProfileId: student.id,
          semesterId: semester.id,
          courseId: course.id,
          classSectionId: classSection.id,
          scoreRuleId: scoreRule.id,
        },
      } satisfies BusinessFixtureBootstrapOutcome;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function ensureCompletedClosureSession(
  prisma: PrismaClient,
  state: BusinessFixtureState,
  authSessionId: string,
): Promise<CompletedClosureSession> {
  return prisma.$transaction(
    async (transaction) => {
      const enrollment = await transaction.enrollment.findUnique({
        where: {
          classSectionId_studentId: {
            classSectionId: state.classSectionId,
            studentId: state.studentProfileId,
          },
        },
      });
      if (
        enrollment?.organizationId !== state.organizationId ||
        enrollment.semesterId !== state.semesterId ||
        enrollment.status !== 'ACTIVE'
      ) {
        throw new StagingBusinessOperatorFailure('BUSINESS_ENROLLMENT_NOT_ACTIVE');
      }
      const authSession = await transaction.authSession.findUnique({
        where: { id: authSessionId },
      });
      if (
        authSession?.organizationId !== state.organizationId ||
        authSession.userId !== state.studentUserId ||
        authSession.status !== 'ACTIVE'
      ) {
        throw new StagingBusinessOperatorFailure('BUSINESS_STUDENT_AUTH_SESSION_INVALID');
      }

      const existingEvent = await transaction.exerciseSessionEvent.findFirst({
        where: {
          organizationId: state.organizationId,
          requestId: STAGING_BUSINESS_SESSION_REQUEST_ID,
          eventType: 'COMPLETED',
        },
      });
      if (existingEvent !== null) {
        const session = await transaction.exerciseSession.findUnique({
          where: { id: existingEvent.exerciseSessionId },
          include: {
            events: { orderBy: { eventVersion: 'asc' } },
            segments: { orderBy: { sequenceNumber: 'asc' } },
          },
        });
        const segment = session?.segments[0];
        if (
          session?.organizationId !== state.organizationId ||
          session.studentId !== state.studentProfileId ||
          session.enrollmentId !== enrollment.id ||
          session.classSectionId !== state.classSectionId ||
          session.semesterId !== state.semesterId ||
          session.status !== 'COMPLETED' ||
          session.endReason !== 'USER_COMPLETED' ||
          session.actualDurationSeconds !== 3600n ||
          session.pausedDurationSeconds !== 0n ||
          session.completedAt === null ||
          session.version !== 2 ||
          session.segments.length !== 1 ||
          segment?.organizationId !== state.organizationId ||
          segment.exerciseSessionId !== session.id ||
          segment.sequenceNumber !== 1 ||
          segment.segmentType !== 'RUNNING' ||
          segment.startedAt.getTime() !== session.startedAt.getTime() ||
          segment.endedAt?.getTime() !== session.completedAt.getTime() ||
          segment.acceptedDurationSeconds !== 3600n ||
          segment.source !== 'SERVER' ||
          session.events.length !== 2 ||
          session.events[0]?.eventVersion !== 1 ||
          session.events[0]?.eventType !== 'STARTED' ||
          session.events[0]?.fromStatus !== null ||
          session.events[0]?.toStatus !== 'IN_PROGRESS' ||
          session.events[0]?.requestId !== STAGING_BUSINESS_SESSION_START_REQUEST_ID ||
          session.events[1]?.eventVersion !== 2 ||
          session.events[1]?.eventType !== 'COMPLETED' ||
          session.events[1]?.fromStatus !== 'IN_PROGRESS' ||
          session.events[1]?.toStatus !== 'COMPLETED' ||
          session.events[1]?.requestId !== STAGING_BUSINESS_SESSION_REQUEST_ID
        ) {
          throw new StagingBusinessOperatorFailure('BUSINESS_CLOSURE_SESSION_CONFLICT');
        }
        return {
          status: 'VERIFIED',
          sessionId: session.id,
          businessDate: dateOnly(session.businessDate),
        };
      }

      const completedAt = new Date();
      const startedAt = new Date(completedAt.getTime() - 3_600_000);
      const businessDate = shanghaiBusinessDate(startedAt);
      const sessionId = uuidv7();
      await transaction.exerciseSession.create({
        data: {
          id: sessionId,
          organizationId: state.organizationId,
          studentId: state.studentProfileId,
          enrollmentId: enrollment.id,
          classSectionId: state.classSectionId,
          semesterId: state.semesterId,
          startedByAuthSessionId: authSessionId,
          status: 'COMPLETED',
          startedAt,
          businessDate,
          completedAt,
          cancelledAt: null,
          expiredAt: null,
          endReason: 'USER_COMPLETED',
          actualDurationSeconds: 3600n,
          pausedDurationSeconds: 0n,
          currentIntervalStartedAt: null,
          lastHeartbeatAt: completedAt,
          createdAt: startedAt,
          updatedAt: completedAt,
          version: 2,
        },
      });
      await transaction.exerciseSessionSegment.create({
        data: {
          id: uuidv7(),
          organizationId: state.organizationId,
          exerciseSessionId: sessionId,
          sequenceNumber: 1,
          segmentType: 'RUNNING',
          startedAt,
          endedAt: completedAt,
          acceptedDurationSeconds: 3600n,
          source: 'SERVER',
          createdAt: startedAt,
        },
      });
      await transaction.exerciseSessionEvent.create({
        data: {
          id: uuidv7(),
          organizationId: state.organizationId,
          exerciseSessionId: sessionId,
          eventVersion: 1,
          eventType: 'STARTED',
          fromStatus: null,
          toStatus: 'IN_PROGRESS',
          acceptedAt: startedAt,
          clientObservedAt: startedAt,
          clientEventId: null,
          actorUserId: state.studentUserId,
          authSessionId,
          requestId: STAGING_BUSINESS_SESSION_START_REQUEST_ID,
          idempotencyKeyReference: null,
          safeMetadata: { fixtureKind: 'STAGING_BUSINESS_CLOSURE' },
          createdAt: startedAt,
        },
      });
      await transaction.exerciseSessionEvent.create({
        data: {
          id: uuidv7(),
          organizationId: state.organizationId,
          exerciseSessionId: sessionId,
          eventVersion: 2,
          eventType: 'COMPLETED',
          fromStatus: 'IN_PROGRESS',
          toStatus: 'COMPLETED',
          acceptedAt: completedAt,
          clientObservedAt: completedAt,
          clientEventId: null,
          actorUserId: state.studentUserId,
          authSessionId,
          requestId: STAGING_BUSINESS_SESSION_REQUEST_ID,
          idempotencyKeyReference: null,
          safeMetadata: { fixtureKind: 'STAGING_BUSINESS_CLOSURE', durationSeconds: 3600 },
          createdAt: completedAt,
        },
      });
      await transaction.auditLog.create({
        data: {
          id: uuidv7(),
          organizationId: state.organizationId,
          actorUserId: state.studentUserId,
          actorRoleSnapshot: 'STUDENT',
          permissionId: STAGING_BUSINESS_FIXTURE_PERMISSION_ID,
          actionType: STAGING_BUSINESS_FIXTURE_AUDIT_ACTION,
          targetType: 'EXERCISE_SESSION',
          targetId: sessionId,
          requestId: STAGING_BUSINESS_SESSION_REQUEST_ID,
          idempotencyKeyReference: null,
          outcome: 'SUCCEEDED',
          reasonCode: null,
          safeMetadata: {
            fixtureKind: 'STAGING_BUSINESS_CLOSURE',
            durationSeconds: 3600,
          },
          sourceIpHash: null,
          deviceFingerprintHash: null,
          occurredAt: completedAt,
        },
      });
      return { status: 'CREATED', sessionId, businessDate: dateOnly(businessDate) };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function ensureOrganization(
  transaction: Prisma.TransactionClient,
  now: Date,
  created: string[],
): Promise<Organization> {
  const expected = {
    legalName: 'BNBU Sports Synthetic Staging Business Organization',
    displayName: 'BNBU Sports Synthetic Staging Business',
    timezone: 'Asia/Shanghai',
    defaultLocale: 'zh-CN',
    status: 'ACTIVE',
  };
  let organization = await transaction.organization.findUnique({
    where: { organizationCode: STAGING_BUSINESS_ORGANIZATION_CODE },
  });
  if (organization === null) {
    organization = await transaction.organization.create({
      data: {
        id: uuidv7(),
        organizationCode: STAGING_BUSINESS_ORGANIZATION_CODE,
        ...expected,
        createdAt: now,
        updatedAt: now,
      },
    });
    created.push('organization');
  } else if (
    organization.legalName !== expected.legalName ||
    organization.displayName !== expected.displayName ||
    organization.timezone !== expected.timezone ||
    organization.defaultLocale !== expected.defaultLocale ||
    organization.status !== expected.status
  ) {
    throw new StagingBusinessOperatorFailure('BUSINESS_FIXTURE_ORGANIZATION_CONFLICT');
  }
  return organization;
}

async function ensurePasswordUser(
  transaction: Prisma.TransactionClient,
  input: {
    organizationId: string;
    email: string;
    role: 'ADMIN' | 'TEACHER';
    password: string;
    conflictCode: string;
    component: string;
  },
  now: Date,
  created: string[],
): Promise<User> {
  let user = await transaction.user.findUnique({
    where: {
      organizationId_primaryEmailNormalized: { emailIdentityScope: 'PRIMARY',
        organizationId: input.organizationId,
        primaryEmailNormalized: input.email,
      },
    },
  });
  if (user === null) {
    user = await transaction.user.create({
      data: {
        id: uuidv7(),
        organizationId: input.organizationId,
        role: input.role,
        status: 'ACTIVE',
        primaryEmail: input.email,
        primaryEmailNormalized: input.email,
        emailVerifiedAt: now,
        passwordHash: await hash(input.password, { type: argon2id }),
        createdAt: now,
        updatedAt: now,
      },
    });
    created.push(input.component);
  } else {
    if (
      user.role !== input.role ||
      user.status !== 'ACTIVE' ||
      user.primaryEmail !== input.email ||
      user.primaryEmailNormalized !== input.email ||
      user.emailVerifiedAt === null ||
      user.passwordHash === null ||
      user.deletedAt !== null
    ) {
      throw new StagingBusinessOperatorFailure(input.conflictCode);
    }
    if (!(await verify(user.passwordHash, input.password))) {
      throw new StagingBusinessOperatorFailure(`${input.conflictCode}_PASSWORD`);
    }
  }
  return user;
}

async function ensureAdminProfile(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  employeeNumber: string,
  fullName: string,
  now: Date,
  created: string[],
  component: string,
): Promise<AdminProfile> {
  let profile = await transaction.adminProfile.findUnique({ where: { userId } });
  if (profile === null) {
    const conflict = await transaction.adminProfile.findUnique({
      where: { organizationId_employeeNumber: { organizationId, employeeNumber } },
    });
    if (conflict !== null) {
      throw new StagingBusinessOperatorFailure('BUSINESS_FIXTURE_ADMIN_PROFILE_CONFLICT');
    }
    profile = await transaction.adminProfile.create({
      data: {
        id: uuidv7(),
        organizationId,
        userId,
        employeeNumber,
        fullName,
        departmentName: 'Synthetic Staging Operations',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
    });
    created.push(component);
  } else if (
    profile.organizationId !== organizationId ||
    profile.employeeNumber !== employeeNumber ||
    profile.fullName !== fullName ||
    profile.departmentName !== 'Synthetic Staging Operations' ||
    profile.status !== 'ACTIVE' ||
    profile.deletedAt !== null
  ) {
    throw new StagingBusinessOperatorFailure('BUSINESS_FIXTURE_ADMIN_PROFILE_CONFLICT');
  }
  return profile;
}

async function ensureSecondAdmin(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  now: Date,
  created: string[],
): Promise<User> {
  const employeeNumber = 'SYNTH-STAGING-ADMIN-B';
  let profile = await transaction.adminProfile.findUnique({
    where: { organizationId_employeeNumber: { organizationId, employeeNumber } },
    include: { user: true },
  });
  if (profile === null) {
    const user = await transaction.user.create({
      data: {
        id: uuidv7(),
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
    profile = await transaction.adminProfile.create({
      data: {
        id: uuidv7(),
        organizationId,
        userId: user.id,
        employeeNumber,
        fullName: 'Synthetic Staging Business Admin B',
        departmentName: 'Synthetic Staging Operations',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
      include: { user: true },
    });
    created.push('secondAdminUser', 'secondAdminProfile');
  } else if (
    profile.user.organizationId !== organizationId ||
    profile.user.role !== 'ADMIN' ||
    profile.user.status !== 'ACTIVE' ||
    profile.user.primaryEmail !== null ||
    profile.user.passwordHash !== null ||
    profile.user.deletedAt !== null ||
    profile.fullName !== 'Synthetic Staging Business Admin B' ||
    profile.departmentName !== 'Synthetic Staging Operations' ||
    profile.status !== 'ACTIVE' ||
    profile.deletedAt !== null
  ) {
    throw new StagingBusinessOperatorFailure('BUSINESS_FIXTURE_SECOND_ADMIN_CONFLICT');
  }
  return profile.user;
}

async function ensureTeacherProfile(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  now: Date,
  created: string[],
): Promise<TeacherProfile> {
  const employeeNumber = 'SYNTH-STAGING-TEACHER';
  let profile = await transaction.teacherProfile.findUnique({ where: { userId } });
  if (profile === null) {
    const conflict = await transaction.teacherProfile.findUnique({
      where: { organizationId_employeeNumber: { organizationId, employeeNumber } },
    });
    if (conflict !== null) {
      throw new StagingBusinessOperatorFailure('BUSINESS_FIXTURE_TEACHER_PROFILE_CONFLICT');
    }
    profile = await transaction.teacherProfile.create({
      data: {
        id: uuidv7(),
        organizationId,
        userId,
        employeeNumber,
        fullName: 'Synthetic Staging Business Teacher',
        collegeName: 'Synthetic Staging College',
        departmentName: 'Synthetic Physical Education',
        title: 'Synthetic Instructor',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
    });
    created.push('teacherProfile');
  } else if (
    profile.organizationId !== organizationId ||
    profile.employeeNumber !== employeeNumber ||
    profile.fullName !== 'Synthetic Staging Business Teacher' ||
    profile.collegeName !== 'Synthetic Staging College' ||
    profile.departmentName !== 'Synthetic Physical Education' ||
    profile.title !== 'Synthetic Instructor' ||
    profile.status !== 'ACTIVE' ||
    profile.deletedAt !== null
  ) {
    throw new StagingBusinessOperatorFailure('BUSINESS_FIXTURE_TEACHER_PROFILE_CONFLICT');
  }
  return profile;
}

async function ensureStudent(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  studentEmail: string,
  now: Date,
  created: string[],
): Promise<StudentProfile> {
  let profile = await transaction.studentProfile.findUnique({
    where: {
      organizationId_studentNumber: {
        organizationId,
        studentNumber: STAGING_BUSINESS_STUDENT_NUMBER,
      },
    },
    include: { user: true },
  });
  if (profile === null) {
    const emailConflict = await transaction.user.findUnique({
      where: {
        organizationId_primaryEmailNormalized: { emailIdentityScope: 'PRIMARY',
          organizationId,
          primaryEmailNormalized: studentEmail,
        },
      },
    });
    if (emailConflict !== null) {
      throw new StagingBusinessOperatorFailure('BUSINESS_FIXTURE_STUDENT_EMAIL_CONFLICT');
    }
    const user = await transaction.user.create({
      data: {
        id: uuidv7(),
        organizationId,
        role: 'STUDENT',
        status: 'ACTIVE',
        primaryEmail: studentEmail,
        primaryEmailNormalized: studentEmail,
        emailVerifiedAt: now,
        passwordHash: null,
        createdAt: now,
        updatedAt: now,
      },
    });
    profile = await transaction.studentProfile.create({
      data: {
        id: uuidv7(),
        organizationId,
        userId: user.id,
        studentNumber: STAGING_BUSINESS_STUDENT_NUMBER,
        fullName: STAGING_BUSINESS_STUDENT_NAME,
        gender: 'FEMALE',
        gradeYear: 2026,
        collegeName: 'Synthetic Staging College',
        majorName: 'Synthetic Staging Major',
        administrativeClassName: 'Synthetic Staging Class',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
      include: { user: true },
    });
    created.push('studentUser', 'studentProfile');
  } else if (
    profile.user.organizationId !== organizationId ||
    profile.user.role !== 'STUDENT' ||
    profile.user.status !== 'ACTIVE' ||
    profile.user.primaryEmail !== studentEmail ||
    profile.user.primaryEmailNormalized !== studentEmail ||
    profile.user.emailVerifiedAt === null ||
    profile.user.passwordHash !== null ||
    profile.user.deletedAt !== null ||
    profile.fullName !== STAGING_BUSINESS_STUDENT_NAME ||
    profile.gender !== 'FEMALE' ||
    profile.gradeYear !== 2026 ||
    profile.status !== 'ACTIVE' ||
    profile.deletedAt !== null
  ) {
    throw new StagingBusinessOperatorFailure('BUSINESS_FIXTURE_STUDENT_CONFLICT');
  }
  return profile;
}

async function ensureSystemPolicy(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  adminUserId: string,
  now: Date,
  created: string[],
): Promise<void> {
  const policy = await transaction.systemPolicy.findUnique({ where: { organizationId } });
  if (policy === null) {
    await transaction.systemPolicy.create({
      data: {
        organizationId,
        systemMode: 'NORMAL',
        changedBy: adminUserId,
        changeReason: 'Synthetic staging business fixture bootstrap',
        updatedAt: now,
      },
    });
    created.push('systemPolicy');
  } else if (policy.systemMode !== 'NORMAL' || policy.changedBy !== adminUserId) {
    throw new StagingBusinessOperatorFailure('BUSINESS_FIXTURE_SYSTEM_POLICY_CONFLICT');
  }
}

async function ensureSemester(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  adminUserId: string,
  now: Date,
  created: string[],
): Promise<Semester> {
  const where = {
    organizationId_academicYear_termCode: {
      organizationId,
      academicYear: '2026-2027',
      termCode: 'FIRST',
    },
  };
  let semester = await transaction.semester.findUnique({ where });
  const startDate = new Date('2026-08-01T00:00:00.000Z');
  const endDate = new Date('2027-01-31T00:00:00.000Z');
  if (semester === null) {
    semester = await transaction.semester.create({
      data: {
        id: uuidv7(),
        organizationId,
        academicYear: '2026-2027',
        termCode: 'FIRST',
        displayName: 'Synthetic Staging Business Semester',
        startDate,
        endDate,
        status: 'CURRENT',
        createdBy: adminUserId,
        createdAt: now,
        updatedAt: now,
      },
    });
    created.push('semester');
  } else if (
    semester.displayName !== 'Synthetic Staging Business Semester' ||
    dateOnly(semester.startDate) !== dateOnly(startDate) ||
    dateOnly(semester.endDate) !== dateOnly(endDate) ||
    semester.status !== 'CURRENT' ||
    semester.createdBy !== adminUserId
  ) {
    throw new StagingBusinessOperatorFailure('BUSINESS_FIXTURE_SEMESTER_CONFLICT');
  }
  return semester;
}

async function ensureCourse(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  adminUserId: string,
  now: Date,
  created: string[],
): Promise<Course> {
  let course = await transaction.course.findUnique({
    where: {
      organizationId_courseCode: {
        organizationId,
        courseCode: STAGING_BUSINESS_COURSE_CODE,
      },
    },
  });
  if (course === null) {
    course = await transaction.course.create({
      data: {
        id: uuidv7(),
        organizationId,
        courseCode: STAGING_BUSINESS_COURSE_CODE,
        courseName: 'Synthetic Staging Business Course',
        description: 'Synthetic staging-only Phase 12 closure data',
        status: 'ACTIVE',
        createdBy: adminUserId,
        updatedBy: adminUserId,
        createdAt: now,
        updatedAt: now,
      },
    });
    created.push('course');
  } else if (
    course.courseName !== 'Synthetic Staging Business Course' ||
    course.description !== 'Synthetic staging-only Phase 12 closure data' ||
    course.status !== 'ACTIVE' ||
    course.createdBy !== adminUserId ||
    course.updatedBy !== adminUserId ||
    course.deletedAt !== null
  ) {
    throw new StagingBusinessOperatorFailure('BUSINESS_FIXTURE_COURSE_CONFLICT');
  }
  return course;
}

async function ensureClassSection(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  semesterId: string,
  courseId: string,
  teacherUserId: string,
  teacherProfileId: string,
  now: Date,
  created: string[],
): Promise<ClassSection> {
  let section = await transaction.classSection.findUnique({
    where: {
      semesterId_courseId_classCode: {
        semesterId,
        courseId,
        classCode: STAGING_BUSINESS_CLASS_CODE,
      },
    },
  });
  const checkInStartDate = new Date('2026-08-01T00:00:00.000Z');
  const checkInEndDate = new Date('2027-01-31T00:00:00.000Z');
  const submissionDeadlineAt = new Date('2027-02-01T00:00:00.000Z');
  if (section === null) {
    section = await transaction.classSection.create({
      data: {
        id: uuidv7(),
        organizationId,
        courseId,
        semesterId,
        teacherId: teacherProfileId,
        classCode: STAGING_BUSINESS_CLASS_CODE,
        displayName: 'Synthetic Staging Business Section',
        status: 'ACTIVE',
        isEnrollmentOpen: true,
        checkInWindowMode: 'AVAILABLE',
        checkInStartDate,
        checkInEndDate,
        dailyStartTime: null,
        dailyEndTime: null,
        submissionDeadlineAt,
        createdBy: teacherUserId,
        updatedBy: teacherUserId,
        createdAt: now,
        updatedAt: now,
      },
    });
    created.push('classSection');
  } else if (
    section.organizationId !== organizationId ||
    section.teacherId !== teacherProfileId ||
    section.displayName !== 'Synthetic Staging Business Section' ||
    section.status !== 'ACTIVE' ||
    !section.isEnrollmentOpen ||
    section.checkInWindowMode !== 'AVAILABLE' ||
    section.checkInStartDate === null ||
    dateOnly(section.checkInStartDate) !== dateOnly(checkInStartDate) ||
    section.checkInEndDate === null ||
    dateOnly(section.checkInEndDate) !== dateOnly(checkInEndDate) ||
    section.dailyStartTime !== null ||
    section.dailyEndTime !== null ||
    section.submissionDeadlineAt?.toISOString() !== submissionDeadlineAt.toISOString() ||
    section.createdBy !== teacherUserId ||
    section.updatedBy !== teacherUserId ||
    section.closedAt !== null
  ) {
    throw new StagingBusinessOperatorFailure('BUSINESS_FIXTURE_CLASS_SECTION_CONFLICT');
  }
  return section;
}

async function ensureScoreRule(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  semesterId: string,
  classSectionId: string,
  teacherUserId: string,
  firstAdminUserId: string,
  secondAdminUserId: string,
  now: Date,
  created: string[],
): Promise<ScoreRule> {
  let rule = await transaction.scoreRule.findUnique({
    where: { classSectionId_ruleVersion: { classSectionId, ruleVersion: 1 } },
  });
  const definition = {
    formulaType: 'LINEAR_CAPPED',
    maximumScore: 100,
    categoryAllocationMode: 'TOTAL_ONLY',
  };
  if (rule === null) {
    rule = await transaction.scoreRule.create({
      data: {
        id: uuidv7(),
        organizationId,
        classSectionId,
        semesterId,
        ruleCode: 'SYNTHETIC_STAGING_TOTAL_20H',
        ruleVersion: 1,
        displayName: 'Synthetic staging 20-hour rule',
        totalRequiredSeconds: 72_000n,
        calculationDefinition: definition,
        roundingMode: 'HALF_UP',
        roundingScale: 2,
        status: 'ACTIVE',
        createdBy: teacherUserId,
        submittedAt: now,
        activatedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    });
    created.push('scoreRule');
  } else if (
    rule.organizationId !== organizationId ||
    rule.semesterId !== semesterId ||
    rule.ruleCode !== 'SYNTHETIC_STAGING_TOTAL_20H' ||
    rule.displayName !== 'Synthetic staging 20-hour rule' ||
    rule.totalRequiredSeconds !== 72_000n ||
    !matchesCalculationDefinition(rule.calculationDefinition) ||
    rule.roundingMode !== 'HALF_UP' ||
    rule.roundingScale !== 2 ||
    rule.status !== 'ACTIVE' ||
    rule.createdBy !== teacherUserId ||
    rule.submittedAt === null ||
    rule.activatedAt === null ||
    rule.supersededAt !== null
  ) {
    throw new StagingBusinessOperatorFailure('BUSINESS_FIXTURE_SCORE_RULE_CONFLICT');
  }

  for (const [index, actorUserId] of [firstAdminUserId, secondAdminUserId].entries()) {
    const existing = await transaction.scoreRuleApprovalEvent.findUnique({
      where: {
        scoreRuleId_actorUserId_action: {
          scoreRuleId: rule.id,
          actorUserId,
          action: 'APPROVE',
        },
      },
    });
    if (existing === null) {
      await transaction.scoreRuleApprovalEvent.create({
        data: {
          id: uuidv7(),
          organizationId,
          scoreRuleId: rule.id,
          action: 'APPROVE',
          actorUserId,
          reason: 'Synthetic staging two-person approval fixture',
          requestId: `staging-business-score-approval-${index + 1}`,
          createdAt: now,
        },
      });
      created.push(`scoreRuleApproval${index + 1}`);
    } else if (
      existing.organizationId !== organizationId ||
      existing.reason !== 'Synthetic staging two-person approval fixture'
    ) {
      throw new StagingBusinessOperatorFailure('BUSINESS_FIXTURE_SCORE_APPROVAL_CONFLICT');
    }
  }
  return rule;
}

function validatePassword(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length < 24 ||
    value.length > 128 ||
    value.includes('CHANGE_ME') ||
    value.trim() !== value
  ) {
    throw new StagingBusinessOperatorFailure('BUSINESS_FIXTURE_PASSWORD_INVALID');
  }
  return value;
}

function validateControlledMailbox(value: unknown): string {
  if (typeof value !== 'string' || value.trim() !== value || value !== value.toLowerCase()) {
    throw new StagingBusinessOperatorFailure('CONTROLLED_MAILBOX_INVALID');
  }
  const match = /^([a-z0-9.!#$%&'*+/=?^_`{|}~-]+)@([a-z0-9.-]+)$/u.exec(value);
  if (match === null || value.length > 254) {
    throw new StagingBusinessOperatorFailure('CONTROLLED_MAILBOX_INVALID');
  }
  const domain = match[2] ?? '';
  if (
    RESERVED_MAIL_DOMAINS.has(domain) ||
    domain.endsWith('.invalid') ||
    domain.endsWith('.test') ||
    domain.endsWith('.example') ||
    !domain.includes('.')
  ) {
    throw new StagingBusinessOperatorFailure('CONTROLLED_MAILBOX_NOT_DELIVERABLE');
  }
  return value;
}

function matchesCalculationDefinition(value: Prisma.JsonValue): boolean {
  return (
    isRecord(value) &&
    Object.keys(value).length === 3 &&
    value.formulaType === 'LINEAR_CAPPED' &&
    value.maximumScore === 100 &&
    value.categoryAllocationMode === 'TOTAL_ONLY'
  );
}

function shanghaiBusinessDate(value: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  return new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00.000Z`);
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
