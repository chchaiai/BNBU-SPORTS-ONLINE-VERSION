import { readProfileQualities, type ProfileQuality } from './application/student-profile-quality.js';
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/database/prisma.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { pagedResult, type PagedResult } from '../../common/http/envelope.interceptor.js';
import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';
import { ScopedCursorService } from '../../common/pagination/scoped-cursor.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { projectUser, type UserProjection } from './user-projection.js';
import type { StudentListQueryDto } from './users.dto.js';
import { requireAdminAccess } from '../v8/v81-admin-access.js';

export interface StudentProfileProjection extends Partial<ProfileQuality> {
  email?: string | null;
  emailVerified?: boolean;
  courseAssociations?: { classSectionId: string; classCode: string; className: string; courseName: string; semesterName: string; status: string }[];
  dateOfBirth: string | null;
  regionCode: string | null;
  otherRegionName: string | null;
  id: string;
  organizationId: string;
  userId: string;
  studentNumber: string;
  fullName: string;
  gender: string;
  gradeYear: number;
  collegeName: string | null;
  majorName: string | null;
  administrativeClassName: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export interface TeacherProfileProjection {
  email?: string | null;
  id: string;
  organizationId: string;
  userId: string;
  employeeNumber: string;
  fullName: string;
  collegeName: string | null;
  departmentName: string | null;
  title: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

interface AdminProfileProjection {
  id: string;
  organizationId: string;
  userId: string;
  employeeNumber: string;
  fullName: string;
  departmentName: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export interface CurrentUserProjection {
  user: UserProjection;
  studentProfile: StudentProfileProjection | null;
  teacherProfile: TeacherProfileProjection | null;
  adminProfile: AdminProfileProjection | null;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cursors: ScopedCursorService,
  ) {}

  async current(principal: AuthenticatedPrincipal): Promise<CurrentUserProjection> {
    const user = await this.prisma.user.findUnique({
      where: { id: principal.userId },
      include: { studentProfile: true, teacherProfile: true, adminProfile: true },
    });
    if (user?.organizationId !== principal.organizationId) {
      throw new ApplicationError('USER_NOT_FOUND', 404);
    }

    const profileCount = [user.studentProfile, user.teacherProfile, user.adminProfile].filter(
      (profile) => profile !== null,
    ).length;
    const roleMatches =
      (user.role === 'STUDENT' && user.studentProfile !== null) ||
      (user.role === 'TEACHER' && user.teacherProfile !== null) ||
      (user.role === 'ADMIN' && user.adminProfile !== null);
    if (profileCount !== 1 || !roleMatches) {
      throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
        invariant: 'USER_SINGLE_PROFILE_REQUIRED',
      });
    }

    return {
      user: projectUser(user),
      studentProfile:
        user.studentProfile === null
          ? null
          : {...this.projectStudent(user.studentProfile),...(await readProfileQualities(this.prisma,[user.studentProfile])).get(user.studentProfile.id)},
      teacherProfile:
        user.teacherProfile === null
          ? null
          : {
              ...user.teacherProfile,
              createdAt: user.teacherProfile.createdAt.toISOString(),
              updatedAt: user.teacherProfile.updatedAt.toISOString(),
              deletedAt: user.teacherProfile.deletedAt?.toISOString() ?? null,
            },
      adminProfile:
        user.adminProfile === null
          ? null
          : {
              ...user.adminProfile,
              createdAt: user.adminProfile.createdAt.toISOString(),
              updatedAt: user.adminProfile.updatedAt.toISOString(),
              deletedAt: user.adminProfile.deletedAt?.toISOString() ?? null,
            },
    };
  }

