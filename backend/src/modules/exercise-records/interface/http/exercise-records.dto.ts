import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { CREDIT_TYPES, EXERCISE_RECORD_STATUSES } from '../../domain/exercise-record.js';

const REVIEW_RESULTS = ['PENDING', 'VALID', 'INVALID'] as const;

export class ExerciseRecordPathDto {
  @IsUUID('7')
  recordId!: string;
}

export class ExerciseRecordListQueryDto {
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
  @IsIn(['businessDate', '-businessDate'])
  sort?: 'businessDate' | '-businessDate';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsUUID('7')
  classSectionId?: string;

  @IsOptional()
  @IsUUID('7')
  enrollmentId?: string;

  @IsOptional()
  @IsIn(EXERCISE_RECORD_STATUSES)
  status?: (typeof EXERCISE_RECORD_STATUSES)[number];

  @IsOptional()
  @IsIn(REVIEW_RESULTS)
  reviewResult?: (typeof REVIEW_RESULTS)[number];

  @IsOptional()
  @IsDateString({ strict: true })
  businessDateFrom?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  businessDateTo?: string;
}

class RecordContentDto {
  @IsIn(CREDIT_TYPES)
  creditType!: (typeof CREDIT_TYPES)[number];

  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]*$/)
  @MaxLength(64)
  sportType!: string;

  @ValidateIf((value: RecordContentDto) => value.sportType === 'OTHER')
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/\S/u)
  sportName?: string | null;

  @ValidateIf(
    (object: RecordContentDto, value: unknown) =>
      object.creditType === 'GENERAL' || (value !== undefined && value !== null),
  )
  @IsString()
  @MaxLength(200)
  description?: string | null;
}

export class CreateExerciseRecordRequestDto extends RecordContentDto {
  @IsUUID('7')
  sessionId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9._:-]+$/)
  clientRequestId!: string;
}

export class UpdateExerciseRecordRequestDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(CREDIT_TYPES)
  creditType?: (typeof CREDIT_TYPES)[number];

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]*$/)
  @MaxLength(64)
  sportType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/\S/u)
  sportName?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(200)
  description?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class SubmitExerciseRecordRequestDto {
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsString() @MinLength(1) @MaxLength(1000)
  swimDelayReason?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsUUID('7', { each: true })
  mediaIds!: string[];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class VersionedRecordReasonRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  @Matches(/\S/u)
  reason!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
