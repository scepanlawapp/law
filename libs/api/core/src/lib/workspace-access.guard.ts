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
import { HARDCODED_WORKSPACE_ID } from "./workspace.constants";
import { WorkspaceContext, WorkspaceContextService } from "./workspace-context";

export interface AuthenticatedWorkspaceRequest {
  auth?: {
    user: { id: string; email?: string };
  };
  workspace?: { workspaceId: string; role: WorkspaceRole };
  workspaceContext?: WorkspaceContext;
}

const roleRank: Record<WorkspaceRole, number> = {
  [WorkspaceRole.MEMBER]: 1,
  [WorkspaceRole.LAWYER]: 2,
  [WorkspaceRole.ADMIN]: 3,
  [WorkspaceRole.OWNER]: 4,
};

/**
 * The app operates against a single hardcoded workspace (no workspace switching);
 * this guard only verifies the caller is an active member of that workspace.
 */
@Injectable()
export class WorkspaceAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly platformPrisma: PlatformPrismaService,
    private readonly workspaceContextService: WorkspaceContextService,
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

    const membership = await this.platformPrisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: request.auth.user.id,
          workspaceId: HARDCODED_WORKSPACE_ID,
        },
      },
      select: { workspaceId: true, role: true, status: true },
    });
    if (!membership || membership.status !== "ACTIVE") {
      throw new NotFoundException("Workspace not found");
    }
    if (requiredRole && roleRank[membership.role] < roleRank[requiredRole]) {
      throw new ForbiddenException("Insufficient workspace role");
    }

    const workspaceContext: WorkspaceContext = {
      userId: request.auth.user.id,
      workspaceId: membership.workspaceId,
      role: membership.role as WorkspaceRole,
    };

    this.workspaceContextService.enterWith(workspaceContext);

    request.workspace = {
      workspaceId: membership.workspaceId,
      role: membership.role as WorkspaceRole,
    };
    request.workspaceContext = workspaceContext;

    return true;
  }
}
