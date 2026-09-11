import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import {
  CHECK_IN_WINDOW_MODES,
  CLASS_SECTION_STATUSES,
  type CheckInWindowMode,
  type ClassSectionStatus,
} from '../../domain/class-section-status.js';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const normalizeLocalTime = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim();
  const match =
    /^((?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d)(?:[zZ]|[+-](?:[01]\d|2[0-3]):?[0-5]\d)$/u.exec(
      normalized,
    );
  return match?.[1] ?? normalized;
};
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

export class ClassSectionPathParameters {
  @IsUUID()
  classSectionId!: string;
}

export class TeacherClassSectionPathParameters {
  @IsUUID()
  teacherId!: string;
}

export class ClassSectionListQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 2048)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  sort?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  q?: string;

  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsOptional()
  @IsUUID()
  semesterId?: string;

  @IsOptional()
  @IsIn(CLASS_SECTION_STATUSES)
  status?: ClassSectionStatus;
}

export class TeacherClassSectionListQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 2048)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  sort?: string;

  @IsOptional()
  @IsUUID()
  semesterId?: string;
}

export class CreateClassSectionRequestDto {
  @IsUUID()
  courseId!: string;

  @IsUUID()
  semesterId!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 64)
  classCode!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 200)
  displayName!: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  isEnrollmentOpen = false;
}

export class UpdateClassSectionRequestDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  displayName?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  isEnrollmentOpen?: boolean;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(CHECK_IN_WINDOW_MODES)
  checkInWindowMode?: CheckInWindowMode;

  @IsOptional()
  @Matches(DATE_PATTERN)
  checkInStartDate?: string | null;

  @IsOptional()
  @Matches(DATE_PATTERN)
  checkInEndDate?: string | null;

  @IsOptional()
  @Transform(normalizeLocalTime)
  @Matches(TIME_PATTERN)
  dailyStartTime?: string | null;

  @IsOptional()
  @Transform(normalizeLocalTime)
  @Matches(TIME_PATTERN)
  dailyEndTime?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true })
  submissionDeadlineAt?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsArray()
  @Matches(DATE_PATTERN, { each: true })
  excludedDates?: string[];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class CloseClassSectionRequestDto {
  @Transform(trim)
  @IsString()
  @Length(1, 1000)
  reason!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
