import { Injectable, UnauthorizedException } from "@nestjs/common";
import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { PrismaService } from "@law/core";
import { AuthSessionResponse, WorkspaceRole } from "@law/api-interfaces";
import { AuthMailService } from "./mail.service";

const scrypt = promisify(scryptCallback);
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const RESET_TTL_MS = 1000 * 60 * 30;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const [salt, key] = storedHash.split(":");
  if (!salt || !key) return false;
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(key, "hex");
  return (
    expected.length === derivedKey.length &&
    timingSafeEqual(expected, derivedKey)
  );
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: AuthMailService,
  ) {}

  async createInvitation(
    actorToken: string | undefined,
    email: string,
    workspaceId: string,
  ): Promise<void> {
    const actor = await this.userForToken(actorToken);
    const membership = actor.memberships.find(
      (item) => item.workspaceId === workspaceId,
    );
    if (!membership || !["OWNER", "ADMIN"].includes(membership.role))
      throw new UnauthorizedException("Workspace administrator required");

    const normalizedEmail = normalizeEmail(email);
    const user = await this.prisma.user.upsert({
      where: { email: normalizedEmail },
      update: {},
      create: { email: normalizedEmail },
    });
    await this.prisma.workspaceMember.upsert({
      where: { userId_workspaceId: { userId: user.id, workspaceId } },
      update: { status: "INVITED" },
      create: {
        userId: user.id,
        workspaceId,
        role: "MEMBER",
        status: "INVITED",
      },
    });
    const token = randomBytes(32).toString("base64url");
    await this.prisma.authToken.create({
      data: {
        userId: user.id,
        purpose: "INVITATION",
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MS * 2),
      },
    });
    await this.mail.sendInvitation(normalizedEmail, token);
    await this.audit({
      eventType: "INVITATION_CREATED",
      outcome: "SUCCESS",
      userId: actor.id,
      workspaceId,
    });
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ token: string; session: AuthSessionResponse }> {
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
      include: {
        memberships: {
          where: { status: "ACTIVE" },
          include: { workspace: true },
        },
      },
    });
    if (
      !user?.passwordHash ||
      user.status !== "ACTIVE" ||
      !(await verifyPassword(password, user.passwordHash))
    ) {
      await this.audit({ eventType: "LOGIN", outcome: "FAILURE" });
      throw new UnauthorizedException("Invalid credentials");
    }

    const result = await this.createSession(user.id, this.toResponse(user));
    await this.audit({ eventType: "LOGIN", outcome: "SUCCESS", userId: user.id });
    return result;
  }

  async acceptInvitation(
    token: string,
    password: string,
  ): Promise<{ token: string; session: AuthSessionResponse }> {
    const invitation = await this.prisma.authToken.findFirst({
      where: {
        purpose: "INVITATION",
        tokenHash: hashToken(token),
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: { include: { memberships: { include: { workspace: true } } } },
      },
    });
    if (!invitation || invitation.user.status === "DISABLED")
      throw new UnauthorizedException("Invalid invitation");

    const user = await this.prisma.user.update({
      where: { id: invitation.userId },
      data: {
        passwordHash: await hashPassword(password),
        passwordChangedAt: new Date(),
        status: "ACTIVE",
      },
      include: { memberships: { include: { workspace: true } } },
    });
    await this.prisma.$transaction([
      this.prisma.authToken.update({
        where: { id: invitation.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.workspaceMember.updateMany({
        where: { userId: user.id, status: "INVITED" },
        data: { status: "ACTIVE" },
      }),
    ]);
    await this.audit({
      eventType: "INVITATION_ACCEPTED",
      outcome: "SUCCESS",
      userId: user.id,
    });
    return this.createSession(user.id, this.toResponse(user));
  }

  async currentUser(token: string | undefined): Promise<AuthSessionResponse> {
    const user = await this.userForToken(token);
    return this.toResponse(user);
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    await this.prisma.authSession.updateMany({
      where: { refreshTokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit({ eventType: "LOGOUT", outcome: "SUCCESS" });
  }

  async refresh(
    token: string | undefined,
  ): Promise<{ token: string; session: AuthSessionResponse }> {
    if (!token) throw new UnauthorizedException("Authentication required");
    const current = await this.prisma.authSession.findFirst({
      where: {
        refreshTokenHash: hashToken(token),
      },
      include: {
        user: {
          include: {
            memberships: {
              where: { status: "ACTIVE" },
              include: { workspace: true },
            },
          },
        },
      },
    });
    if (!current || current.revokedAt || current.expiresAt <= new Date() || current.user.status !== "ACTIVE") {
      if (current?.tokenFamily) {
        await this.prisma.authSession.updateMany({
          where: { tokenFamily: current.tokenFamily, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await this.audit({
          eventType: "SESSION_REUSE_DETECTED",
          outcome: "FAILURE",
          userId: current.userId,
        });
      }
      throw new UnauthorizedException("Authentication required");
    }

    const nextToken = randomBytes(32).toString("base64url");
    await this.prisma.$transaction([
      this.prisma.authSession.update({
        where: { id: current.id },
        data: { revokedAt: new Date(), replacedAt: new Date() },
      }),
      this.prisma.authSession.create({
        data: {
          userId: current.userId,
          tokenFamily: current.tokenFamily,
          refreshTokenHash: hashToken(nextToken),
          expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        },
      }),
    ]);
    await this.audit({
      eventType: "SESSION_REFRESHED",
      outcome: "SUCCESS",
      userId: current.userId,
    });
    return { token: nextToken, session: this.toResponse(current.user) };
  }

  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
    });
    if (!user || user.status === "DISABLED") return;
    const token = randomBytes(32).toString("base64url");
    await this.prisma.authToken.create({
      data: {
        userId: user.id,
        purpose: "PASSWORD_RESET",
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });
    await this.mail.sendPasswordReset(user.email, token);
    await this.audit({
      eventType: "PASSWORD_RESET_REQUESTED",
      outcome: "SUCCESS",
      userId: user.id,
    });
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const reset = await this.prisma.authToken.findFirst({
      where: {
        purpose: "PASSWORD_RESET",
        tokenHash: hashToken(token),
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!reset) throw new UnauthorizedException("Invalid reset token");
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: reset.userId },
        data: {
          passwordHash: await hashPassword(password),
          passwordChangedAt: new Date(),
          status: "ACTIVE",
        },
      }),
      this.prisma.authToken.update({
        where: { id: reset.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.authSession.updateMany({
        where: { userId: reset.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit({
      eventType: "PASSWORD_RESET_COMPLETED",
      outcome: "SUCCESS",
      userId: reset.userId,
    });
  }

  private async createSession(
    userId: string,
    session: AuthSessionResponse,
  ): Promise<{ token: string; session: AuthSessionResponse }> {
    const token = randomBytes(32).toString("base64url");
    await this.prisma.authSession.create({
      data: {
        userId,
        tokenFamily: randomBytes(16).toString("hex"),
        refreshTokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    return { token, session };
  }

  private async userForToken(token: string | undefined) {
    if (!token) throw new UnauthorizedException("Authentication required");
    const record = await this.prisma.authSession.findFirst({
      where: {
        refreshTokenHash: hashToken(token),
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { status: "ACTIVE" },
      },
      include: {
        user: {
          include: {
            memberships: {
              where: { status: "ACTIVE" },
              include: { workspace: true },
            },
          },
        },
      },
    });
    if (!record) throw new UnauthorizedException("Authentication required");
    await this.prisma.authSession.update({
      where: { id: record.id },
      data: { lastUsedAt: new Date() },
    });
    return record.user;
  }

  private toResponse(user: {
    id: string;
    email: string;
    status: string;
    memberships: Array<{
      workspaceId: string;
      role: string;
      workspace: { name: string };
    }>;
  }): AuthSessionResponse {
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

  private async audit(input: {
    eventType: string;
    outcome: string;
    userId?: string;
    workspaceId?: string;
  }): Promise<void> {
    await this.prisma.auditEvent.create({ data: input });
  }
}
