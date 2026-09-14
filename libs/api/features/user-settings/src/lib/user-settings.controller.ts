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
import { TenantConnectionManager, TenantRegistryService } from "@law/core";

@Controller("users/me")
@UseGuards(CsrfOriginGuard, AuthGuard)
export class UserSettingsController {
  constructor(
    private readonly settings: UserSettingsService,
    private readonly tenantRegistry: TenantRegistryService,
    private readonly connectionManager: TenantConnectionManager,
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
  async clearConversationHistory(@Req() request: AuthenticatedRequest) {
    const workspaceId = request.auth!.activeWorkspaceId;
    if (!workspaceId) return { deleted: 0 };

    const { tenant } =
      await this.tenantRegistry.resolveTenantForWorkspace(workspaceId);
    const tenantPrisma = this.connectionManager.getTenantClient(
      tenant.id,
      tenant.databaseName!,
    );
    const result = await tenantPrisma.chatSession.updateMany({
      where: {
        createdByUserId: request.auth!.user.id,
        workspaceId,
      },
      data: { isDeleted: true },
    });
    return { deleted: result.count };
  }
}
