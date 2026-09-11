import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, ValidateIf, IsString, Min, MinLength } from 'class-validator';

export class ChangeSystemModeInput {
  @IsIn(['NORMAL', 'MAINTENANCE']) mode!: 'NORMAL' | 'MAINTENANCE';
  @IsString() @MinLength(1) reason!: string;
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsString() titleZh?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsString() titleEn?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsString() bodyZh?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsString() bodyEn?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsISO8601({ strict: true }) estimatedRecoveryAt?: string;
}

export class SystemModeHistoryQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) beforeVersion?: number;
}
