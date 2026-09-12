import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { AuthGuard, AuthenticatedRequest, CsrfOriginGuard } from "@law/auth";
import { TenantRegistryService } from "@law/core";
import { WorkspaceSummary } from "@law/api-interfaces";

@Controller("workspaces")
@UseGuards(CsrfOriginGuard, AuthGuard)
export class WorkspacesController {
  constructor(private readonly tenantRegistry: TenantRegistryService) {}

  @Get()
  listWorkspaces(
    @Req() request: AuthenticatedRequest,
  ): Promise<WorkspaceSummary[]> {
    return this.tenantRegistry.listWorkspacesForUser(request.auth!.user.id);
  }
}
