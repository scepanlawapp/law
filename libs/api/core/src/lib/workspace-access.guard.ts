import {
  CanActivate,
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { WorkspaceRole } from "@law/api-interfaces";
import { PlatformPrismaService } from "./core";
import { WORKSPACE_ROLE_KEY } from "./workspace-access.decorator";
import { TenantRegistryService } from "./tenant-registry.service";
import { TenantConnectionManager } from "./tenant-connection-manager";
import { TenantContext, TenantContextService } from "./tenant-context";

export interface AuthenticatedWorkspaceRequest {
  auth?: {
    user: { id: string; email?: string };
    activeWorkspaceId: string | null;
    activeTenantId: string | null;
  };
  workspace?: { workspaceId: string; role: WorkspaceRole };
  tenantContext?: TenantContext;
}

const roleRank: Record<WorkspaceRole, number> = {
  [WorkspaceRole.MEMBER]: 1,
  [WorkspaceRole.LAWYER]: 2,
  [WorkspaceRole.ADMIN]: 3,
  [WorkspaceRole.OWNER]: 4,
};

@Injectable()
export class WorkspaceAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly platformPrisma: PlatformPrismaService,
    private readonly tenantRegistry: TenantRegistryService,
    private readonly connectionManager: TenantConnectionManager,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedWorkspaceRequest>();
    if (!request.auth?.user.id) {
      throw new ForbiddenException("Authentication required");
    }

    const requiredRole = this.reflector.getAllAndOverride<
      WorkspaceRole | undefined
    >(WORKSPACE_ROLE_KEY, [context.getHandler(), context.getClass()]);
    const workspaceId = request.auth.activeWorkspaceId;
    const activeTenantId = request.auth.activeTenantId;
    if (!workspaceId || !activeTenantId) {
      throw new ConflictException("An active workspace must be selected");
    }

    const membership = await this.platformPrisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: { userId: request.auth.user.id, workspaceId },
      },
      select: { workspaceId: true, role: true, status: true },
    });
    if (!membership || membership.status !== "ACTIVE") {
      throw new NotFoundException("Workspace not found");
    }
    if (requiredRole && roleRank[membership.role] < roleRank[requiredRole]) {
      throw new ForbiddenException("Insufficient workspace role");
    }

    const { tenant } =
      await this.tenantRegistry.resolveTenantForWorkspace(workspaceId);
    if (tenant.id !== activeTenantId) {
      throw new ConflictException("Active tenant selection is invalid");
    }
    const tenantPrisma = this.connectionManager.getTenantClient(
      tenant.id,
      tenant.databaseName!,
    );

    const tenantContext: TenantContext = {
      userId: request.auth.user.id,
      workspaceId: membership.workspaceId,
      tenantId: tenant.id,
      databaseName: tenant.databaseName!,
      role: membership.role as WorkspaceRole,
      storagePrefix: tenant.storagePrefix ?? `tenants/${tenant.id}/`,
      prisma: tenantPrisma,
    };

    this.tenantContextService.enterWith(tenantContext);

    request.workspace = {
      workspaceId: membership.workspaceId,
      role: membership.role as WorkspaceRole,
    };
    request.tenantContext = tenantContext;

    return true;
  }
}
