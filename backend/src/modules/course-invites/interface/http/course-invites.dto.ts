import { Transform } from 'class-transformer';
import { IsISO8601, IsOptional, IsString, IsUUID, Length } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CourseInviteClassSectionPathDto {
  @IsUUID()
  classSectionId!: string;
}

export class CourseInviteTokenPathDto {
  @Transform(trim)
  @IsString()
  @Length(16, 512)
  inviteToken!: string;
}

export class CreateCourseInviteRequestDto {
  @IsOptional()
  @IsISO8601({ strict: true })
  expiresAt?: string | null;
}
