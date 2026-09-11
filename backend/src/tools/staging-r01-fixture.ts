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
  type TeacherProfile,
  type User,
} from '../generated/prisma/client.js';

export const STAGING_R01_CONFIRMATION = 'BNBU_SPORTS_STAGING_R01_PROVISIONING_V1';
export const STAGING_R01_ORGANIZATION_CODE = 'BNBU';
export const STAGING_R01_ORGANIZATION_ALIAS = 'R01-TEST-ORG';
export const STAGING_R01_COURSE_CODE = 'R01-TEST-COURSE-A';
export const STAGING_R01_CLASS_SECTION_CODE = 'R01-TEST-SECTION-A';
export const STAGING_R01_FIXTURE_AUDIT_ACTION = 'STAGING_FIXTURE_BOOTSTRAP';
export const STAGING_R01_FIXTURE_PERMISSION_ID = 'OPERATIONS-STAGING-R01-FIXTURE';

export const STAGING_R01_SAFE_ALIASES = Object.freeze({
  organization: STAGING_R01_ORGANIZATION_ALIAS,
  organizationCode: STAGING_R01_ORGANIZATION_CODE,
  course: STAGING_R01_COURSE_CODE,
  classSection: STAGING_R01_CLASS_SECTION_CODE,
  admin: 'ADMIN-01',
  teacher: 'TEACHER-01',
  reservedStudentNumbers: ['STUDENT-ANDROID-01', 'STUDENT-IOS-01', 'STUDENT-WEB-01'] as const,
  internalSupportIdentity: 'R01-INTERNAL-SCORE-APPROVER',
});

const PHASE_12_ORGANIZATION_CODE = 'STAGING-BUSINESS-SYNTHETIC';
const SECRET_MAX_BYTES = 16 * 1024;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });
export const STAGING_R01_FIXTURE_SECRET_KEYS = [
  'STAGING_R01_ADMIN_ACCOUNT',
  'STAGING_R01_ADMIN_PASSWORD',
  'STAGING_R01_TEACHER_ACCOUNT',
  'STAGING_R01_TEACHER_PASSWORD',
] as const;
export const STAGING_R01_RETIRED_SECRET_ENV_KEYS = [
  'STAGING_R01_STUDENT_ANDROID_EMAIL',
  'STAGING_R01_STUDENT_IOS_EMAIL',
  'STAGING_R01_STUDENT_WEB_EMAIL',
] as const;
export const STAGING_R01_FORBIDDEN_ENV_KEYS = [
  ...STAGING_R01_FIXTURE_SECRET_KEYS,
  ...STAGING_R01_RETIRED_SECRET_ENV_KEYS,
] as const;

type SecretKey = (typeof STAGING_R01_FIXTURE_SECRET_KEYS)[number];

export interface StagingR01FixtureSecret {
  adminAccount: string;
  adminPassword: string;
  teacherAccount: string;
  teacherPassword: string;
}

export interface StagingR01FixtureState {
  organizationId: string;
  adminUserId: string;
  teacherUserId: string;
  teacherProfileId: string;
  semesterId: string;
  courseId: string;
  classSectionId: string;
  scoreRuleId: string;
}

export interface StagingR01FixtureCounts {
  managedUsers: number;
  adminUsers: number;
  teacherUsers: number;
  studentUsers: number;
  interactiveAccounts: number;
  internalSupportAccounts: number;
  adminProfiles: number;
  teacherProfiles: number;
  studentProfiles: number;
  reservedStudentProfiles: number;
  authSessions: number;
  enrollments: number;
}

export interface StagingR01FixtureOutcome {
  status: 'CREATED' | 'VERIFIED';
  createdComponents: string[];
  counts: StagingR01FixtureCounts;
  state: StagingR01FixtureState;
}

export class StagingR01ProvisioningFailure extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'StagingR01ProvisioningFailure';
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

interface PasswordActorInput {
  organizationId: string;
  account: string;
  role: 'ADMIN' | 'TEACHER';
  password: string;
  component: string;
  conflictCode: string;
}

type ProfileKind = 'ADMIN' | 'TEACHER' | 'STUDENT';

