import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { ENROLLMENT_STATUSES } from '../../domain/enrollment-status.js';

export class EnrollmentPathDto {
  @IsUUID('7')
  enrollmentId!: string;
}

export class EnrollmentClassSectionPathDto {
  @IsUUID('7')
  classSectionId!: string;
}

export class EnrollmentListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsString()
  @IsIn(['joinedAt', '-joinedAt'])
  sort?: string;

  @IsOptional()
  @IsUUID('7')
  classSectionId?: string;

  @IsOptional()
  @IsUUID('7')
  studentId?: string;

  @IsOptional()
  @IsUUID('7')
  semesterId?: string;

  @IsOptional()
  @IsIn(ENROLLMENT_STATUSES)
  status?: (typeof ENROLLMENT_STATUSES)[number];
}

export class ManualEnrollmentRequestDto {
  @IsUUID('7')
  studentId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason!: string;
}

export class EnrollmentTransitionRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