  async listStudents(
    principal: AuthenticatedPrincipal,
    input: StudentListQueryDto,
  ): Promise<PagedResult<StudentProfileProjection>> {
    if (principal.role === 'ADMIN') await requireAdminAccess(this.prisma, principal, 'USER_ACCOUNTS');
    if (input.email !== undefined && principal.role !== 'ADMIN') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    const descending = input.sort.startsWith('-');
    const sortField = input.sort.replace(/^-/, '') as 'fullName' | 'studentNumber' | 'createdAt';
    const filters = {
      q: input.q ?? null,
      classSectionId: input.classSectionId ?? null,
      status: input.status ?? null,
      collegeName: input.collegeName ?? null,
      gender: input.gender ?? null,
      gradeYear: input.gradeYear ?? null,
      email: input.email ?? null,
    };
    const binding = {
      resource: 'STUDENT_PROFILE' as const,
      organizationId: principal.organizationId,
      principalId: principal.userId,
      role: principal.role,
      filters,
      sort: input.sort,
      limit: input.limit,
    };
    const position = this.cursors.decode(input.cursor, binding);
    const scope: Prisma.StudentProfileWhereInput =
      principal.role === 'TEACHER'
        ? {
            enrollments: {
              some: {
                status: 'ACTIVE',
                classSection: { teacher: { userId: principal.userId } },
              },
            },
          }
        : {};
    const section: Prisma.StudentProfileWhereInput =
      input.classSectionId === undefined
        ? {}
        : {
            enrollments: {
              some: { classSectionId: input.classSectionId, status: 'ACTIVE' },
            },
          };
    const search: Prisma.StudentProfileWhereInput =
      input.q === undefined
        ? {}
        : {
            OR: [
              { fullName: { contains: input.q, mode: 'insensitive' } },
              { studentNumber: { contains: input.q, mode: 'insensitive' } },
              { collegeName: { contains: input.q, mode: 'insensitive' } },
              { majorName: { contains: input.q, mode: 'insensitive' } },
              { administrativeClassName: { contains: input.q, mode: 'insensitive' } },
              ...(principal.role === 'ADMIN' ? [{ user: { primaryEmailNormalized: { contains: input.q.toLowerCase() } } }] : []),
            ],
          };
    const cursorWhere = this.studentCursorWhere(sortField, descending, position);
    const orderBy = this.studentOrderBy(sortField, descending);
    const rows = await this.prisma.studentProfile.findMany({
      where: {
        organizationId: principal.organizationId,
        deletedAt: null,
        ...(input.status === undefined ? {} : { enrollments: input.status === 'ACTIVE'
          ? { some: { status: 'ACTIVE' } } : { none: { status: 'ACTIVE' } } }),
        ...(input.collegeName === undefined ? {} : { collegeName: input.collegeName }),
        ...(input.gender === undefined ? {} : { gender: input.gender }),
        ...(input.gradeYear === undefined ? {} : { gradeYear: input.gradeYear }),
        ...(input.email === undefined ? {} : { user: { primaryEmailNormalized: { contains: input.email.toLowerCase() } } }),
        AND: [scope, section, search, cursorWhere],
      },
      include: {
        user: { select: { primaryEmail: true, emailVerifiedAt: true } },
        enrollments: { where: { organizationId: principal.organizationId,
          ...(principal.role === 'TEACHER' ? { status: 'ACTIVE', classSection: { teacher: { userId: principal.userId } } } : {}) },
          include: { classSection: { include: { course: true } }, semester: true },
          orderBy: [{ joinedAt: 'desc' }, { id: 'asc' }] },
      },
      orderBy,
      take: input.limit + 1,
    });
    const qualities=await readProfileQualities(this.prisma,rows);
    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    const last = page.at(-1);
    return pagedResult(
      page.map(({ user, enrollments, ...row }) => ({
        ...this.projectStudent(row),
        ...qualities.get(row.id),
        status: enrollments.some(enrollment => enrollment.status === 'ACTIVE') ? 'ACTIVE' : 'PENDING',
        ...(principal.role === 'ADMIN' ? { email: user.primaryEmail, emailVerified: user.emailVerifiedAt !== null } : {}),
        courseAssociations: enrollments.map(enrollment => ({
          classSectionId: enrollment.classSectionId, classCode: enrollment.classSection.classCode,
          className: enrollment.classSection.displayName, courseName: enrollment.classSection.displayName,
          semesterName: enrollment.semester.displayName, status: enrollment.status,
        })),
      })),
      {
        nextCursor:
          hasMore && last !== undefined
            ? this.cursors.encode(binding, {
                value: sortField === 'createdAt' ? last.createdAt.toISOString() : last[sortField],
                id: last.id,
              })
            : null,
        hasMore,
        limit: input.limit,
      },
    );
  }

