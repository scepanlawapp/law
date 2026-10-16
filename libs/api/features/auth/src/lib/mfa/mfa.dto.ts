import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import {
  MfaEnrollmentConfirmRequest,
  MfaEnrollmentStartRequest,
  MfaMethod,
  MfaPolicy,
  MfaPasswordRequest,
  MfaVerifyRequest,
} from "@law/api-interfaces";

export const MFA_METHODS: MfaMethod[] = ["TOTP", "RECOVERY", "EMAIL"];

export class MfaVerifyDto implements MfaVerifyRequest {
  @IsIn(MFA_METHODS)
  method!: MfaMethod;

  // 6-digit TOTP/email codes or `xxxx-xxxx` recovery codes (spaces allowed).
  @IsString()
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9 -]+$/)
  code!: string;

  @IsBoolean()
  rememberDevice!: boolean;
}

export class MfaEnrollmentStartDto implements MfaEnrollmentStartRequest {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  currentPassword?: string;
}

export class MfaEnrollmentConfirmDto implements MfaEnrollmentConfirmRequest {
  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}

export class MfaPasswordDto implements MfaPasswordRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  currentPassword!: string;
}

export class MfaPolicyDto implements MfaPolicy {
  @IsBoolean()
  mfaRequired!: boolean;
}
