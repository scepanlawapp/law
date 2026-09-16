import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard, AuthenticatedRequest, CsrfOriginGuard } from "@law/auth";
import { UserSettingsService } from "./user-settings.service";
import { UpdateUserSettingsDto } from "./user-settings.dto";
import { PlatformPrismaService } from "@law/core";

@Controller("users/me")
@UseGuards(CsrfOriginGuard, AuthGuard)
export class UserSettingsController {
  constructor(
    private readonly settings: UserSettingsService,
    private readonly prisma: PlatformPrismaService,
  ) {}

  @Get("settings")
  get(@Req() request: AuthenticatedRequest) {
    return this.settings.get(request.auth!.user.id);
  }

  @Patch("settings")
  update(
    @Req() request: AuthenticatedRequest,
    @Body() body: UpdateUserSettingsDto,
  ) {
    return this.settings.update(request.auth!.user.id, body);
  }

  @Delete("conversations")
  async clearConversationHistory(
    @Req()
    request: AuthenticatedRequest & {
      workspace?: { workspaceId: string };
    },
  ) {
    const workspaceId = request.workspace?.workspaceId;
    if (!workspaceId) return { deleted: 0 };

    const result = await this.prisma.chatSession.updateMany({
      where: {
        createdByUserId: request.auth!.user.id,
        workspaceId,
      },
      data: { isDeleted: true },
    });
    return { deleted: result.count };
  }
}
