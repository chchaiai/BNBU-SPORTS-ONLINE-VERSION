import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
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

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class ProfilePathDto {
  @IsUUID()
  studentId!: string;
}

export class TeacherPathDto {
  @IsUUID()
  teacherId!: string;
}

export class StudentListQueryDto {
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
  @IsIn(['fullName', '-fullName', 'studentNumber', '-studentNumber', 'createdAt', '-createdAt'])
  sort = 'fullName';

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  q?: string;

  @IsOptional()
  @IsUUID()
  classSectionId?: string;

  @IsOptional()
  @Matches(/^[A-Z][A-Z0-9_]*$/)
  status?: string;
}

export class EmailVerificationChallengeRequestDto {
  @Transform(trim)
  @IsEmail()
  @Length(3, 254)
  email!: string;

  @IsIn(['zh-CN', 'en'])
  locale!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class EmailVerificationChallengePathDto {
  @IsUUID()
  challengeId!: string;
}

export class VerifyEmailChallengeRequestDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trim)
  @Matches(/^\d{4,10}$/)
  currentEmailCode?: string;

  @Transform(trim)
  @Matches(/^\d{4,10}$/)
  newEmailCode!: string;
}

export class UpdateStudentRequestDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  fullName?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['MALE', 'FEMALE', 'OTHER'])
  gender?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(9999)
  gradeYear?: number;

  @IsOptional()
  @ValidateIf((_object, value: unknown) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  collegeName?: string | null;

  @IsOptional()
  @ValidateIf((_object, value: unknown) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  majorName?: string | null;

  @IsOptional()
  @ValidateIf((_object, value: unknown) => value !== null)
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  administrativeClassName?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
