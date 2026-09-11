import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Matches,
  Min,
  MinLength,
} from 'class-validator';

const IMPORT_STATUSES = ['RECEIVED', 'VALIDATING', 'VALIDATED', 'FAILED'] as const;
const ROW_STATUSES = ['VALID', 'INVALID', 'DUPLICATED'] as const;
const ALIGNMENT_STATUSES = [
  'MATCHED',
  'MISSING_IN_PLATFORM',
  'EXTRA_IN_PLATFORM',
  'WRONG_COURSE',
  'IDENTITY_CONFLICT',
  'DUPLICATED',
] as const;
const RESOLUTION_STATUSES = ['PENDING', 'CONFIRMED', 'RESOLVED', 'IGNORED'] as const;
const EVIDENCE_TYPES = [
  'NEW_ALIGNMENT_RESULT',
  'ENROLLMENT_STATUS_EVENT',
  'OFFICIAL_ROSTER_VERSION',
] as const;

export class RosterClassSectionPathDto {
  @IsUUID('7')
  classSectionId!: string;
}

export class RosterImportPathDto {
  @IsUUID('7')
  rosterImportId!: string;
}

export class RosterAlignmentResultPathDto {
  @IsUUID('7')
  alignmentResultId!: string;
}

class CursorPageDto {
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

export class RosterImportListQueryDto extends CursorPageDto {
  @IsOptional()
  @IsIn(['versionNumber', '-versionNumber'])
  sort?: string;

  @IsOptional()
  @IsIn(IMPORT_STATUSES)
  status?: (typeof IMPORT_STATUSES)[number];
}

export class RosterEntryListQueryDto extends CursorPageDto {
  @IsOptional()
  @IsIn(['sourceRowNumber', '-sourceRowNumber'])
  sort?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(ROW_STATUSES)
  rowValidationStatus?: (typeof ROW_STATUSES)[number];
}

export class RosterAlignmentListQueryDto extends CursorPageDto {
  @IsOptional()
  @IsIn(['createdAt', '-createdAt'])
  sort?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsUUID('7')
  classSectionId?: string;

  @IsOptional()
  @IsUUID('7')
  rosterImportId?: string;

  @IsOptional()
  @IsUUID('7')
  alignmentRunId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean()
  currentOnly = true;

  @IsOptional()
  @IsIn(ALIGNMENT_STATUSES)
  status?: (typeof ALIGNMENT_STATUSES)[number];

  @IsOptional()
  @IsIn(RESOLUTION_STATUSES)
  resolutionStatus?: (typeof RESOLUTION_STATUSES)[number];
}

export class RollbackRosterImportRequestDto {
  @IsUUID('7')
  expectedCurrentRosterImportId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  @Matches(/\S/u)
  reason!: string;
}

export class RunAlignmentRequestDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedRosterImportVersion!: number;
}

export class VersionedRosterReasonRequestDto {
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

export class ResolveRosterAlignmentRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  @Matches(/\S/u)
  resolutionNote!: string;

  @IsIn(EVIDENCE_TYPES)
  evidenceType!: (typeof EVIDENCE_TYPES)[number];

  @IsUUID('7')
  evidenceReferenceId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
