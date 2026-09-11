import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class ClassSectionScorePathDto {
  @IsUUID()
  classSectionId!: string;
}

export class ScoreRulePathDto {
  @IsUUID()
  scoreRuleId!: string;
}

export class StudentScorePathDto {
  @IsUUID()
  studentScoreId!: string;
}

export class ScoreAdjustmentPathDto {
  @IsUUID()
  scoreAdjustmentId!: string;
}

export class ScoreListQueryDto {
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
  @IsUUID()
  classSectionId?: string;

  @IsOptional()
  @IsUUID()
  enrollmentId?: string;

  @IsOptional()
  @IsIn(['NOT_CALCULATED', 'CALCULATED', 'ADJUSTED', 'PUBLISHED', 'LOCKED'])
  status?: string;
}

export class ScoreAdjustmentListQueryDto {
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
}

export class ScoreRuleListQueryDto {
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
  @IsIn(['DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'SUPERSEDED'])
  status?: string;
}

export class CreateScoreRuleRequestDto {
  @Transform(trim)
  @IsString()
  @Length(1, 64)
  @Matches(/^[A-Z0-9][A-Z0-9_-]*$/)
  ruleCode!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 200)
  displayName!: string;
}

export class ExpectedVersionRequestDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class ScoreApprovalRequestDto extends ExpectedVersionRequestDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  @Matches(/\S/u)
  reason?: string;
}

export class VersionedReasonRequestDto extends ExpectedVersionRequestDto {
  @Transform(trim)
  @IsString()
  @Length(1, 500)
  @Matches(/\S/u)
  reason!: string;
}

export class CreateScoreAdjustmentRequestDto extends ExpectedVersionRequestDto {
  @IsIn(['FINAL_SCORE_DELTA', 'FINAL_SCORE_REPLACEMENT', 'CALCULATION_CORRECTION'])
  adjustmentType!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-100)
  @Max(100)
  adjustmentValue!: number;

  @IsIn(['VERIFIED_DATA_ERROR', 'APPROVED_POLICY_EXCEPTION', 'CALCULATION_ERROR'])
  reasonCode!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 1000)
  @Matches(/\S/u)
  reason!: string;

  @Transform(trim)
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/)
  evidenceReference!: string;
}
