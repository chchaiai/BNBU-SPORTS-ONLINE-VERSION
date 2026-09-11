import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/database/prisma.service.js';
import type { CourseInvitePolicyContext } from '../../../common/policy/qr-join-policy-resolver.js';
import { Prisma, type CourseInvite, type PrismaClient } from '../../../generated/prisma/client.js';
import type { CourseInviteStatus } from '../domain/course-invite-status.js';
import type { CourseInviteState } from '../domain/course-invite.js';
import {
  CourseInviteRepository,
  type CourseInvitePolicyRecord,
  type JoinableClassSection,
} from '../domain/course-invite.repository.js';

const policyInclude = {
  classSection: {
    include: {
      course: true,
      semester: true,
      teacher: true,
    },
  },
} satisfies Prisma.CourseInviteInclude;

type PolicyRow = Prisma.CourseInviteGetPayload<{ include: typeof policyInclude }>;
type CourseInviteClient =
  Pick<PrismaClient, 'courseInvite' | 'classSection' | '$queryRaw'> | Prisma.TransactionClient;

@Injectable()
export class PrismaCourseInviteRepository extends CourseInviteRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lockClassSection(
    organizationId: string,
    classSectionId: string,
    transaction: object,
  ): Promise<JoinableClassSection | null> {
    const client = this.client(transaction);
    const locked = await client.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM class_sections
      WHERE id = ${classSectionId}::uuid
        AND organization_id = ${organizationId}::uuid
      FOR UPDATE
    `;
    if (locked.length !== 1) return null;
    return client.classSection.findFirst({
      where: { id: classSectionId, organizationId },
      select: {
        id: true,
        organizationId: true,
        courseId: true,
        semesterId: true,
        teacherId: true,
        status: true,
        isEnrollmentOpen: true,
        teacher: {
          select: { id: true, userId: true, status: true, deletedAt: true },
        },
        course: { select: { status: true, deletedAt: true } },
        semester: { select: { status: true, endDate: true } },
      },
    });
  }

  async nextVersion(classSectionId: string, transaction: object): Promise<number> {
    const aggregate = await this.client(transaction).courseInvite.aggregate({
      where: { classSectionId },
      _max: { versionNumber: true },
    });
    return (aggregate._max.versionNumber ?? 0) + 1;
  }

  async findActive(classSectionId: string, transaction: object): Promise<CourseInviteState | null> {
    const row = await this.client(transaction).courseInvite.findFirst({
      where: { classSectionId, status: 'ACTIVE' },
    });
    return row === null ? null : this.map(row);
  }

  async create(state: CourseInviteState, transaction: object): Promise<CourseInviteState> {
    try {
      return this.map(await this.client(transaction).courseInvite.create({ data: state }));
    } catch (error: unknown) {
      this.mapWriteError(error);
    }
  }

  async update(
    state: CourseInviteState,
    expectedVersion: number,
    transaction: object,
  ): Promise<boolean> {
    const changed = await this.client(transaction).courseInvite.updateMany({
      where: { id: state.id, rowVersion: expectedVersion },
      data: {
        status: state.status,
        revokedAt: state.revokedAt,
        revokedBy: state.revokedBy,
        revokeReason: state.revokeReason,
        replacedByInviteId: state.replacedByInviteId,
        rowVersion: state.rowVersion,
      },
    });
    return changed.count === 1;
  }

  async findById(inviteId: string, transaction?: object): Promise<CourseInviteState | null> {
    const row = await this.client(transaction).courseInvite.findUnique({ where: { id: inviteId } });
    return row === null ? null : this.map(row);
  }

  async findPolicyRecordById(inviteId: string): Promise<CourseInvitePolicyRecord | null> {
    const row = await this.prisma.courseInvite.findUnique({
      where: { id: inviteId },
      include: policyInclude,
    });
    return row === null ? null : { tokenHash: row.tokenHash, context: this.context(row) };
  }

  private context(row: PolicyRow): CourseInvitePolicyContext {
    return {
      inviteId: row.id,
      organizationId: row.organizationId,
      classSectionId: row.classSectionId,
      status: row.status,
      expiresAt: row.expiresAt,
      classSection: {
        id: row.classSection.id,
        organizationId: row.classSection.organizationId,
        courseId: row.classSection.courseId,
        semesterId: row.classSection.semesterId,
        teacherId: row.classSection.teacherId,
        displayName: row.classSection.displayName,
        status: row.classSection.status,
        isEnrollmentOpen: row.classSection.isEnrollmentOpen,
        course: {
          courseCode: row.classSection.course.courseCode,
          courseName: row.classSection.course.courseName,
          status: row.classSection.course.status,
          deletedAt: row.classSection.course.deletedAt,
        },
        semester: {
          displayName: row.classSection.semester.displayName,
          status: row.classSection.semester.status,
          endDate: row.classSection.semester.endDate,
        },
        teacher: {
          fullName: row.classSection.teacher.fullName,
          status: row.classSection.teacher.status,
          deletedAt: row.classSection.teacher.deletedAt,
        },
      },
    };
  }

  private map(row: CourseInvite): CourseInviteState {
    return { ...row, status: row.status as CourseInviteStatus };
  }

  private client(transaction?: object): CourseInviteClient {
    return (transaction ?? this.prisma) as CourseInviteClient;
  }

  private mapWriteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw error;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      throw new Error('COURSE_INVITE_PERSISTENCE_REJECTED');
    }
    throw error;
  }
}
