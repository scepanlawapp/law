import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Request, Response } from "express";
import { LoginResponse } from "@law/api-interfaces";
import { AuthService } from "./auth.service";
import { AuthenticatedRequest, AuthGuard, sessionToken } from "./auth.guard";
import { CsrfOriginGuard } from "./csrf.guard";
import { AuthRateLimitGuard } from "./rate-limit.guard";
import { AuthRuntimeConfig } from "./auth.config";
import {
  InvitationAcceptDto,
  InvitationCreateDto,
  LoginDto,
  PasswordForgotDto,
  PasswordChangeDto,
  PasswordResetDto,
} from "./auth.dto";
import {
  MFA_CHALLENGE_COOKIE,
  MFA_CHALLENGE_TTL_MS,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  TRUSTED_DEVICE_COOKIE,
  mfaChallengeCookieOptions,
  readCookie,
  sessionCookieOptions,
} from "./cookies";

@Controller("auth")
@UseGuards(CsrfOriginGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: AuthRuntimeConfig,
  ) {}

  private cookieOptions() {
    return sessionCookieOptions(this.config.production);
  }

  @Post("login")
  @UseGuards(AuthRateLimitGuard)
  async login(
    @Body() body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const step = await this.authService.login(
      body.email,
      body.password,
      readCookie(request, TRUSTED_DEVICE_COOKIE),
    );
    return this.applyPasswordStep(step, response);
  }

  /** Sets the session or the second-factor challenge cookie. */
  private applyPasswordStep(
    step: {
      result: LoginResponse;
      sessionToken?: string;
      challengeToken?: string;
    },
    response: Response,
  ): LoginResponse {
    if (step.sessionToken) {
      response.cookie(SESSION_COOKIE, step.sessionToken, {
        ...this.cookieOptions(),
        maxAge: SESSION_TTL_MS,
      });
    }
    if (step.challengeToken) {
      response.cookie(MFA_CHALLENGE_COOKIE, step.challengeToken, {
        ...mfaChallengeCookieOptions(this.config.production),
        maxAge: MFA_CHALLENGE_TTL_MS,
      });
    }
    return step.result;
  }

  @Post("invitations/accept")
  async acceptInvitation(
    @Body() body: InvitationAcceptDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const step = await this.authService.acceptInvitation(
      body.token,
      body.password,
    );
    return this.applyPasswordStep(step, response);
  }

  @Post("invitations")
  @UseGuards(AuthGuard)
  async createInvitation(
    @Body() body: InvitationCreateDto,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.authService.createInvitation(
      sessionToken(request),
      body.email,
      body.workspaceId,
    );
    return { success: true };
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@Req() request: AuthenticatedRequest) {
    return this.authService.currentUser(sessionToken(request));
  }

  @Post("refresh")
  @UseGuards(AuthGuard)
  async refresh(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.refresh(sessionToken(request));
    response.cookie(SESSION_COOKIE, result.token, {
      ...this.cookieOptions(),
      maxAge: SESSION_TTL_MS,
    });
    return result.session;
  }

  @Post("logout")
  @UseGuards(AuthGuard)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(sessionToken(request));
    response.clearCookie(SESSION_COOKIE, this.cookieOptions());
    return { success: true };
  }

  @Post("password/forgot")
  @UseGuards(AuthRateLimitGuard)
  async forgotPassword(@Body() body: PasswordForgotDto) {
    await this.authService.requestPasswordReset(body.email);
    return { success: true };
  }

  @Post("password/reset")
  async resetPassword(@Body() body: PasswordResetDto) {
    await this.authService.resetPassword(body.token, body.password);
    return { success: true };
  }

  @Post("password/change")
  @UseGuards(AuthGuard)
  async changePassword(
    @Req() request: AuthenticatedRequest,
    @Body() body: PasswordChangeDto,
  ) {
    await this.authService.changePassword(
      sessionToken(request),
      body.currentPassword,
      body.newPassword,
    );
    return { success: true };
  }
}
