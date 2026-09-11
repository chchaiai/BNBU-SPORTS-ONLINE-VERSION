export type CourseDomainErrorCode =
  | 'COURSE_CODE_INVALID'
  | 'COURSE_NAME_INVALID'
  | 'COURSE_DESCRIPTION_INVALID'
  | 'COURSE_STATUS_INVALID'
  | 'COURSE_VERSION_INVALID'
  | 'COURSE_UPDATE_EMPTY';

export class CourseDomainError extends Error {
  constructor(readonly code: CourseDomainErrorCode) {
    super(code);
    this.name = 'CourseDomainError';
  }
}
