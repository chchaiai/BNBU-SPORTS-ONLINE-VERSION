import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class PasswordLoginRequest {
  @IsString()
  @IsNotEmpty()
  account!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class ChangeOwnPasswordInput {
  @IsString() @IsNotEmpty() currentPassword!: string;
  @IsString() @IsNotEmpty() newPassword!: string;
  @IsString() @IsNotEmpty() confirmPassword!: string;
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
}

export class RefreshRequest {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class LogoutRequest {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
