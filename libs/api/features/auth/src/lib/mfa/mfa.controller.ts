import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Request, Response } from "express";
import { AuthSessionResponse } from "@law/api-interfaces";
import { AuthRuntimeConfig } from "../auth.config";
import {
  MFA_CHALLENGE_COOKIE,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  mfaChallengeCookieOptions,
  readCookie,
  sessionCookieOptions,
} from "../cookies";
import { CsrfOriginGuard } from "../csrf.guard";
import { AuthRateLimitGuard } from "../rate-limit.guard";
import { MfaVerifyDto } from "./mfa.dto";
import { MfaVerificationService } from "./mfa-verification.service";

@Controller("auth/mfa")
@UseGuards(CsrfOriginGuard)
export class MfaController {
  constructor(
    private readonly verification: MfaVerificationService,
    private readonly config: AuthRuntimeConfig,
  ) {}

  @Post("verify")
  @HttpCode(200)
  @UseGuards(AuthRateLimitGuard)
  async verify(
    @Body() body: MfaVerifyDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSessionResponse> {
    const result = await this.verification.verify(
      readCookie(request, MFA_CHALLENGE_COOKIE),
      body,
    );
    response.clearCookie(
      MFA_CHALLENGE_COOKIE,
      mfaChallengeCookieOptions(this.config.production),
    );
    response.cookie(SESSION_COOKIE, result.token, {
      ...sessionCookieOptions(this.config.production),
      maxAge: SESSION_TTL_MS,
    });
    return result.session;
  }
}
