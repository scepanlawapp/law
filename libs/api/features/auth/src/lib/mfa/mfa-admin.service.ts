import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { HARDCODED_WORKSPACE_ID, PrismaService } from "@law/core";
import {
  MemberSecuritySummary,
  MfaPolicy,
  WorkspaceRole,
} from "@law/api-interfaces";
import { AuthMailService } from "../mail/auth-mail.service";
import { TrustedDeviceService } from "./trusted-device.service";

const ADMIN_ROLES: string[] = ["OWNER", "ADMIN"];

/**
 * Workspace-admin side of 2FA: the office-wide policy, a per-member security
 * overview and the emergency reset of a member's second factor. Every method
 * re-checks the actor against the live membership row (not the session
 * snapshot) so a demoted admin loses access immediately.
 */
@Injectable()
export class MfaAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: AuthMailService,
    private readonly trustedDevices: TrustedDeviceService,
  ) {}

  async getPolicy(actorId: string): Promise<MfaPolicy> {
    await this.requireAdmin(actorId);
    const settings = await this.prisma.organizationSettings.findUnique({
      where: { workspaceId: HARDCODED_WORKSPACE_ID },
      select: { mfaRequired: true },
    });
    return { mfaRequired: settings?.mfaRequired ?? false };
  }

  async setPolicy(actorId: string, mfaRequired: boolean): Promise<MfaPolicy> {
    await this.requireAdmin(actorId);
    const settings = await this.prisma.organizationSettings.upsert({
      where: { workspaceId: HARDCODED_WORKSPACE_ID },
      update: { mfaRequired },
      // Same safe defaults as the financials settings service uses when it
      // creates the row first.
      create: {
        workspaceId: HARDCODED_WORKSPACE_ID,
        mfaRequired,
        availableVatRates: [0, 10, 20] as Prisma.InputJsonValue,
        allowedCurrencyCodes: ["RSD"] as Prisma.InputJsonValue,
        allowedSefAttachmentFileExtensions: [] as Prisma.InputJsonValue,
      },
      select: { mfaRequired: true },
    });
    await this.prisma.auditEvent.create({
      data: {
        eventType: "MFA_POLICY_CHANGED",
        outcome: "SUCCESS",
        userId: actorId,
        workspaceId: HARDCODED_WORKSPACE_ID,
        metadata: { mfaRequired: settings.mfaRequired },
      },
    });
    return { mfaRequired: settings.mfaRequired };
  }

  /** ACTIVE members only; never exposes secrets, only the enabled flag. */
  async listMembers(actorId: string): Promise<MemberSecuritySummary[]> {
    await this.requireAdmin(actorId);
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId: HARDCODED_WORKSPACE_ID, status: "ACTIVE" },
      select: {
        userId: true,
        role: true,
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
            mfa: { select: { enabledAt: true } },
          },
        },
      },
      orderBy: [{ createdAt: "asc" }, { userId: "asc" }],
    });
    return members.map((member) => {
      const enabledAt = member.user.mfa?.enabledAt ?? null;
      return {
        userId: member.userId,
        name:
          [member.user.firstName, member.user.lastName]
            .map((part) => part?.trim())
            .filter(Boolean)
            .join(" ") || null,
        email: member.user.email,
        role: member.role as WorkspaceRole,
        mfaEnabled: enabledAt !== null,
        mfaEnabledAt: enabledAt ? enabledAt.toISOString() : null,
      };
    });
  }

  /**
   * Removes a member's second factor so they can enrol again (lost phone and
   * recovery codes). Targets: ACTIVE or INVITED members of the workspace
   * (SUSPENDED and strangers are 404 so existence is not disclosed). An
   * admin can not reset themselves: that path would bypass the
   * password-gated self-service flow.
   */
  async resetMember(actorId: string, targetUserId: string): Promise<void> {
    await this.requireAdmin(actorId);
    if (targetUserId === actorId) {
      throw new ForbiddenException(
        "Use your own security settings to change your two-factor authentication",
      );
    }
    const membership = await this.prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: targetUserId,
          workspaceId: HARDCODED_WORKSPACE_ID,
        },
      },
      select: { status: true },
    });
    if (!membership || !["ACTIVE", "INVITED"].includes(membership.status)) {
      throw new NotFoundException("Member not found");
    }
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true },
    });
    if (!user) throw new NotFoundException("Member not found");

    const at = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.mfaRecoveryCode.deleteMany({ where: { userId: user.id } });
      await tx.userMfa.deleteMany({ where: { userId: user.id } });
      await this.trustedDevices.revokeAll(user.id, tx);
      // Signs the member out everywhere: they sign in again with the
      // password and are re-enrolled if the office policy requires it.
      await tx.authSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: at },
      });
    });
    await this.prisma.auditEvent.create({
      data: {
        eventType: "MFA_RESET_BY_ADMIN",
        outcome: "SUCCESS",
        userId: user.id,
        workspaceId: HARDCODED_WORKSPACE_ID,
        metadata: { actorId },
      },
    });
    await this.mail.sendMfaResetByAdmin({ id: user.id, email: user.email }, at);
  }

  private async requireAdmin(actorId: string): Promise<void> {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: actorId,
          workspaceId: HARDCODED_WORKSPACE_ID,
        },
      },
      select: { role: true, status: true },
    });
    if (
      !membership ||
      membership.status !== "ACTIVE" ||
      !ADMIN_ROLES.includes(membership.role)
    ) {
      throw new ForbiddenException("Workspace administrator required");
    }
  }
}
