import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "@law/core";
import { AuthSessionResponse, WorkspaceRole } from "@law/api-interfaces";
import { SESSION_TTL_MS } from "./cookies";

export interface SessionUser {
  id: string;
  email: string;
  status: string;
  memberships: Array<{
    workspaceId: string;
    role: string;
    workspace: { name: string };
  }>;
}

export function toSessionResponse(user: SessionUser): AuthSessionResponse {
  return {
    user: {
      id: user.id,
      email: user.email,
      status: user.status as AuthSessionResponse["user"]["status"],
    },
    memberships: user.memberships.map((membership) => ({
      workspaceId: membership.workspaceId,
      workspaceName: membership.workspace.name,
      role: membership.role as WorkspaceRole,
    })),
  };
}

/** Creates login sessions; the only place a new token family is started. */
@Injectable()
export class AuthSessionIssuer {
  constructor(private readonly prisma: PrismaService) {}

  /** Issues a session for a user that is still ACTIVE, else 401. */
  async issue(
    userId: string,
  ): Promise<{ token: string; session: AuthSessionResponse }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: { status: "ACTIVE" },
          include: { workspace: true },
        },
      },
    });
    if (!user || user.status !== "ACTIVE") {
      throw new UnauthorizedException("Authentication required");
    }
    const token = randomBytes(32).toString("base64url");
    await this.prisma.authSession.create({
      data: {
        userId,
        tokenFamily: randomBytes(16).toString("hex"),
        refreshTokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    return { token, session: toSessionResponse(user) };
  }
}
