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

export class CompleteStudentProfileDto {
  @ValidateIf((_o,v:unknown)=>v!==undefined) @IsString() @Length(1,32) studentNumber?: string;
  @ValidateIf((_o,v:unknown)=>v!==undefined) @IsString() @Length(1,100) fullName?: string;
  @ValidateIf((_o,v:unknown)=>v!==undefined) @IsIn(['MALE','FEMALE','OTHER']) gender?: string;
  @ValidateIf((_o,v:unknown)=>v!==undefined) @IsInt() @Min(1900) @Max(9999) gradeYear?: number;
  @Transform(({value}: {value: unknown}) => typeof value === 'string' ? value.trim() : value) @IsIn(['FBM','FHSS','FST','SCC','SAI','SGE','GS']) collegeName!: string;
  @Transform(({value}: {value: unknown}) => typeof value === 'string' ? value.trim() : value) @IsString() @Length(1,200) majorName!: string;
  @IsString() @Length(10,10) dateOfBirth!: string;
  @IsString() @Length(1,32) regionCode!: string;
  @ValidateIf((_object,value:unknown)=>value!==undefined) @IsString() @Length(1,100) otherRegionName?: string;
  @Type(()=>Number) @IsInt() @Min(1) expectedVersion!: number;
}

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
  @IsOptional() @Transform(trim) @IsString() @Length(1, 200)
  collegeName?: string;

  @IsOptional() @IsIn(['MALE', 'FEMALE', 'OTHER', 'UNKNOWN'])
  gender?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1000) @Max(9999)
  gradeYear?: number;

  @IsOptional() @Transform(trim) @IsString() @Length(1, 254)
  email?: string;
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
  @IsIn(['ACTIVE', 'PENDING'])
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
  @ValidateIf((_o,v:unknown)=>v!==undefined) @Transform(trim) @IsString() @Length(1,200) majorCorrectionReason?: string;
  @ValidateIf((_o,v:unknown)=>v!==undefined) @Transform(trim) @IsString() @Length(1,200) profileUpdateReason?: string;
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
