import { ClassSectionDomainError } from './class-section-domain.error.js';
import {
  isCheckInWindowMode,
  isClassSectionStatus,
  type CheckInWindowMode,
  type ClassSectionStatus,
} from './class-section-status.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;

export interface ClassSectionState {
  id: string;
  organizationId: string;
  courseId: string;
  semesterId: string;
  teacherId: string;
  classCode: string;
  displayName: string;
  status: ClassSectionStatus;
  isEnrollmentOpen: boolean;
  checkInWindowMode: CheckInWindowMode;
  checkInStartDate: string | null;
  checkInEndDate: string | null;
  dailyStartTime: string | null;
  dailyEndTime: string | null;
  submissionDeadlineAt: Date | null;
  excludedDates: string[];
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  closedAt: Date | null;
  closedBy: string | null;
  closeReason: string | null;
}

export interface ClassSectionUpdate {
  displayName?: string;
  isEnrollmentOpen?: boolean;
  checkInWindowMode?: CheckInWindowMode;
  checkInStartDate?: string | null;
  checkInEndDate?: string | null;
  dailyStartTime?: string | null;
  dailyEndTime?: string | null;
  submissionDeadlineAt?: string | null;
  excludedDates?: string[];
}

export interface SemesterCalendar {
  startDate: string;
  endDate: string;
}

export class ClassSectionEntity {
  private constructor(private state: ClassSectionState) {}

  static create(input: {
    id: string;
    organizationId: string;
    courseId: string;
    semesterId: string;
    teacherId: string;
    classCode: string;
    displayName: string;
    status: 'UPCOMING' | 'ACTIVE';
    isEnrollmentOpen: boolean;
    actorUserId: string;
    now: Date;
  }): ClassSectionEntity {
    const state: ClassSectionState = {
      id: input.id,
      organizationId: input.organizationId,
      courseId: input.courseId,
      semesterId: input.semesterId,
      teacherId: input.teacherId,
      classCode: this.text(input.classCode, 64),
      displayName: this.text(input.displayName, 200),
      status: input.status,
      isEnrollmentOpen: input.isEnrollmentOpen,
      checkInWindowMode: 'UNAVAILABLE',
      checkInStartDate: null,
      checkInEndDate: null,
      dailyStartTime: null,
      dailyEndTime: null,
      submissionDeadlineAt: null,
      excludedDates: [],
      createdBy: input.actorUserId,
      updatedBy: input.actorUserId,
      createdAt: input.now,
      updatedAt: input.now,
      version: 1,
      closedAt: null,
      closedBy: null,
      closeReason: null,
    };
    this.validateState(state);
    return new ClassSectionEntity(state);
  }

  static restore(state: ClassSectionState): ClassSectionEntity {
    this.validateState(state);
    return new ClassSectionEntity({ ...state, excludedDates: [...state.excludedDates] });
  }

  update(
    input: ClassSectionUpdate,
    calendar: SemesterCalendar,
    actorUserId: string,
    now: Date,
  ): string[] {
    if (this.state.status !== 'ACTIVE' && this.state.status !== 'UPCOMING') {
      throw new ClassSectionDomainError('CLASS_SECTION_NOT_WRITABLE');
    }
    const changedFields: string[] = [];
    this.assign(
      input,
      'displayName',
      (value) => ClassSectionEntity.text(value, 200),
      changedFields,
    );
    this.assign(input, 'isEnrollmentOpen', (value) => value, changedFields);
    this.assign(input, 'checkInWindowMode', (value) => value, changedFields);
    this.assign(input, 'checkInStartDate', (value) => value, changedFields);
    this.assign(input, 'checkInEndDate', (value) => value, changedFields);
    this.assign(input, 'dailyStartTime', (value) => this.time(value), changedFields);
    this.assign(input, 'dailyEndTime', (value) => this.time(value), changedFields);

    if (input.submissionDeadlineAt !== undefined) {
      const value =
        input.submissionDeadlineAt === null ? null : new Date(input.submissionDeadlineAt);
      if (value !== null && Number.isNaN(value.getTime())) {
        throw new ClassSectionDomainError('CLASS_SECTION_FIELD_INVALID');
      }
      if (value?.toISOString() !== this.state.submissionDeadlineAt?.toISOString()) {
        this.state.submissionDeadlineAt = value;
        changedFields.push('submissionDeadlineAt');
      }
    }
    if (input.excludedDates !== undefined) {
      const normalized = [...new Set(input.excludedDates)].sort();
      if (normalized.join('\0') !== this.state.excludedDates.join('\0')) {
        this.state.excludedDates = normalized;
        changedFields.push('excludedDates');
      }
    }
    if (changedFields.length === 0) {
      throw new ClassSectionDomainError('CLASS_SECTION_UPDATE_EMPTY');
    }
    ClassSectionEntity.validateState(this.state, calendar);
    this.state.updatedBy = actorUserId;
    this.state.updatedAt = now;
    this.state.version += 1;
    return changedFields;
  }

