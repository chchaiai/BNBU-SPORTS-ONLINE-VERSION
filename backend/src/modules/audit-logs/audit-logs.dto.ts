import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
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
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const AUDIT_ACTION_TYPES = [
  'AUTHENTICATION_SUCCEEDED',
  'AUTHENTICATION_FAILED',
  'AUTH_SESSION_REVOKED',
  'USER_PROFILE_UPDATED',
  'USER_STATUS_CHANGED',
  'COURSE_CREATED',
  'COURSE_UPDATED',
  'COURSE_STATUS_CHANGED',
  'CLASS_SECTION_CREATED',
  'CLASS_SECTION_UPDATED',
  'CLASS_SECTION_CLOSED',
  'COURSE_INVITE_CHANGED',
  'ENROLLMENT_CREATED',
  'ENROLLMENT_STATUS_CHANGED',
  'ROSTER_IMPORTED',
  'ROSTER_ALIGNED',
  'ROSTER_RESOLUTION_CHANGED',
  'ROSTER_VERSION_ROLLED_BACK',
  'EXERCISE_SESSION_STARTED',
  'EXERCISE_SESSION_PAUSED',
  'EXERCISE_SESSION_RESUMED',
  'EXERCISE_SESSION_COMPLETED',
  'EXERCISE_SESSION_CANCELLED',
  'EXERCISE_SESSION_RECONCILED',
  'EXERCISE_SESSION_ENDED',
  'EXERCISE_RECORD_DRAFT_CREATED',
  'EXERCISE_RECORD_DRAFT_UPDATED',
  'EXERCISE_RECORD_SUBMITTED',
  'EXERCISE_RECORD_DISCARDED',
  'EXERCISE_RECORD_WITHDRAWN',
  'MEDIA_BOUND',
  'MEDIA_DELETED',
  'MEDIA_ACCESSED',
  'REVIEW_RESULT_CHANGED',
  'SCORE_RULE_CHANGED',
  'SCORE_RECALCULATED',
  'SCORE_ADJUSTED',
  'SCORE_PUBLISHED',
  'SCORE_LOCKED',
  'PERMISSION_CHANGED',
  'SYSTEM_MODE_CHANGED',
  'DATA_EXPORTED',
  'AUDIT_LOG_READ',
] as const;

export class AuditLogPathDto {
  @IsUUID()
  auditLogId!: string;
}

export class AuditLogListQueryDto {
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
  @IsIn(['occurredAt', '-occurredAt'])
  sort = '-occurredAt';

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  q?: string;

  @IsOptional()
  @IsUUID()
  actorUserId?: string;

  @IsOptional()
  @IsIn(AUDIT_ACTION_TYPES)
  action?: (typeof AUDIT_ACTION_TYPES)[number];

  @IsOptional()
  @Matches(/^[A-Z][A-Z0-9_]*$/)
  targetType?: string;

  @IsOptional()
  @IsUUID()
  targetId?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  occurredAtFrom?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  occurredAtTo?: string;
}
