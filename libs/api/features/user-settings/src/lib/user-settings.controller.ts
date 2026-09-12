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
import {
  PlatformPrismaService,
  TenantConnectionManager,
  TenantRegistryService,
} from "@law/core";

@Controller("users/me")
@UseGuards(CsrfOriginGuard, AuthGuard)
export class UserSettingsController {
  constructor(
    private readonly settings: UserSettingsService,
    private readonly prisma: PlatformPrismaService,
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
    const rawHeader = request.headers["x-workspace-id"];
    const workspaceId =
      (Array.isArray(rawHeader) ? rawHeader[0] : rawHeader) ??
      (request.query as Record<string, string> | undefined)?.["workspaceId"];

    if (workspaceId) {
      const { tenant } =
        await this.tenantRegistry.resolveTenantForWorkspace(workspaceId);
      const tenantPrisma = this.connectionManager.getTenantClient(
        tenant.schemaName,
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

    const workspaces = await this.tenantRegistry.listWorkspacesForUser(
      request.auth!.user.id,
    );
    let totalDeleted = 0;
    for (const ws of workspaces) {
      try {
        const { tenant } = await this.tenantRegistry.resolveTenantForWorkspace(
          ws.id,
        );
        const tenantPrisma = this.connectionManager.getTenantClient(
          tenant.schemaName,
        );
        const result = await tenantPrisma.chatSession.updateMany({
          where: {
            createdByUserId: request.auth!.user.id,
            workspaceId: ws.id,
          },
          data: { isDeleted: true },
        });
        totalDeleted += result.count;
      } catch {
        // Continue across other workspace schemas
      }
    }
    return { deleted: totalDeleted };
  }
}
