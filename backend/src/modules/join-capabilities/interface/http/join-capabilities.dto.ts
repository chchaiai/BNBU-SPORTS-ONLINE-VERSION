import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsString, Length, Max, Min, ValidateIf } from 'class-validator';

const COURSE_JOIN_GENDERS = ['MALE', 'FEMALE'] as const;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class IssueJoinCapabilityRequestDto {
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsString() @Length(1, 100) otherRegionName?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsString() @Length(1, 200) collegeName?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsString() @Length(1, 200) majorName?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsString() @Length(10, 10) dateOfBirth?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsString() @Length(1, 32) regionCode?: string;
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  fullName!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 32)
  studentNumber!: string;

  @IsIn(COURSE_JOIN_GENDERS)
  gender!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(9999)
  gradeYear!: number;
}
