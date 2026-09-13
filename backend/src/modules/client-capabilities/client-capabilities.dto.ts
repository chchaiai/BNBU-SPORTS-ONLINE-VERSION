import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsRFC3339,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class StudentSignInCodeRequestDto {
  @Transform(trim)
  @Matches(/^[A-Z0-9][A-Z0-9_-]{1,31}$/)
  organizationCode!: string;

  @Transform(trim)
  @IsEmail()
  @Length(3, 254)
  account!: string;

  @IsIn(['EMAIL'])
  channel!: string;

  @IsIn(['zh-CN', 'en'])
  locale!: string;
}

export class StudentSignInCodeVerificationRequestDto {
  @IsUUID()
  challengeId!: string;

  @Transform(trim)
  @Matches(/^\d{4,10}$/)
  code!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 128)
  deviceId!: string;
}

export class AccountRecoveryRequestDto {
  @Transform(trim)
  @Matches(/^[A-Z0-9][A-Z0-9_-]{1,31}$/)
  organizationCode!: string;

  @Transform(trim)
  @IsEmail()
  @Length(3, 254)
  account!: string;

  @IsIn(['TEACHER', 'ADMIN'])
  requestedRole!: string;

  @IsIn(['EMAIL'])
  channel!: string;

  @IsIn(['zh-CN', 'en'])
  locale!: string;
}

export class AccountRecoveryCompletionRequestDto {
  @IsUUID()
  recoveryId!: string;

  @Transform(trim)
  @Matches(/^\d{4,10}$/)
  verificationCode!: string;

  @IsString()
  @MinLength(1)
  newPassword!: string;
}

export class NotificationPathDto {
  @IsUUID()
  notificationId!: string;
}

export class CursorListQueryDto {
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

export class NotificationListQueryDto extends CursorListQueryDto {
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  unreadOnly?: boolean;
}

export class PushDeviceRegistrationRequestDto {
  @IsIn(['ANDROID', 'WEB', 'IOS'])
  platform!: string;

  @Transform(trim)
  @IsString()
  @Length(16, 4096)
  registrationToken!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 64)
  appVersion!: string;

  @IsIn(['zh-CN', 'en'])
  locale!: string;
}

export class PushDevicePathDto {
  @IsUUID()
  deviceId!: string;
}

export class UpdateUserPreferencesRequestDto {
  @IsIn(['zh-CN', 'en'])
  locale!: string;

  @IsBoolean()
  pushEnabled!: boolean;

  @IsBoolean()
  emailEnabled!: boolean;

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class HelpArticlePathDto {
  @IsUUID()
  articleId!: string;
}

export class HelpArticleListQueryDto {
  @IsOptional()
  @IsIn(['zh-CN', 'en'])
  locale = 'zh-CN';

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  category?: string;
}

export class FeedbackPathDto {
  @IsUUID()
  feedbackId!: string;
}

export class FeedbackListQueryDto extends CursorListQueryDto {
  @IsOptional()
  @Matches(/^[A-Z][A-Z0-9_]*$/)
  status?: string;
}

export class FeedbackClientContextDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['ANDROID', 'WEB', 'IOS'])
  platform?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  appVersion?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  osVersion?: string;
}

export class CreateFeedbackRequestDto {
  @IsIn(['BUG', 'SUGGESTION', 'ACCESSIBILITY', 'PRIVACY', 'OTHER'])
  category!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 2000)
  content!: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @ValidateNested()
  @Type(() => FeedbackClientContextDto)
  clientContext?: FeedbackClientContextDto;
}

export class ExemptionApplicationPathDto {
  @IsUUID()
  applicationId!: string;
}

export class ExemptionApplicationListQueryDto extends CursorListQueryDto {
  @IsOptional()
  @Matches(/^[A-Z][A-Z0-9_]*$/)
  status?: string;

  @IsOptional()
  @IsUUID()
  classSectionId?: string;
}

export class CreateExemptionApplicationRequestDto {
  @IsUUID()
  enrollmentId!: string;

  @IsIn(['PHYSICAL_TEST', 'EXERCISE_CHECK_IN', 'SPECIAL_CIRCUMSTANCE'])
  applicationType!: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['RUN_800M', 'RUN_1000M', 'SCHOOL_TEAM', 'STUDENT_CLUB', 'SPECIAL_CIRCUMSTANCE'])
  applicationSubtype?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @Transform(trim)
  @IsString()
  @Length(1, 128)
  organizationName?: string | null;

  @Transform(trim)
  @IsString()
  @Length(1, 1000)
  reason!: string;

  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  mediaIds!: string[];
}

export class UpdateExemptionApplicationRequestDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['RUN_800M', 'RUN_1000M', 'SCHOOL_TEAM', 'STUDENT_CLUB', 'SPECIAL_CIRCUMSTANCE'])
  applicationSubtype?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined && value !== null)
  @Transform(trim)
  @IsString()
  @Length(1, 128)
  organizationName?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trim)
  @IsString()
  @Length(1, 1000)
  reason?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  mediaIds?: string[];

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class VersionedRequestDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class ReviewExemptionApplicationRequestDto {
  @ValidateIf((_object, value: unknown) => value !== undefined) @Type(() => Number) @IsInt() @Min(0) @Max(2147483647) courseMinutes?: number;
  @ValidateIf((_object, value: unknown) => value !== undefined) @Type(() => Number) @IsInt() @Min(0) @Max(2147483647) generalMinutes?: number;
  @IsIn(['APPROVE', 'REJECT', 'REQUEST_SUPPLEMENT'])
  decision!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 1000)
  publicComment!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  internalNote?: string;

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class ClientPlatformQueryDto {
  @IsIn(['ANDROID', 'WEB', 'IOS'])
  platform!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  currentVersion?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  currentBuildNumber?: number;
}

export class SessionLocationPathDto {
  @IsUUID()
  sessionId!: string;
}

export class RecordLocationPathDto {
  @IsUUID()
  recordId!: string;
}

export class StartLocationTrackRequestDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  consentPolicyVersion!: string;

  @IsRFC3339()
  clientObservedAt!: string;
}

export class LocationSampleDto {
  @IsUUID()
  sampleId!: string;

  @IsRFC3339()
  observedAt!: string;

  @IsLatitude()
  latitude!: number;

  @IsLongitude()
  longitude!: number;

  @IsInt()
  @Min(0)
  @Max(10000)
  accuracyMeters!: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(-500)
  @Max(10000)
  altitudeMeters?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(100000)
  speedMillimetersPerSecond?: number;
}

export class AppendLocationSamplesRequestDto {
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => LocationSampleDto)
  samples!: LocationSampleDto[];

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class FinalizeLocationTrackRequestDto {
  @IsRFC3339()
  clientObservedAt!: string;

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class UpdateLocationPrivacyPolicyRequestDto {
  @Transform(trim)
  @IsString()
  @Length(1, 64)
  policyVersion!: string;

  @IsBoolean()
  collectionEnabled!: boolean;

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
