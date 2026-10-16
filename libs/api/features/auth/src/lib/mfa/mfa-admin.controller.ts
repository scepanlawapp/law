import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { MemberSecuritySummary, MfaPolicy } from "@law/api-interfaces";
import { AuthenticatedRequest, AuthGuard } from "../auth.guard";
import { CsrfOriginGuard } from "../csrf.guard";
import { AuthRateLimitGuard } from "../rate-limit.guard";
import { MfaPolicyDto } from "./mfa.dto";
import { MfaAdminService } from "./mfa-admin.service";

/** Role checks live in the service (OWNER/ADMIN of the workspace). */
@Controller("auth/admin")
@UseGuards(CsrfOriginGuard, AuthGuard)
export class MfaAdminController {
  constructor(private readonly admin: MfaAdminService) {}

  @Get("mfa-policy")
  getPolicy(@Req() request: AuthenticatedRequest): Promise<MfaPolicy> {
    return this.admin.getPolicy(authenticatedUserId(request));
  }

  @Put("mfa-policy")
  @UseGuards(AuthRateLimitGuard)
  setPolicy(
    @Body() body: MfaPolicyDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<MfaPolicy> {
    return this.admin.setPolicy(authenticatedUserId(request), body.mfaRequired);
  }

  @Get("members/security")
  listMembers(
    @Req() request: AuthenticatedRequest,
  ): Promise<MemberSecuritySummary[]> {
    return this.admin.listMembers(authenticatedUserId(request));
  }

  @Post("members/:userId/mfa/reset")
  @HttpCode(204)
  @UseGuards(AuthRateLimitGuard)
  resetMember(
    @Param("userId") userId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    return this.admin.resetMember(authenticatedUserId(request), userId);
  }
}

function authenticatedUserId(request: AuthenticatedRequest): string {
  if (!request.auth) throw new UnauthorizedException("Authentication required");
  return request.auth.user.id;
}
