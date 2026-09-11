import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/database/prisma.service.js';
import { ApplicationError } from '../../../common/errors/application-error.js';
import { Prisma, type Course, type PrismaClient } from '../../../generated/prisma/client.js';
import type { CourseState } from '../domain/course.js';
import {
  CourseRepository,
  type CourseListQuery,
  type CoursePage,
} from '../domain/course.repository.js';
import type { CourseStatus } from '../domain/course-status.js';

type CourseClient = Pick<PrismaClient, 'course'> | Prisma.TransactionClient;

@Injectable()
export class PrismaCourseRepository extends CourseRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(
    organizationId: string,
    courseId: string,
    transaction?: object,
  ): Promise<CourseState | null> {
    const row = await this.client(transaction).course.findFirst({
      where: { id: courseId, organizationId, deletedAt: null },
    });
    return row === null ? null : this.map(row);
  }

  async findStudentVisibleById(
    organizationId: string,
    courseId: string,
    studentUserId: string,
  ): Promise<CourseState | null> {
    const row = await this.prisma.course.findFirst({
      where: {
        id: courseId,
        organizationId,
        deletedAt: null,
        classSections: {
          some: {
            enrollments: {
              some: { status: 'ACTIVE', student: { userId: studentUserId } },
            },
          },
        },
      },
    });
    return row === null ? null : this.map(row);
  }

  async create(state: CourseState, transaction: object): Promise<CourseState> {
    try {
      return this.map(await this.client(transaction).course.create({ data: state }));
    } catch (error: unknown) {
      this.mapWriteError(error);
    }
  }

  async update(
    state: CourseState,
    expectedVersion: number,
    transaction: object,
  ): Promise<CourseState | null> {
    const client = this.client(transaction);
    try {
      const changed = await client.course.updateMany({
        where: {
          id: state.id,
          organizationId: state.organizationId,
          deletedAt: null,
          version: expectedVersion,
        },
        data: {
          courseName: state.courseName,
          description: state.description,
          status: state.status,
          updatedBy: state.updatedBy,
          updatedAt: state.updatedAt,
          version: state.version,
        },
      });
      if (changed.count !== 1) return null;
      const row = await client.course.findUnique({ where: { id: state.id } });
      return row === null ? null : this.map(row);
    } catch (error: unknown) {
      this.mapWriteError(error);
    }
  }

  async list(query: CourseListQuery): Promise<CoursePage> {
    const cursorWhere = this.cursorWhere(query);
    const where: Prisma.CourseWhereInput = {
      organizationId: query.organizationId,
      deletedAt: null,
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.search === undefined
        ? {}
        : {
            OR: [
              { courseCode: { contains: query.search, mode: 'insensitive' } },
              { courseName: { contains: query.search, mode: 'insensitive' } },
            ],
          }),
      ...(query.studentUserId === undefined
        ? {}
        : {
            classSections: {
              some: {
                enrollments: {
                  some: {
                    status: 'ACTIVE',
                    student: { userId: query.studentUserId },
                  },
                },
              },
            },
          }),
      ...(cursorWhere === null ? {} : { AND: [cursorWhere] }),
    };
    const orderBy = [
      { [query.sortField]: query.sortDirection },
      { id: query.sortDirection },
    ] as Prisma.CourseOrderByWithRelationInput[];
    const rows = await this.prisma.course.findMany({
      where,
      orderBy,
      take: query.limit + 1,
    });
    return {
      items: rows.slice(0, query.limit).map((row) => this.map(row)),
      hasMore: rows.length > query.limit,
    };
  }

  private cursorWhere(query: CourseListQuery): Prisma.CourseWhereInput | null {
    if (query.position === null) return null;
    const comparator = query.sortDirection === 'asc' ? 'gt' : 'lt';
    const idFilter = { [comparator]: query.position.id };
    switch (query.sortField) {
      case 'courseCode':
        return {
          OR: [
            { courseCode: { [comparator]: query.position.value } },
            { courseCode: query.position.value, id: idFilter },
          ],
        };
      case 'courseName':
        return {
          OR: [
            { courseName: { [comparator]: query.position.value } },
            { courseName: query.position.value, id: idFilter },
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

  private client(transaction?: object): CourseClient {
    return (transaction ?? this.prisma) as CourseClient;
  }

  private map(row: Course): CourseState {
    return {
      ...row,
      status: row.status as CourseStatus,
    };
  }

  private mapWriteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ApplicationError('CONFLICT_RESOURCE_ALREADY_EXISTS', 409);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
        invariant: 'COURSE_PERSISTENCE_REJECTED',
      });
    }
    throw error;
  }
}
