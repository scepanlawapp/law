import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { Request, Response } from "express";
import {
  AuthSessionResponse,
  MfaEnrollmentConfirmResponse,
  MfaEnrollmentStartResponse,
  MfaRecoveryCodesResponse,
  MfaStatusResponse,
} from "@law/api-interfaces";
import { AuthRuntimeConfig } from "../auth.config";
import { AuthenticatedRequest, AuthGuard, sessionToken } from "../auth.guard";
import { AuthService } from "../auth.service";
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
import {
  MfaEnrollmentConfirmDto,
  MfaEnrollmentStartDto,
  MfaPasswordDto,
  MfaVerifyDto,
} from "./mfa.dto";
import { MfaActor, MfaEnrollmentService } from "./mfa-enrollment.service";
import { MfaVerificationService } from "./mfa-verification.service";

@Controller("auth/mfa")
@UseGuards(CsrfOriginGuard)
export class MfaController {
  constructor(
    private readonly verification: MfaVerificationService,
    private readonly config: AuthRuntimeConfig,
    private readonly enrollment: MfaEnrollmentService,
    private readonly authService: AuthService,
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
    this.issueSession(response, result.token);
    return result.session;
  }

  @Get()
  @UseGuards(AuthGuard)
  status(@Req() request: AuthenticatedRequest): Promise<MfaStatusResponse> {
    return this.enrollment.status(authenticatedUserId(request));
  }

  @Post("enrollment/start")
  @HttpCode(200)
  @UseGuards(AuthRateLimitGuard)
  async start(
    @Body() body: MfaEnrollmentStartDto,
    @Req() request: Request,
  ): Promise<MfaEnrollmentStartResponse> {
    return this.enrollment.start(
      await this.actor(request),
      body.currentPassword,
    );
  }

  @Post("enrollment/confirm")
  @HttpCode(200)
  @UseGuards(AuthRateLimitGuard)
  async confirm(
    @Body() body: MfaEnrollmentConfirmDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MfaEnrollmentConfirmResponse> {
    const { sessionToken: issuedToken, ...result } =
      await this.enrollment.confirm(await this.actor(request), body.code);
    if (issuedToken) this.issueSession(response, issuedToken);
    return result;
  }

  @Post("disable")
  @HttpCode(200)
  @UseGuards(AuthGuard, AuthRateLimitGuard)
  async disable(
    @Body() body: MfaPasswordDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ success: true }> {
    await this.enrollment.disable(
      authenticatedUserId(request),
      body.currentPassword,
    );
    return { success: true };
  }

  @Post("recovery-codes")
  @HttpCode(200)
  @UseGuards(AuthGuard, AuthRateLimitGuard)
  regenerateRecoveryCodes(
    @Body() body: MfaPasswordDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<MfaRecoveryCodesResponse> {
    return this.enrollment.regenerateRecoveryCodes(
      authenticatedUserId(request),
      body.currentPassword,
    );
  }

  /**
   * A signed-in session wins over the challenge cookie; a stale session
   * cookie falls back to the challenge so a login step still works.
   */
  private async actor(request: Request): Promise<MfaActor> {
    const challenge = readCookie(request, MFA_CHALLENGE_COOKIE);
    const token = sessionToken(request);
    if (token) {
      try {
        const { user } = await this.authService.currentUser(token);
        return { kind: "session", userId: user.id };
      } catch (error) {
        if (!(error instanceof UnauthorizedException) || !challenge) {
          throw error;
        }
      }
    }
    if (!challenge) throw new UnauthorizedException("Authentication required");
    return { kind: "challenge", token: challenge };
  }

  /** Ends the challenge step and starts the session. */
  private issueSession(response: Response, token: string): void {
    response.clearCookie(
      MFA_CHALLENGE_COOKIE,
      mfaChallengeCookieOptions(this.config.production),
    );
    response.cookie(SESSION_COOKIE, token, {
      ...sessionCookieOptions(this.config.production),
      maxAge: SESSION_TTL_MS,
    });
  }
}

function authenticatedUserId(request: AuthenticatedRequest): string {
  if (!request.auth) throw new UnauthorizedException("Authentication required");
  return request.auth.user.id;
}
