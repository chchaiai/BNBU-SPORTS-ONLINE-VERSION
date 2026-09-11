import { CourseCode } from './course-code.js';
import { CourseDomainError } from './course-domain.error.js';
import { isCourseStatus, type CourseStatus } from './course-status.js';

export interface CourseState {
  id: string;
  organizationId: string;
  courseCode: string;
  courseName: string;
  description: string | null;
  status: CourseStatus;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
}

export interface CourseUpdate {
  courseName?: string;
  description?: string | null;
  status?: CourseStatus;
}

export class CourseEntity {
  private constructor(private state: CourseState) {}

  static create(input: {
    id: string;
    organizationId: string;
    courseCode: string;
    courseName: string;
    description?: string | null;
    actorUserId: string;
    now: Date;
  }): CourseEntity {
    return new CourseEntity({
      id: input.id,
      organizationId: input.organizationId,
      courseCode: CourseCode.create(input.courseCode).value,
      courseName: this.name(input.courseName),
      description: this.description(input.description ?? null),
      status: 'ACTIVE',
      createdBy: input.actorUserId,
      updatedBy: input.actorUserId,
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: null,
      deletedBy: null,
      version: 1,
    });
  }

  static restore(state: CourseState): CourseEntity {
    CourseCode.create(state.courseCode);
    this.name(state.courseName);
    this.description(state.description);
    if (!isCourseStatus(state.status)) throw new CourseDomainError('COURSE_STATUS_INVALID');
    if (!Number.isSafeInteger(state.version) || state.version < 1) {
      throw new CourseDomainError('COURSE_VERSION_INVALID');
    }
    return new CourseEntity({ ...state });
  }

  update(input: CourseUpdate, actorUserId: string, now: Date): string[] {
    const changedFields: string[] = [];
    if (input.courseName !== undefined) {
      const courseName = CourseEntity.name(input.courseName);
      if (courseName !== this.state.courseName) {
        this.state.courseName = courseName;
        changedFields.push('courseName');
      }
    }
    if (input.description !== undefined) {
      const description = CourseEntity.description(input.description);
      if (description !== this.state.description) {
        this.state.description = description;
        changedFields.push('description');
      }
    }
    if (input.status !== undefined) {
      if (!isCourseStatus(input.status)) throw new CourseDomainError('COURSE_STATUS_INVALID');
      if (input.status !== this.state.status) {
        this.state.status = input.status;
        changedFields.push('status');
      }
    }
    if (changedFields.length === 0) throw new CourseDomainError('COURSE_UPDATE_EMPTY');
    this.state.updatedBy = actorUserId;
    this.state.updatedAt = now;
    this.state.version += 1;
    return changedFields;
  }

  snapshot(): CourseState {
    return { ...this.state };
  }

  private static name(value: string): string {
    const normalized = value.trim();
    if (normalized.length < 1 || normalized.length > 200) {
      throw new CourseDomainError('COURSE_NAME_INVALID');
    }
    return normalized;
  }

  private static description(value: string | null): string | null {
    if (value === null) return null;
    const normalized = value.trim();
    if (normalized.length > 2000) throw new CourseDomainError('COURSE_DESCRIPTION_INVALID');
    return normalized.length === 0 ? null : normalized;
  }
}