export async function loadStagingR01FixtureSecret(
  filePath: string,
  dependencies: SecretFileDependencies = {},
): Promise<StagingR01FixtureSecret> {
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
    throw new StagingR01ProvisioningFailure('R01_FIXTURE_SECRET_UNAVAILABLE');
  }
  if (
    metadata.uid !== 0 ||
    metadata.gid !== 10_001 ||
    (metadata.mode & 0o7777) !== 0o640 ||
    !metadata.isFile ||
    metadata.isSymbolicLink
  ) {
    throw new StagingR01ProvisioningFailure('R01_FIXTURE_SECRET_PERMISSIONS_INVALID');
  }

  let bytes: Uint8Array;
  try {
    bytes = await (dependencies.readSecretFile ?? readFile)(filePath);
  } catch {
    throw new StagingR01ProvisioningFailure('R01_FIXTURE_SECRET_UNAVAILABLE');
  }
  if (bytes.byteLength > SECRET_MAX_BYTES) {
    throw new StagingR01ProvisioningFailure('R01_FIXTURE_SECRET_TOO_LARGE');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(UTF8_DECODER.decode(bytes));
  } catch {
    throw new StagingR01ProvisioningFailure('R01_FIXTURE_SECRET_INVALID');
  }
  if (!isRecord(parsed)) {
    throw new StagingR01ProvisioningFailure('R01_FIXTURE_SECRET_INVALID_SHAPE');
  }
  const expectedKeys = [...STAGING_R01_FIXTURE_SECRET_KEYS].sort();
  const actualKeys = Object.keys(parsed).sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new StagingR01ProvisioningFailure('R01_FIXTURE_SECRET_KEYS_INVALID');
  }

  const values = parsed as Record<SecretKey, unknown>;
  const secret: StagingR01FixtureSecret = {
    adminAccount: validateLoginAccount(values.STAGING_R01_ADMIN_ACCOUNT),
    adminPassword: validatePassword(values.STAGING_R01_ADMIN_PASSWORD),
    teacherAccount: validateLoginAccount(values.STAGING_R01_TEACHER_ACCOUNT),
    teacherPassword: validatePassword(values.STAGING_R01_TEACHER_PASSWORD),
  };
  if (secret.adminPassword === secret.teacherPassword) {
    throw new StagingR01ProvisioningFailure('R01_FIXTURE_PASSWORDS_NOT_ISOLATED');
  }
  const accounts = [secret.adminAccount, secret.teacherAccount];
  if (new Set(accounts).size !== accounts.length) {
    throw new StagingR01ProvisioningFailure('R01_FIXTURE_ACCOUNTS_NOT_ISOLATED');
  }
  return secret;
}

