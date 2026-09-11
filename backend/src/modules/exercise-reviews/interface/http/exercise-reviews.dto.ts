import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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
  ValidateNested,
} from 'class-validator';

import { REVIEW_DECISION_RESULTS, REVIEW_REASON_CODES } from '../../domain/exercise-review.js';

export class ExerciseReviewPathDto {
  @IsUUID('7')
  recordId!: string;
}

export class ExerciseReviewListQueryDto {
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
  @IsIn(['reviewVersion', '-reviewVersion'])
  sort: 'reviewVersion' | '-reviewVersion' = '-reviewVersion';
}

export class CreateReviewRequestDto {
  @IsIn(REVIEW_DECISION_RESULTS)
  result!: (typeof REVIEW_DECISION_RESULTS)[number];

  @IsOptional()
  @IsIn(REVIEW_REASON_CODES)
  reasonCode?: (typeof REVIEW_REASON_CODES)[number] | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  publicComment?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalNote?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  creditedDurationOverrideSeconds?: number | null;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedReviewVersion!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class ReopenReviewRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Matches(/\S/u)
  reason!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedReviewVersion!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class BatchReviewItemDto extends CreateReviewRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  itemKey!: string;

  @IsUUID('7')
  recordId!: string;
}

export class BatchReviewRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => BatchReviewItemDto)
  items!: BatchReviewItemDto[];
}
