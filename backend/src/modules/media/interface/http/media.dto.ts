import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class InitiateMediaUploadRequestDto {
  @ValidateIf((input: InitiateMediaUploadRequestDto) => input.businessPurpose === 'EXERCISE_RECORD')
  @IsUUID('7')
  sessionId?: string;

  @ValidateIf(
    (input: InitiateMediaUploadRequestDto) => input.businessPurpose === 'EXEMPTION_APPLICATION',
  )
  @IsUUID('7')
  enrollmentId?: string;

  @IsIn(['EXERCISE_RECORD', 'EXEMPTION_APPLICATION'])
  businessPurpose!: 'EXERCISE_RECORD' | 'EXEMPTION_APPLICATION';

  @IsIn(['IMAGE', 'VIDEO', 'DOCUMENT'])
  mediaType!: 'IMAGE' | 'VIDEO' | 'DOCUMENT';

  @IsIn(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/3gpp', 'video/webm'])
  @MinLength(1)
  @MaxLength(127)
  mimeType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  fileSizeBytes!: number;

  @IsIn(['IN_APP_CAMERA', 'FILE_PICKER'])
  captureSource!: 'IN_APP_CAMERA' | 'FILE_PICKER';

  @IsOptional()
  @Matches(/^[0-9a-f]{64}$/)
  declaredContentSha256?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationSeconds?: number | null;
}

export class MediaUploadPathDto {
  @IsUUID('7')
  uploadSessionId!: string;
}

export class MediaPathDto {
  @IsUUID('7')
  mediaId!: string;
}

export class ConfirmMediaUploadRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  @Matches(/^[A-Za-z0-9._:+\-/=]+$/)
  etag!: string;
}

export class BindMediaRequestDto {
  @IsUUID('7')
  sessionId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class MediaAccessRequestDto {
  @IsIn(['VIEW_ORIGINAL'])
  purpose!: 'VIEW_ORIGINAL';
}
