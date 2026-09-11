import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsObject,
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

const EXPORT_TYPES = ['ROSTER_ALIGNMENT', 'EXERCISE_RECORDS', 'STUDENT_SCORES', 'AUDIT_LOGS'];

export class ExportPathDto {
  @IsUUID()
  exportId!: string;
}

export class ExportListQueryDto {
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
  @IsIn(['requestedAt', '-requestedAt'])
  sort = '-requestedAt';

  @IsOptional()
  @IsIn(EXPORT_TYPES)
  exportType?: string;

  @IsOptional()
  @Matches(/^[A-Z][A-Z0-9_]*$/)
  status?: string;
}

export class CreateExportRequestDto {
  @IsIn(EXPORT_TYPES)
  exportType!: string;

  @IsObject()
  filters!: Record<string, unknown>;

  @Transform(trim)
  @IsString()
  @Length(1, 500)
  purpose!: string;
}

export class ExportDownloadRequestDto {
  @Transform(trim)
  @IsString()
  @Length(1, 500)
  purpose!: string;
}
