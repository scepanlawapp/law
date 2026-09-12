import {
  CanActivate,
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
  body?: { workspaceId?: string };
  params?: { workspaceId?: string };
  query?: { workspaceId?: string };
  headers: { [key: string]: string | string[] | undefined };
  auth?: { user: { id: string; email?: string } };
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
    const workspaceId = this.workspaceId(request);
    if (!workspaceId) throw new NotFoundException("Workspace not found");

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
    const tenantPrisma = this.connectionManager.getTenantClient(
      tenant.schemaName,
    );

    const tenantContext: TenantContext = {
      userId: request.auth.user.id,
      workspaceId: membership.workspaceId,
      tenantId: tenant.id,
      schemaName: tenant.schemaName,
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

  private workspaceId(
    request: AuthenticatedWorkspaceRequest,
  ): string | undefined {
    const header = request.headers["x-workspace-id"];
    return (
      request.params?.workspaceId ??
      request.body?.workspaceId ??
      request.query?.workspaceId ??
      (Array.isArray(header) ? header[0] : header)
    );
  }
}
