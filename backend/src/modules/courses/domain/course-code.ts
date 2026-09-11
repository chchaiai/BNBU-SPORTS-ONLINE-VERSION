import { CourseDomainError } from './course-domain.error.js';

const COURSE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,31}$/;

export class CourseCode {
  private constructor(readonly value: string) {}

  static create(value: string): CourseCode {
    const normalized = value.trim().toUpperCase();
    if (!COURSE_CODE_PATTERN.test(normalized)) {
      throw new CourseDomainError('COURSE_CODE_INVALID');
    }
    return new CourseCode(normalized);
  }
}
