import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ExerciseSessionPathDto {
  @IsUUID('7')
  sessionId!: string;
}

export class ActiveExerciseSessionQueryDto {
  @IsOptional()
  @IsUUID('7')
  enrollmentId?: string;
}

export class StartExerciseSessionRequestDto {
  @IsUUID('7')
  enrollmentId!: string;

  @IsISO8601({ strict: true })
  clientObservedAt!: string;
}

export class ExerciseSessionControlRequestDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsISO8601({ strict: true })
  clientObservedAt!: string;
}

export class CancelExerciseSessionRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  @Matches(/\S/)
  reason!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class ReconcileClientEventDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  eventId!: string;

  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]*$/)
  eventType!: string;

  @IsISO8601({ strict: true })
  observedAt!: string;
}

export class ReconcileExerciseSessionRequestDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReconcileClientEventDto)
  clientEvents!: ReconcileClientEventDto[];
}