export async function ensureStagingR01Fixture(
  prisma: PrismaClient,
  secret: StagingR01FixtureSecret,
): Promise<StagingR01FixtureOutcome> {
  return prisma.$transaction(
    async (transaction) => {
      const created: string[] = [];
      const now = new Date();
      const organization = await ensureOrganization(transaction, now, created);
      await verifyPhase12Isolation(transaction, organization.id);
      const reservedStudentProfiles = await assertReservedStudentNumbersAbsent(
        transaction,
        organization.id,
      );

      const admin = await ensurePasswordActor(
        transaction,
        {
          organizationId: organization.id,
          account: secret.adminAccount,
          role: 'ADMIN',
          password: secret.adminPassword,
          component: 'adminUser',
          conflictCode: 'R01_FIXTURE_ADMIN_CONFLICT',
        },
        now,
        created,
      );
      await ensureAdminProfile(
        transaction,
        organization.id,
        admin.id,
        'R01-ADMIN-01',
        'R01 Synthetic Staging Admin',
        'R01 Staging Test Operations',
        'adminProfile',
        'R01_FIXTURE_ADMIN_PROFILE_CONFLICT',
        now,
        created,
      );
      const internalApprover = await ensureInternalApprovalAdmin(
        transaction,
        organization.id,
        now,
        created,
      );
      const teacher = await ensurePasswordActor(
        transaction,
        {
          organizationId: organization.id,
          account: secret.teacherAccount,
          role: 'TEACHER',
          password: secret.teacherPassword,
          component: 'teacherUser',
          conflictCode: 'R01_FIXTURE_TEACHER_CONFLICT',
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
        internalApprover.id,
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
            permissionId: STAGING_R01_FIXTURE_PERMISSION_ID,
            actionType: STAGING_R01_FIXTURE_AUDIT_ACTION,
            targetType: 'USER',
            targetId: admin.id,
            requestId: `staging-r01-bootstrap-${uuidv7()}`,
            idempotencyKeyReference: null,
            outcome: 'SUCCEEDED',
            reasonCode: null,
            safeMetadata: {
              fixtureKind: 'STAGING_R01_MANUAL_TESTING',
              organizationAlias: STAGING_R01_ORGANIZATION_ALIAS,
              courseAlias: STAGING_R01_COURSE_CODE,
              classSectionAlias: STAGING_R01_CLASS_SECTION_CODE,
              createdComponents: created,
            },
            sourceIpHash: null,
            deviceFingerprintHash: null,
            occurredAt: now,
          },
        });
      }

      const counts = await verifyR01OrganizationCounts(
        transaction,
        organization.id,
        reservedStudentProfiles,
      );
      return {
        status: created.length === 0 ? 'VERIFIED' : 'CREATED',
        createdComponents: created,
        counts,
        state: {
          organizationId: organization.id,
          adminUserId: admin.id,
          teacherUserId: teacher.id,
          teacherProfileId: teacherProfile.id,
          semesterId: semester.id,
          courseId: course.id,
          classSectionId: classSection.id,
          scoreRuleId: scoreRule.id,
        },
      } satisfies StagingR01FixtureOutcome;
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
    legalName: 'BNBU Sports R01 Synthetic Staging Organization',
    displayName: 'BNBU Sports R01 Staging',
    timezone: 'Asia/Shanghai',
    defaultLocale: 'zh-CN',
    status: 'ACTIVE',
  };
  let organization = await transaction.organization.findUnique({
    where: { organizationCode: STAGING_R01_ORGANIZATION_CODE },
  });
  if (organization === null) {
    organization = await transaction.organization.create({
      data: {
        id: uuidv7(),
        organizationCode: STAGING_R01_ORGANIZATION_CODE,
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
    throw new StagingR01ProvisioningFailure('R01_FIXTURE_ORGANIZATION_CONFLICT');
  }
  return organization;
}

async function verifyPhase12Isolation(
  transaction: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  const phase12 = await transaction.organization.findUnique({
    where: { organizationCode: PHASE_12_ORGANIZATION_CODE },
    select: { id: true },
  });
  if (phase12?.id === organizationId) {
    throw new StagingR01ProvisioningFailure('R01_FIXTURE_PHASE12_ISOLATION_CONFLICT');
  }
}

async function ensurePasswordActor(
  transaction: Prisma.TransactionClient,
  input: PasswordActorInput,
  now: Date,
  created: string[],
): Promise<User> {
  const candidates = await transaction.user.findMany({
    where: { primaryEmailNormalized: input.account },
    take: 2,
  });
  let user = candidates.length === 1 ? candidates[0] : undefined;
  if (candidates.length > 1) {
    throw new StagingR01ProvisioningFailure(input.conflictCode);
  }
  if (user === undefined) {
    user = await transaction.user.create({
      data: {
        id: uuidv7(),
        organizationId: input.organizationId,
        role: input.role,
        status: 'ACTIVE',
        primaryEmail: input.account,
        primaryEmailNormalized: input.account,
        emailVerifiedAt: now,
        passwordHash: await hash(input.password, { type: argon2id }),
        createdAt: now,
        updatedAt: now,
      },
    });
    created.push(input.component);
  } else {
    if (
      user.organizationId !== input.organizationId ||
      user.role !== input.role ||
      user.status !== 'ACTIVE' ||
      user.primaryEmail !== input.account ||
      user.primaryEmailNormalized !== input.account ||
      user.emailVerifiedAt === null ||
      user.passwordHash === null ||
      user.deletedAt !== null
    ) {
      throw new StagingR01ProvisioningFailure(input.conflictCode);
    }
    if (!(await verify(user.passwordHash, input.password))) {
      throw new StagingR01ProvisioningFailure(`${input.conflictCode}_PASSWORD`);
    }
  }
  return user;
}

async function assertExclusiveRoleProfile(
  transaction: Prisma.TransactionClient,
  userId: string,
  expectedProfile: ProfileKind,
  conflictCode: string,
): Promise<void> {
  const [adminProfile, teacherProfile, studentProfile] = await Promise.all([
    transaction.adminProfile.findUnique({ where: { userId }, select: { id: true } }),
    transaction.teacherProfile.findUnique({ where: { userId }, select: { id: true } }),
    transaction.studentProfile.findUnique({ where: { userId }, select: { id: true } }),
  ]);
  if (
    (expectedProfile !== 'ADMIN' && adminProfile !== null) ||
    (expectedProfile !== 'TEACHER' && teacherProfile !== null) ||
    (expectedProfile !== 'STUDENT' && studentProfile !== null)
  ) {
    throw new StagingR01ProvisioningFailure(conflictCode);
  }
}

async function ensureAdminProfile(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  employeeNumber: string,
  fullName: string,
  departmentName: string,
  component: string,
  conflictCode: string,
  now: Date,
  created: string[],
): Promise<AdminProfile> {
  await assertExclusiveRoleProfile(transaction, userId, 'ADMIN', conflictCode);
  let profile = await transaction.adminProfile.findUnique({ where: { userId } });
  if (profile === null) {
    const conflict = await transaction.adminProfile.findUnique({
      where: { organizationId_employeeNumber: { organizationId, employeeNumber } },
    });
    if (conflict !== null) throw new StagingR01ProvisioningFailure(conflictCode);
    profile = await transaction.adminProfile.create({
      data: {
        id: uuidv7(),
        organizationId,
        userId,
        employeeNumber,
        fullName,
        departmentName,
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
    profile.departmentName !== departmentName ||
    profile.status !== 'ACTIVE' ||
    profile.deletedAt !== null
  ) {
    throw new StagingR01ProvisioningFailure(conflictCode);
  }
  return profile;
}

async function ensureInternalApprovalAdmin(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  now: Date,
  created: string[],
): Promise<User> {
  const employeeNumber = 'R01-INTERNAL-APPROVER';
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
        fullName: 'R01 Internal Score Approval Support',
        departmentName: 'R01 Staging Fixture Support',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
      include: { user: true },
    });
    created.push('internalApprovalUser', 'internalApprovalProfile');
  } else {
    await assertExclusiveRoleProfile(
      transaction,
      profile.userId,
      'ADMIN',
      'R01_FIXTURE_INTERNAL_APPROVER_CONFLICT',
    );
    if (
      profile.user.organizationId !== organizationId ||
      profile.user.role !== 'ADMIN' ||
      profile.user.status !== 'ACTIVE' ||
      profile.user.primaryEmail !== null ||
      profile.user.primaryEmailNormalized !== null ||
      profile.user.emailVerifiedAt !== null ||
      profile.user.passwordHash !== null ||
      profile.user.deletedAt !== null ||
      profile.fullName !== 'R01 Internal Score Approval Support' ||
      profile.departmentName !== 'R01 Staging Fixture Support' ||
      profile.status !== 'ACTIVE' ||
      profile.deletedAt !== null
    ) {
      throw new StagingR01ProvisioningFailure('R01_FIXTURE_INTERNAL_APPROVER_CONFLICT');
    }
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
  const employeeNumber = 'R01-TEACHER-01';
  await assertExclusiveRoleProfile(
    transaction,
    userId,
    'TEACHER',
    'R01_FIXTURE_TEACHER_PROFILE_CONFLICT',
  );
  let profile = await transaction.teacherProfile.findUnique({ where: { userId } });
  if (profile === null) {
    const conflict = await transaction.teacherProfile.findUnique({
      where: { organizationId_employeeNumber: { organizationId, employeeNumber } },
    });
    if (conflict !== null) {
      throw new StagingR01ProvisioningFailure('R01_FIXTURE_TEACHER_PROFILE_CONFLICT');
    }
    profile = await transaction.teacherProfile.create({
      data: {
        id: uuidv7(),
        organizationId,
        userId,
        employeeNumber,
        fullName: 'R01 Synthetic Staging Teacher',
        collegeName: 'R01 Synthetic Staging College',
        departmentName: 'R01 Synthetic Physical Education',
        title: 'R01 Synthetic Instructor',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
    });
    created.push('teacherProfile');
  } else if (
    profile.organizationId !== organizationId ||
    profile.employeeNumber !== employeeNumber ||
    profile.fullName !== 'R01 Synthetic Staging Teacher' ||
    profile.collegeName !== 'R01 Synthetic Staging College' ||
    profile.departmentName !== 'R01 Synthetic Physical Education' ||
    profile.title !== 'R01 Synthetic Instructor' ||
    profile.status !== 'ACTIVE' ||
    profile.deletedAt !== null
  ) {
    throw new StagingR01ProvisioningFailure('R01_FIXTURE_TEACHER_PROFILE_CONFLICT');
  }
  return profile;
}

async function assertReservedStudentNumbersAbsent(
  transaction: Prisma.TransactionClient,
  organizationId: string,
): Promise<number> {
  const conflictingProfileCount = await transaction.studentProfile.count({
    where: {
      organizationId,
      studentNumber: { in: [...STAGING_R01_SAFE_ALIASES.reservedStudentNumbers] },
    },
  });
  if (conflictingProfileCount > 0) {
    throw new StagingR01ProvisioningFailure('R01_FIXTURE_RESERVED_STUDENT_CONFLICT');
  }
  return conflictingProfileCount;
}

async function verifyR01OrganizationCounts(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  reservedStudentProfiles: number,
): Promise<StagingR01FixtureCounts> {
  const [
    managedUsers,
    adminUsers,
    teacherUsers,
    studentUsers,
    interactiveAccounts,
    internalSupportAccounts,
    adminProfiles,
    teacherProfiles,
    studentProfiles,
    authSessions,
    enrollments,
  ] = await Promise.all([
    transaction.user.count({ where: { organizationId } }),
    transaction.user.count({ where: { organizationId, role: 'ADMIN' } }),
    transaction.user.count({ where: { organizationId, role: 'TEACHER' } }),
    transaction.user.count({ where: { organizationId, role: 'STUDENT' } }),
    transaction.user.count({ where: { organizationId, passwordHash: { not: null } } }),
    transaction.user.count({
      where: { organizationId, primaryEmail: null, passwordHash: null },
    }),
    transaction.adminProfile.count({ where: { organizationId } }),
    transaction.teacherProfile.count({ where: { organizationId } }),
    transaction.studentProfile.count({ where: { organizationId } }),
    transaction.authSession.count({ where: { organizationId } }),
    transaction.enrollment.count({ where: { organizationId } }),
  ]);
  if (authSessions !== 0) {
    throw new StagingR01ProvisioningFailure('R01_FIXTURE_AUTH_SESSION_CONFLICT');
  }
  if (enrollments !== 0) {
    throw new StagingR01ProvisioningFailure('R01_FIXTURE_ENROLLMENT_CONFLICT');
  }
  if (
    managedUsers !== 3 ||
    adminUsers !== 2 ||
    teacherUsers !== 1 ||
    studentUsers !== 0 ||
    interactiveAccounts !== 2 ||
    internalSupportAccounts !== 1 ||
    adminProfiles !== 2 ||
    teacherProfiles !== 1 ||
    studentProfiles !== 0 ||
    reservedStudentProfiles !== 0
  ) {
    throw new StagingR01ProvisioningFailure('R01_FIXTURE_IDENTITY_COUNT_CONFLICT');
  }
  return {
    managedUsers,
    adminUsers,
    teacherUsers,
    studentUsers,
    interactiveAccounts,
    internalSupportAccounts,
    adminProfiles,
    teacherProfiles,
    studentProfiles,
    reservedStudentProfiles,
    authSessions,
    enrollments,
  };
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
        changeReason: 'R01 synthetic staging fixture bootstrap',
        updatedAt: now,
      },
    });
    created.push('systemPolicy');
  } else if (policy.systemMode !== 'NORMAL' || policy.changedBy !== adminUserId) {
    throw new StagingR01ProvisioningFailure('R01_FIXTURE_SYSTEM_POLICY_CONFLICT');
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
  const startDate = new Date('2026-08-01T00:00:00.000Z');
  const endDate = new Date('2027-01-31T00:00:00.000Z');
  let semester = await transaction.semester.findUnique({ where });
  if (semester === null) {
    semester = await transaction.semester.create({
      data: {
        id: uuidv7(),
        organizationId,
        academicYear: '2026-2027',
        termCode: 'FIRST',
        displayName: 'R01 Synthetic Staging Semester',
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
    semester.displayName !== 'R01 Synthetic Staging Semester' ||
    dateOnly(semester.startDate) !== dateOnly(startDate) ||
    dateOnly(semester.endDate) !== dateOnly(endDate) ||
    semester.status !== 'CURRENT' ||
    semester.createdBy !== adminUserId
  ) {
    throw new StagingR01ProvisioningFailure('R01_FIXTURE_SEMESTER_CONFLICT');
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
        courseCode: STAGING_R01_COURSE_CODE,
      },
    },
  });
  if (course === null) {
    course = await transaction.course.create({
      data: {
        id: uuidv7(),
        organizationId,
        courseCode: STAGING_R01_COURSE_CODE,
        courseName: 'BNBU Sports R01 Test Course A',
        description: 'Synthetic staging-only R01 manual testing data',
        status: 'ACTIVE',
        createdBy: adminUserId,
        updatedBy: adminUserId,
        createdAt: now,
        updatedAt: now,
      },
    });
    created.push('course');
  } else if (
    course.courseName !== 'BNBU Sports R01 Test Course A' ||
    course.description !== 'Synthetic staging-only R01 manual testing data' ||
    course.status !== 'ACTIVE' ||
    course.createdBy !== adminUserId ||
    course.updatedBy !== adminUserId ||
    course.deletedAt !== null
  ) {
    throw new StagingR01ProvisioningFailure('R01_FIXTURE_COURSE_CONFLICT');
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
        classCode: STAGING_R01_CLASS_SECTION_CODE,
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
        classCode: STAGING_R01_CLASS_SECTION_CODE,
        displayName: 'BNBU Sports R01 Test Section A',
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
    section.courseId !== courseId ||
    section.semesterId !== semesterId ||
    section.teacherId !== teacherProfileId ||
    section.displayName !== 'BNBU Sports R01 Test Section A' ||
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
    throw new StagingR01ProvisioningFailure('R01_FIXTURE_CLASS_SECTION_CONFLICT');
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
        ruleCode: 'R01_TOTAL_20H',
        ruleVersion: 1,
        displayName: 'R01 synthetic 20-hour rule',
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
    rule.ruleCode !== 'R01_TOTAL_20H' ||
    rule.displayName !== 'R01 synthetic 20-hour rule' ||
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
    throw new StagingR01ProvisioningFailure('R01_FIXTURE_SCORE_RULE_CONFLICT');
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
          reason: 'R01 synthetic staging two-person score rule approval',
          requestId: `staging-r01-score-approval-${index + 1}`,
          createdAt: now,
        },
      });
      created.push(`scoreRuleApproval${index + 1}`);
    } else if (
      existing.organizationId !== organizationId ||
      existing.reason !== 'R01 synthetic staging two-person score rule approval'
    ) {
      throw new StagingR01ProvisioningFailure('R01_FIXTURE_SCORE_APPROVAL_CONFLICT');
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
    throw new StagingR01ProvisioningFailure('R01_FIXTURE_PASSWORD_INVALID');
  }
  return value;
}

function validateLoginAccount(value: unknown): string {
  const account = validateEmailSyntax(value);
  if (!account.split('@')[1]?.includes('.')) {
    throw new StagingR01ProvisioningFailure('R01_FIXTURE_LOGIN_ACCOUNT_INVALID');
  }
  return account;
}

function validateEmailSyntax(value: unknown): string {
  if (typeof value !== 'string' || value !== value.trim() || value !== value.toLowerCase()) {
    throw new StagingR01ProvisioningFailure('R01_FIXTURE_ACCOUNT_INVALID');
  }
  if (value.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+$/u.test(value)) {
    throw new StagingR01ProvisioningFailure('R01_FIXTURE_ACCOUNT_INVALID');
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

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
