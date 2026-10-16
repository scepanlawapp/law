import { IsBoolean, IsIn, IsString, Matches, MaxLength } from "class-validator";
import { MfaMethod, MfaVerifyRequest } from "@law/api-interfaces";

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