  async getStudent(
    principal: AuthenticatedPrincipal,
    studentId: string,
  ): Promise<StudentProfileProjection> {
    const student = await this.findAuthorizedStudent(principal, studentId);
    if (student === null) throw new ApplicationError('USER_NOT_FOUND', 404);
    const quality=(await readProfileQualities(this.prisma,[student])).get(student.id);
    if (principal.role !== 'ADMIN') return {...this.projectStudent(student),...quality};
    await requireAdminAccess(this.prisma, principal, 'USER_ACCOUNTS');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: student.userId }, select: { primaryEmail: true, emailVerifiedAt: true } });
    const enrollments = await this.prisma.enrollment.findMany({ where: { studentId, organizationId: principal.organizationId },
      include: { classSection: { include: { course: true } }, semester: true }, orderBy: [{ joinedAt: 'desc' }, { id: 'asc' }] });
    return { ...this.projectStudent(student), ...quality, status: enrollments.some(enrollment => enrollment.status === 'ACTIVE') ? 'ACTIVE' : 'PENDING', email: user.primaryEmail, emailVerified: user.emailVerifiedAt !== null,
      courseAssociations: enrollments.map(enrollment => ({ classSectionId: enrollment.classSectionId,
        classCode: enrollment.classSection.classCode, className: enrollment.classSection.displayName,
        courseName: enrollment.classSection.displayName, semesterName: enrollment.semester.displayName, status: enrollment.status })) };
  }

  async denyStudentUpdate(principal: AuthenticatedPrincipal, studentId: string): Promise<never> {
    const student = await this.findAuthorizedStudent(principal, studentId);
    if (student === null) throw new ApplicationError('USER_NOT_FOUND', 404);
    throw new ApplicationError('SYSTEM_MODE_UNSUPPORTED', 503);
  }

  async getTeacher(
    principal: AuthenticatedPrincipal,
    teacherId: string,
  ): Promise<TeacherProfileProjection> {
    const roleScope: Prisma.TeacherProfileWhereInput =
      principal.role === 'STUDENT'
        ? {
            classSections: {
              some: {
                enrollments: {
                  some: { status: 'ACTIVE', student: { userId: principal.userId } },
                },
              },
            },
          }
        : principal.role === 'TEACHER'
          ? { userId: principal.userId }
          : {};
    const teacher = await this.prisma.teacherProfile.findFirst({
      where: {
        id: teacherId,
        organizationId: principal.organizationId,
        deletedAt: null,
        AND: [roleScope],
      },
    });
    if (teacher === null) throw new ApplicationError('USER_NOT_FOUND', 404);
    return { ...this.projectTeacher(teacher), ...await this.superAdminEmail(principal, teacher.userId) };
  }

  private async superAdminEmail(principal: AuthenticatedPrincipal, userId: string): Promise<{ email?: string | null }> {
    if (principal.role !== 'ADMIN') return {};
    const access = await this.prisma.$queryRaw<{ kind: string }[]>`
      SELECT kind FROM v81_admin_access WHERE user_id=${principal.userId}::uuid
      AND organization_id=${principal.organizationId}::uuid AND kind='SUPER' AND must_change_password=false`;
    if (!access[0]) return {};
    const user = await this.prisma.user.findFirst({ where: { id: userId,
      organizationId: principal.organizationId, deletedAt: null }, select: { primaryEmail: true } });
    return { email: user?.primaryEmail ?? null };
  }

  private async findAuthorizedStudent(
    principal: AuthenticatedPrincipal,
    studentId: string,
  ): Promise<Prisma.StudentProfileGetPayload<Record<string, never>> | null> {
    const roleScope: Prisma.StudentProfileWhereInput =
      principal.role === 'STUDENT'
        ? { userId: principal.userId }
        : principal.role === 'TEACHER'
          ? {
              enrollments: {
                some: {
                  status: 'ACTIVE',
                  classSection: { teacher: { userId: principal.userId } },
                },
              },
            }
          : {};
    return this.prisma.studentProfile.findFirst({
      where: {
        id: studentId,
        organizationId: principal.organizationId,
        deletedAt: null,
        AND: [roleScope],
      },
    });
  }

  private studentCursorWhere(
    field: 'fullName' | 'studentNumber' | 'createdAt',
    descending: boolean,
    position: { value: string; id: string } | null,
  ): Prisma.StudentProfileWhereInput {
    if (position === null) return {};
    const scalar = field === 'createdAt' ? new Date(position.value) : position.value;
    if (field === 'createdAt' && Number.isNaN((scalar as Date).getTime())) {
      throw new ApplicationError('VALIDATION_FORMAT_INVALID', 422);
    }
    const comparison = descending ? { lt: scalar } : { gt: scalar };
    const idComparison = descending ? { lt: position.id } : { gt: position.id };
    return {
      OR: [{ [field]: comparison }, { AND: [{ [field]: scalar }, { id: idComparison }] }],
    };
  }

  private studentOrderBy(
    field: 'fullName' | 'studentNumber' | 'createdAt',
    descending: boolean,
  ): Prisma.StudentProfileOrderByWithRelationInput[] {
    const direction = descending ? 'desc' : 'asc';
    if (field === 'fullName') return [{ fullName: direction }, { id: direction }];
    if (field === 'studentNumber') return [{ studentNumber: direction }, { id: direction }];
    return [{ createdAt: direction }, { id: direction }];
  }

  private projectStudent(student: {
    dateOfBirth?: Date | null;
    regionCode?: string | null;
    otherRegionName?: string | null;
    id: string;
    organizationId: string;
    userId: string;
    studentNumber: string;
    fullName: string;
    gender: string;
    gradeYear: number;
    collegeName: string | null;
    majorName: string | null;
    administrativeClassName: string | null;
    status: string;
    version: number;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
  }): StudentProfileProjection {
    return {
      ...student,
      dateOfBirth: student.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      regionCode: student.regionCode ?? null,
      otherRegionName: student.otherRegionName ?? null,
      createdAt: student.createdAt.toISOString(),
      updatedAt: student.updatedAt.toISOString(),
      deletedAt: student.deletedAt?.toISOString() ?? null,
    };
  }

  private projectTeacher(teacher: {
    id: string;
    organizationId: string;
    userId: string;
    employeeNumber: string;
    fullName: string;
    collegeName: string | null;
    departmentName: string | null;
    title: string | null;
    status: string;
    version: number;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
  }): TeacherProfileProjection {
    return {
      ...teacher,
      createdAt: teacher.createdAt.toISOString(),
      updatedAt: teacher.updatedAt.toISOString(),
      deletedAt: teacher.deletedAt?.toISOString() ?? null,
    };
  }
}
