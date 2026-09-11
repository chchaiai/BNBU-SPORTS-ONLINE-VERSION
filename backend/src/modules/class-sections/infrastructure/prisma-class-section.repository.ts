import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/database/prisma.service.js';
import { ApplicationError } from '../../../common/errors/application-error.js';
import { Prisma, type PrismaClient } from '../../../generated/prisma/client.js';
import type { ClassSectionState } from '../domain/class-section.js';
import {
  ClassSectionRepository,
  type ClassSectionListQuery,
  type ClassSectionPage,
  type CourseReference,
  type SemesterReference,
  type TeacherReference,
} from '../domain/class-section.repository.js';
import type { CheckInWindowMode, ClassSectionStatus } from '../domain/class-section-status.js';

const sectionInclude = {
  excludedDates: { orderBy: { excludedDate: 'asc' as const } },
} satisfies Prisma.ClassSectionInclude;

type SectionRow = Prisma.ClassSectionGetPayload<{ include: typeof sectionInclude }>;
type SectionClient =
  | Pick<
      PrismaClient,
      | 'classSection'
      | 'classSectionExcludedDate'
      | 'teacherProfile'
      | 'course'
      | 'semester'
      | '$queryRaw'
    >
  | Prisma.TransactionClient;

@Injectable()
export class PrismaClassSectionRepository extends ClassSectionRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findTeacherByUser(
    organizationId: string,
    userId: string,
    transaction?: object,
  ): Promise<TeacherReference | null> {
    return this.client(transaction).teacherProfile.findFirst({
      where: { organizationId, userId },
      select: { id: true, organizationId: true, userId: true, status: true, deletedAt: true },
    });
  }

  async findTeacherById(
    organizationId: string,
    teacherId: string,
    transaction?: object,
  ): Promise<TeacherReference | null> {
    return this.client(transaction).teacherProfile.findFirst({
      where: { organizationId, id: teacherId },
      select: { id: true, organizationId: true, userId: true, status: true, deletedAt: true },
    });
  }

  async findCourse(
    organizationId: string,
    courseId: string,
    transaction?: object,
  ): Promise<CourseReference | null> {
    return this.client(transaction).course.findFirst({
      where: { organizationId, id: courseId },
      select: { id: true, organizationId: true, status: true, deletedAt: true },
    });
  }

  async findSemester(
    organizationId: string,
    semesterId: string,
    transaction?: object,
  ): Promise<SemesterReference | null> {
    const semester = await this.client(transaction).semester.findFirst({
      where: { organizationId, id: semesterId },
      select: { id: true, organizationId: true, status: true, startDate: true, endDate: true },
    });
    return semester === null
      ? null
      : {
          ...semester,
          startDate: this.dateText(semester.startDate),
          endDate: this.dateText(semester.endDate),
        };
  }

  async findById(
    organizationId: string,
    classSectionId: string,
    transaction?: object,
  ): Promise<ClassSectionState | null> {
    const row = await this.client(transaction).classSection.findFirst({
      where: { organizationId, id: classSectionId },
      include: sectionInclude,
    });
    return row === null ? null : this.map(row);
  }

  async findStudentVisibleById(
    organizationId: string,
    classSectionId: string,
    studentUserId: string,
  ): Promise<ClassSectionState | null> {
    const row = await this.prisma.classSection.findFirst({
      where: {
        id: classSectionId,
        organizationId,
        enrollments: {
          some: { status: 'ACTIVE', student: { userId: studentUserId } },
        },
      },
      include: sectionInclude,
    });
    return row === null ? null : this.map(row);
  }

  async create(state: ClassSectionState, transaction: object): Promise<ClassSectionState> {
    const client = this.client(transaction);
    try {
      const row = await client.classSection.create({ data: this.writeData(state) });
      if (state.excludedDates.length > 0) {
        await client.classSectionExcludedDate.createMany({
          data: state.excludedDates.map((excludedDate) => ({
            classSectionId: state.id,
            organizationId: state.organizationId,
            excludedDate: this.date(excludedDate),
            createdAt: state.createdAt,
            createdBy: state.createdBy,
          })),
        });
      }
      const created = await client.classSection.findUniqueOrThrow({
        where: { id: row.id },
        include: sectionInclude,
      });
      return this.map(created);
    } catch (error: unknown) {
      this.mapWriteError(error);
    }
  }

  async update(
    state: ClassSectionState,
    expectedVersion: number,
    replaceExcludedDates: boolean,
    transaction: object,
  ): Promise<ClassSectionState | null> {
    const client = this.client(transaction);
    try {
      const locks = await client.$queryRaw<{ version: number }[]>`
        SELECT version
        FROM class_sections
        WHERE id = ${state.id}::uuid
          AND organization_id = ${state.organizationId}::uuid
        FOR UPDATE
      `;
      if (locks[0]?.version !== expectedVersion) return null;
      if (replaceExcludedDates) {
        await client.classSectionExcludedDate.deleteMany({
          where: { classSectionId: state.id, organizationId: state.organizationId },
        });
      }
      const changed = await client.classSection.updateMany({
        where: {
          id: state.id,
          organizationId: state.organizationId,
          version: expectedVersion,
        },
        data: this.updateData(state),
      });
      if (changed.count !== 1) return null;
      if (replaceExcludedDates && state.excludedDates.length > 0) {
        await client.classSectionExcludedDate.createMany({
          data: state.excludedDates.map((excludedDate) => ({
            classSectionId: state.id,
            organizationId: state.organizationId,
            excludedDate: this.date(excludedDate),
            createdAt: state.updatedAt,
            createdBy: state.updatedBy,
          })),
        });
      }
      const row = await client.classSection.findUniqueOrThrow({
        where: { id: state.id },
        include: sectionInclude,
      });
      return this.map(row);
    } catch (error: unknown) {
      this.mapWriteError(error);
    }
  }

  async close(
    state: ClassSectionState,
    expectedVersion: number,
    transaction: object,
  ): Promise<ClassSectionState | null> {
    const client = this.client(transaction);
    try {
      const changed = await client.classSection.updateMany({
        where: {
          id: state.id,
          organizationId: state.organizationId,
          version: expectedVersion,
          status: { in: ['ACTIVE', 'UPCOMING'] },
        },
        data: this.updateData(state),
      });
      if (changed.count !== 1) return null;
      const row = await client.classSection.findUniqueOrThrow({
        where: { id: state.id },
        include: sectionInclude,
      });
      return this.map(row);
    } catch (error: unknown) {
      this.mapWriteError(error);
    }
  }

  async list(query: ClassSectionListQuery): Promise<ClassSectionPage> {
    const cursorWhere = this.cursorWhere(query);
    const where: Prisma.ClassSectionWhereInput = {
      organizationId: query.organizationId,
      ...(query.teacherId === undefined ? {} : { teacherId: query.teacherId }),
      ...(query.courseId === undefined ? {} : { courseId: query.courseId }),
      ...(query.semesterId === undefined ? {} : { semesterId: query.semesterId }),
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.search === undefined
        ? {}
        : {
            OR: [
              { classCode: { contains: query.search, mode: 'insensitive' } },
              { displayName: { contains: query.search, mode: 'insensitive' } },
            ],
          }),
      ...(query.studentUserId === undefined
        ? {}
        : {
            enrollments: {
              some: { status: 'ACTIVE', student: { userId: query.studentUserId } },
            },
          }),
      ...(cursorWhere === null ? {} : { AND: [cursorWhere] }),
    };
    const rows = await this.prisma.classSection.findMany({
      where,
      orderBy: [
        { [query.sortField]: query.sortDirection },
        { id: query.sortDirection },
      ] as Prisma.ClassSectionOrderByWithRelationInput[],
      take: query.limit + 1,
      include: sectionInclude,
    });
    return {
      items: rows.slice(0, query.limit).map((row) => this.map(row)),
      hasMore: rows.length > query.limit,
    };
  }

  private cursorWhere(query: ClassSectionListQuery): Prisma.ClassSectionWhereInput | null {
    if (query.position === null) return null;
    const comparator = query.sortDirection === 'asc' ? 'gt' : 'lt';
    const idFilter = { [comparator]: query.position.id };
    switch (query.sortField) {
      case 'classCode':
        return {
          OR: [
            { classCode: { [comparator]: query.position.value } },
            { classCode: query.position.value, id: idFilter },
          ],
        };
      case 'displayName':
        return {
          OR: [
            { displayName: { [comparator]: query.position.value } },
            { displayName: query.position.value, id: idFilter },
          ],
        };
      case 'status':
        return {
          OR: [
            { status: { [comparator]: query.position.value } },
            { status: query.position.value, id: idFilter },
          ],
        };
      case 'createdAt':
      case 'updatedAt': {
        const date = new Date(query.position.value);
        if (Number.isNaN(date.getTime())) {
          throw new ApplicationError('VALIDATION_FORMAT_INVALID', 422);
        }
        return {
          OR: [
            { [query.sortField]: { [comparator]: date } },
            { [query.sortField]: date, id: idFilter },
          ],
        };
      }
    }
  }

  private writeData(state: ClassSectionState): Prisma.ClassSectionUncheckedCreateInput {
    return {
      id: state.id,
      organizationId: state.organizationId,
      courseId: state.courseId,
      semesterId: state.semesterId,
      teacherId: state.teacherId,
      classCode: state.classCode,
      displayName: state.displayName,
      status: state.status,
      isEnrollmentOpen: state.isEnrollmentOpen,
      checkInWindowMode: state.checkInWindowMode,
      checkInStartDate: this.optionalDate(state.checkInStartDate),
      checkInEndDate: this.optionalDate(state.checkInEndDate),
      dailyStartTime: this.optionalTime(state.dailyStartTime),
      dailyEndTime: this.optionalTime(state.dailyEndTime),
      submissionDeadlineAt: state.submissionDeadlineAt,
      createdBy: state.createdBy,
      updatedBy: state.updatedBy,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      version: state.version,
      closedAt: state.closedAt,
      closedBy: state.closedBy,
      closeReason: state.closeReason,
    };
  }

  private updateData(state: ClassSectionState): Prisma.ClassSectionUncheckedUpdateManyInput {
    return {
      displayName: state.displayName,
      status: state.status,
      isEnrollmentOpen: state.isEnrollmentOpen,
      checkInWindowMode: state.checkInWindowMode,
      checkInStartDate: this.optionalDate(state.checkInStartDate),
      checkInEndDate: this.optionalDate(state.checkInEndDate),
      dailyStartTime: this.optionalTime(state.dailyStartTime),
      dailyEndTime: this.optionalTime(state.dailyEndTime),
      submissionDeadlineAt: state.submissionDeadlineAt,
      updatedBy: state.updatedBy,
      updatedAt: state.updatedAt,
      version: state.version,
      closedAt: state.closedAt,
      closedBy: state.closedBy,
      closeReason: state.closeReason,
    };
  }

  private map(row: SectionRow): ClassSectionState {
    return {
      id: row.id,
      organizationId: row.organizationId,
      courseId: row.courseId,
      semesterId: row.semesterId,
      teacherId: row.teacherId,
      classCode: row.classCode,
      displayName: row.displayName,
      status: row.status as ClassSectionStatus,
      isEnrollmentOpen: row.isEnrollmentOpen,
      checkInWindowMode: row.checkInWindowMode as CheckInWindowMode,
      checkInStartDate: row.checkInStartDate === null ? null : this.dateText(row.checkInStartDate),
      checkInEndDate: row.checkInEndDate === null ? null : this.dateText(row.checkInEndDate),
      dailyStartTime: row.dailyStartTime === null ? null : this.timeText(row.dailyStartTime),
      dailyEndTime: row.dailyEndTime === null ? null : this.timeText(row.dailyEndTime),
      submissionDeadlineAt: row.submissionDeadlineAt,
      excludedDates: row.excludedDates.map(({ excludedDate }) => this.dateText(excludedDate)),
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      version: row.version,
      closedAt: row.closedAt,
      closedBy: row.closedBy,
      closeReason: row.closeReason,
    };
  }

  private client(transaction?: object): SectionClient {
    return (transaction ?? this.prisma) as SectionClient;
  }

  private date(value: string): Date {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private optionalDate(value: string | null): Date | null {
    return value === null ? null : this.date(value);
  }

  private optionalTime(value: string | null): Date | null {
    return value === null ? null : new Date(`1970-01-01T${value}.000Z`);
  }

  private dateText(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private timeText(value: Date): string {
    return value.toISOString().slice(11, 19);
  }

  private mapWriteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ApplicationError('CONFLICT_RESOURCE_ALREADY_EXISTS', 409);
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2003', 'P2004'].includes(error.code)
    ) {
      throw new ApplicationError('VALIDATION_FAILED', 422, {
        invariant: 'CLASS_SECTION_PERSISTENCE_INVARIANT',
      });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
        invariant: 'CLASS_SECTION_PERSISTENCE_REJECTED',
      });
    }
    throw error;
  }
}
