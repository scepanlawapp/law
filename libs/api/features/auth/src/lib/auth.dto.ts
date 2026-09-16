import {
  IsEmail,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

export class LoginDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password!: string;
}

export class InvitationAcceptDto {
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  token!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(256)
  password!: string;
}

export class InvitationCreateDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsUUID()
  workspaceId!: string;
}

export class PasswordForgotDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

export class PasswordResetDto {
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  token!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(256)
  password!: string;
}

export class PasswordChangeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  currentPassword!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(256)
  newPassword!: string;
}
