import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
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

const SESSION_COOKIE = "law_session";
@Controller("auth")
@UseGuards(CsrfOriginGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: AuthRuntimeConfig,
  ) {}

  private cookieOptions() {
    return {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: this.config.production,
      path: "/",
    };
  }

  @Post("login")
  @UseGuards(AuthRateLimitGuard)
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(body.email, body.password);
    response.cookie(SESSION_COOKIE, result.token, {
      ...this.cookieOptions(),
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });
    return result.session;
  }

  @Post("invitations/accept")
  async acceptInvitation(
    @Body() body: InvitationAcceptDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.acceptInvitation(
      body.token,
      body.password,
    );
    response.cookie(SESSION_COOKIE, result.token, {
      ...this.cookieOptions(),
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });
    return result.session;
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
      maxAge: 1000 * 60 * 60 * 24 * 7,
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
