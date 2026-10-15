import { WorkspaceRole } from "@law/api-interfaces";
import { PlatformPrismaService, WorkspaceContextService } from "@law/core";

/**
 * Runs `run` with the user as the workspace actor. Agent jobs run as the
 * system with admin rights; reads and writes on a user's behalf go through
 * here so the domain services apply that user's own permissions.
 */
export async function runAsMember<T>(
  prisma: PlatformPrismaService,
  workspaceId: string,
  userId: string,
  run: () => Promise<T>,
): Promise<T> {
  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId, status: "ACTIVE" },
    select: { role: true },
  });
  if (!member) throw new Error("User is not an active workspace member");
  return WorkspaceContextService.run(
    { workspaceId, userId, role: member.role as WorkspaceRole },
    run,
  );
}
