import { Body, Controller, Get, Post, Req, Res } from "@nestjs/common";
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import {
  InvitationAcceptRequest,
  InvitationCreateRequest,
  LoginRequest,
  PasswordForgotRequest,
  PasswordResetRequest,
} from "@law/api-interfaces";

const SESSION_COOKIE = "law_session";
const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

function sessionToken(request: Request): string | undefined {
  const header = request.headers.cookie
    ?.split(";")
    .find((part) => part.trim().startsWith(`${SESSION_COOKIE}=`));
  return header?.trim().slice(SESSION_COOKIE.length + 1);
}

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  async login(
    @Body() body: LoginRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(body.email, body.password);
    response.cookie(SESSION_COOKIE, result.token, {
      ...cookieOptions,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });
    return result.session;
  }

  @Post("invitations/accept")
  async acceptInvitation(
    @Body() body: InvitationAcceptRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.acceptInvitation(
      body.token,
      body.password,
    );
    response.cookie(SESSION_COOKIE, result.token, {
      ...cookieOptions,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });
    return result.session;
  }

  @Post("invitations")
  async createInvitation(
    @Body() body: InvitationCreateRequest,
    @Req() request: Request,
  ) {
    await this.authService.createInvitation(
      sessionToken(request),
      body.email,
      body.workspaceId,
    );
    return { success: true };
  }

  @Get("me")
  me(@Req() request: Request) {
    return this.authService.currentUser(sessionToken(request));
  }

  @Post("refresh")
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.refresh(sessionToken(request));
    response.cookie(SESSION_COOKIE, result.token, {
      ...cookieOptions,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });
    return result.session;
  }

  @Post("logout")
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(sessionToken(request));
    response.clearCookie(SESSION_COOKIE, cookieOptions);
    return { success: true };
  }

  @Post("password/forgot")
  async forgotPassword(@Body() body: PasswordForgotRequest) {
    await this.authService.requestPasswordReset(body.email);
    return { success: true };
  }

  @Post("password/reset")
  async resetPassword(@Body() body: PasswordResetRequest) {
    await this.authService.resetPassword(body.token, body.password);
    return { success: true };
  }
}
