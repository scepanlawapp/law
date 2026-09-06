import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { WorkspaceRole } from "@law/api-interfaces";
import { PrismaService } from "./core";
import { WORKSPACE_ROLE_KEY } from "./workspace-access.decorator";

interface AuthenticatedRequest {
  body?: { workspaceId?: string };
  params?: { workspaceId?: string };
  query?: { workspaceId?: string };
  headers: { [key: string]: string | string[] | undefined };
  auth?: { user: { id: string } };
  workspace?: { workspaceId: string; role: WorkspaceRole };
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
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.auth?.user.id) {
      throw new ForbiddenException("Authentication required");
    }

    const requiredRole = this.reflector.getAllAndOverride<WorkspaceRole | undefined>(
      WORKSPACE_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );
    const workspaceId = this.workspaceId(request);
    if (!workspaceId) throw new NotFoundException("Workspace not found");

    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: request.auth.user.id, workspaceId } },
      select: { workspaceId: true, role: true, status: true },
    });
    if (!membership || membership.status !== "ACTIVE") {
      throw new NotFoundException("Workspace not found");
    }
    if (requiredRole && roleRank[membership.role] < roleRank[requiredRole]) {
      throw new ForbiddenException("Insufficient workspace role");
    }
    request.workspace = {
      workspaceId: membership.workspaceId,
      role: membership.role as WorkspaceRole,
    };
    return true;
  }

  private workspaceId(request: AuthenticatedRequest): string | undefined {
    const header = request.headers["x-workspace-id"];
    return request.params?.workspaceId
      ?? request.body?.workspaceId
      ?? request.query?.workspaceId
      ?? (Array.isArray(header) ? header[0] : header);
  }
}