export type ClassSectionDomainErrorCode =
  | 'CLASS_SECTION_FIELD_INVALID'
  | 'CLASS_SECTION_STATUS_INVALID'
  | 'CLASS_SECTION_NOT_WRITABLE'
  | 'CLASS_SECTION_UPDATE_EMPTY'
  | 'CLASS_SECTION_VERSION_INVALID'
  | 'CLASS_SECTION_DATE_RANGE_INVALID'
  | 'CLASS_SECTION_TIME_RANGE_INVALID'
  | 'CLASS_SECTION_EXCLUDED_DATE_INVALID'
  | 'CLASS_SECTION_TEACHER_SCOPE_DENIED';

export class ClassSectionDomainError extends Error {
  constructor(readonly code: ClassSectionDomainErrorCode) {
    super(code);
    this.name = 'ClassSectionDomainError';
  }
}