  close(reason: string, actorUserId: string, now: Date): string[] {
    if (this.state.status !== 'ACTIVE' && this.state.status !== 'UPCOMING') {
      throw new ClassSectionDomainError('CLASS_SECTION_NOT_WRITABLE');
    }
    const normalizedReason = ClassSectionEntity.text(reason, 1000);
    this.state.status = 'CLOSED';
    this.state.isEnrollmentOpen = false;
    this.state.closedAt = now;
    this.state.closedBy = actorUserId;
    this.state.closeReason = normalizedReason;
    this.state.updatedBy = actorUserId;
    this.state.updatedAt = now;
    this.state.version += 1;
    ClassSectionEntity.validateState(this.state);
    return ['status', 'isEnrollmentOpen', 'closedAt', 'closedBy', 'closeReason'];
  }

  assertOwnedBy(teacherId: string): void {
    if (this.state.teacherId !== teacherId) {
      throw new ClassSectionDomainError('CLASS_SECTION_TEACHER_SCOPE_DENIED');
    }
  }

  snapshot(): ClassSectionState {
    return { ...this.state, excludedDates: [...this.state.excludedDates] };
  }

  private assign<K extends keyof ClassSectionUpdate>(
    input: ClassSectionUpdate,
    key: K,
    normalize: (value: NonNullable<ClassSectionUpdate[K]>) => ClassSectionState[K],
    changedFields: string[],
  ): void {
    const inputValue = input[key];
    if (inputValue === undefined) return;
    const normalized =
      inputValue === null ? (null as ClassSectionState[K]) : normalize(inputValue as never);
    if (normalized !== this.state[key]) {
      this.state[key] = normalized;
      changedFields.push(key);
    }
  }

  private static validateState(state: ClassSectionState, calendar?: SemesterCalendar): void {
    this.text(state.classCode, 64);
    this.text(state.displayName, 200);
    if (!isClassSectionStatus(state.status) || !isCheckInWindowMode(state.checkInWindowMode)) {
      throw new ClassSectionDomainError('CLASS_SECTION_STATUS_INVALID');
    }
    if (!Number.isSafeInteger(state.version) || state.version < 1) {
      throw new ClassSectionDomainError('CLASS_SECTION_VERSION_INVALID');
    }
    if (state.isEnrollmentOpen && state.status !== 'ACTIVE' && state.status !== 'UPCOMING') {
      throw new ClassSectionDomainError('CLASS_SECTION_NOT_WRITABLE');
    }
    const datesPaired = (state.checkInStartDate === null) === (state.checkInEndDate === null);
    if (
      !datesPaired ||
      (state.checkInWindowMode === 'AVAILABLE' && state.checkInStartDate === null) ||
      (state.checkInStartDate !== null &&
        (!DATE_PATTERN.test(state.checkInStartDate) ||
          !DATE_PATTERN.test(state.checkInEndDate ?? '') ||
          state.checkInStartDate > (state.checkInEndDate ?? '')))
    ) {
      throw new ClassSectionDomainError('CLASS_SECTION_DATE_RANGE_INVALID');
    }
    const timesPaired = (state.dailyStartTime === null) === (state.dailyEndTime === null);
    if (
      !timesPaired ||
      (state.dailyStartTime !== null &&
        (!TIME_PATTERN.test(state.dailyStartTime) ||
          !TIME_PATTERN.test(state.dailyEndTime ?? '') ||
          state.dailyStartTime >= (state.dailyEndTime ?? '')))
    ) {
      throw new ClassSectionDomainError('CLASS_SECTION_TIME_RANGE_INVALID');
    }
    const uniqueDates = [...new Set(state.excludedDates)].sort();
    for (const excludedDate of uniqueDates) {
      if (
        !DATE_PATTERN.test(excludedDate) ||
        (calendar !== undefined &&
          (excludedDate < calendar.startDate || excludedDate > calendar.endDate)) ||
        (state.checkInStartDate !== null && excludedDate < state.checkInStartDate) ||
        (state.checkInEndDate !== null && excludedDate > state.checkInEndDate)
      ) {
        throw new ClassSectionDomainError('CLASS_SECTION_EXCLUDED_DATE_INVALID');
      }
    }
    if (
      calendar !== undefined &&
      ((state.checkInStartDate !== null && state.checkInStartDate < calendar.startDate) ||
        (state.checkInEndDate !== null && state.checkInEndDate > calendar.endDate))
    ) {
      throw new ClassSectionDomainError('CLASS_SECTION_DATE_RANGE_INVALID');
    }
    const closedShape =
      state.status === 'CLOSED' || state.status === 'ARCHIVED'
        ? state.closedAt !== null && state.closedBy !== null && state.closeReason !== null
        : state.closedAt === null && state.closedBy === null && state.closeReason === null;
    if (!closedShape) throw new ClassSectionDomainError('CLASS_SECTION_STATUS_INVALID');
  }

  private static text(value: string, maximum: number): string {
    const normalized = value.trim();
    if (normalized.length < 1 || normalized.length > maximum) {
      throw new ClassSectionDomainError('CLASS_SECTION_FIELD_INVALID');
    }
    return normalized;
  }

  private time(value: string | null): string | null {
    if (value === null) return null;
    const normalized = value.length === 5 ? `${value}:00` : value;
    if (!TIME_PATTERN.test(normalized)) {
      throw new ClassSectionDomainError('CLASS_SECTION_TIME_RANGE_INVALID');
    }
    return normalized;
  }
}
