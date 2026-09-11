import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
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

import { COURSE_STATUSES, type CourseStatus } from '../../domain/course-status.js';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
const normalizeCourseCode = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CoursePathParameters {
  @IsUUID()
  courseId!: string;
}

export class CourseListQueryDto {
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
  @IsIn(COURSE_STATUSES)
  status?: CourseStatus;
}

export class CreateCourseRequestDto {
  @Transform(normalizeCourseCode)
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9._-]{0,31}$/)
  courseCode!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 200)
  courseName!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}

export class UpdateCourseRequestDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  courseName?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(COURSE_STATUSES)
  status?: CourseStatus;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
