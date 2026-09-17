import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional, ValidateIf,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  Max,
} from 'class-validator';

export class ProofTodoQuery {
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 100;
  @IsOptional() @IsString() @MaxLength(2048) cursor?: string;
}
export class V81ExerciseGoalInput {
  @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) totalTargetMinutes!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(2147483646) expectedVersion!: number;
}

export class SwimIntakeItemInput {
  @IsUUID() mediaId!: string;
  @IsIn(['BEFORE', 'AFTER', 'OTHER']) phase!: 'BEFORE' | 'AFTER' | 'OTHER';
}
export class SwimIntakeInput {
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(7)
  @ValidateNested({ each: true }) @Type(() => SwimIntakeItemInput)
  items!: SwimIntakeItemInput[];
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsString() @MaxLength(1000) delayReason?: string;
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
}

export class V81RulesInput {
  @ValidateIf((_object, value: unknown) => value !== undefined) @Type(() => Number) @IsInt() @Min(1) @Max(1440) maximumMinutes?: number;
  @ValidateIf((_object, value: unknown) => value !== undefined) @Type(() => Number) @IsInt() @Min(0) globalTargetVersion?: number;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsUUID() templateId?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(1440) minimumMinutes!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) weeklyLimit!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) dailyLimit = 1;
  @Type(() => Number) @IsInt() @Min(0) courseTarget!: number;
  @Type(() => Number) @IsInt() @Min(0) generalTarget!: number;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsISO8601({ strict: true }) regularDeadline?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsISO8601({ strict: true }) closingDeadline?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsISO8601({ strict: true }) settlementPlannedAt?: string;
  @IsBoolean() publish!: boolean;
  @Type(() => Number) @IsInt() @Min(0) expectedVersion!: number;
}
export class ManualModeInput {
  @IsUUID() classSectionId!: string;
  @IsBoolean() enabled!: boolean;
  @IsString() @MinLength(1) reason!: string;
  @Type(() => Number) @IsInt() @Min(0) expectedVersion!: number;
}
export class V81ReviewInput {
  @IsIn(['VALID', 'INVALID', 'RETURN_FOR_SUPPLEMENT']) action!:
    'VALID' | 'INVALID' | 'RETURN_FOR_SUPPLEMENT';
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsString() @IsIn(['AUTHENTICITY_REQUIRES_CLARIFICATION', 'CONFIRMED_REUSE_OR_MISUSE', 'INCONSISTENT_EVIDENCE', 'MISSING_REQUIRED_EVIDENCE', 'SESSION_MISMATCH', 'UNCLEAR_EVIDENCE']) reasonCode?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsString() @MaxLength(1000) publicComment?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsInt() @IsIn([24, 72]) supplementHours?: 24 | 72;
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
}
export class V81SupplementInput {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  mediaIds!: string[];
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
}
export class V81CorrectionInput {
  @IsIn(['VALID', 'INVALID']) action!: 'VALID' | 'INVALID';
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsString() @IsIn(['AUTHENTICITY_REQUIRES_CLARIFICATION', 'CONFIRMED_REUSE_OR_MISUSE', 'INCONSISTENT_EVIDENCE', 'MISSING_REQUIRED_EVIDENCE', 'SESSION_MISMATCH', 'UNCLEAR_EVIDENCE']) reasonCode?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsString() @MaxLength(1000) publicComment?: string;
  @IsString() @MinLength(1) @MaxLength(1000) correctionReason!: string;
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
}
