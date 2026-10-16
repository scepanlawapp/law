import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { HARDCODED_WORKSPACE_ID, PrismaService } from "@law/core";
import { AuthSessionResponse, LoginResponse } from "@law/api-interfaces";
import { AuthMailService } from "./mail/auth-mail.service";
import { AuthRateLimitStore } from "./rate-limit.store";
import { AuthSessionIssuer, toSessionResponse } from "./auth-session.issuer";
import { SESSION_TTL_MS } from "./cookies";
import { MfaChallengeService } from "./mfa/mfa-challenge.service";
import { MfaSecretCipher } from "./mfa/mfa-secret.cipher";

const scrypt = promisify(scryptCallback);
const RESET_TTL_MS = 1000 * 60 * 30;
const RESET_EMAIL_LIMIT = 3;
const RESET_EMAIL_WINDOW_MS = 1000 * 60 * 60;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Keeps plaintext emails out of Redis key names and audit metadata. */
function hashEmail(normalizedEmail: string): string {
  return createHash("sha256").update(normalizedEmail).digest("hex");
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
    private readonly rateLimit: AuthRateLimitStore,
    private readonly sessions: AuthSessionIssuer,
    private readonly challenges: MfaChallengeService,
    private readonly mfaCipher: MfaSecretCipher,
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

  /**
   * Password step. Issues a session only when no second factor is needed;
   * otherwise returns a challenge token for the `law_mfa_challenge` cookie.
   * `trustedDeviceToken` is accepted for the remember-device flow (not yet
   * honoured: an enabled second factor is always challenged).
   */
  async login(
    email: string,
    password: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    trustedDeviceToken?: string,
  ): Promise<{
    result: LoginResponse;
    sessionToken?: string;
    challengeToken?: string;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
      select: { id: true, status: true, passwordHash: true },
    });
    if (
      !user?.passwordHash ||
      user.status !== "ACTIVE" ||
      !(await verifyPassword(password, user.passwordHash))
    ) {
      await this.audit({ eventType: "LOGIN", outcome: "FAILURE" });
      throw new UnauthorizedException("Invalid credentials");
    }

    const mfa = await this.prisma.userMfa.findUnique({
      where: { userId: user.id },
      select: { enabledAt: true },
    });
    if (mfa?.enabledAt) {
      // Never bypass an enabled second factor, even when it cannot be checked.
      if (!this.mfaCipher.available) {
        await this.audit({
          eventType: "LOGIN",
          outcome: "FAILURE",
          userId: user.id,
          metadata: { reason: "MFA_UNAVAILABLE" },
        });
        throw new ServiceUnavailableException(
          "Two-factor authentication is not configured",
        );
      }
      const challengeToken = await this.challenges.create(user.id, "LOGIN");
      await this.audit({
        eventType: "LOGIN",
        outcome: "PENDING",
        userId: user.id,
        metadata: { next: "MFA_REQUIRED" },
      });
      return {
        result: {
          status: "MFA_REQUIRED",
          methods: ["TOTP", "RECOVERY", "EMAIL"],
        },
        challengeToken,
      };
    }

    if (await this.mfaRequiredByPolicy()) {
      const challengeToken = await this.challenges.create(
        user.id,
        "ENROLLMENT",
      );
      await this.audit({
        eventType: "LOGIN",
        outcome: "PENDING",
        userId: user.id,
        metadata: { next: "MFA_ENROLLMENT_REQUIRED" },
      });
      return { result: { status: "MFA_ENROLLMENT_REQUIRED" }, challengeToken };
    }

    const issued = await this.sessions.issue(user.id);
    await this.audit({
      eventType: "LOGIN",
      outcome: "SUCCESS",
      userId: user.id,
    });
    return {
      result: { status: "AUTHENTICATED", session: issued.session },
      sessionToken: issued.token,
    };
  }

  private async mfaRequiredByPolicy(): Promise<boolean> {
    const settings = await this.prisma.organizationSettings.findUnique({
      where: { workspaceId: HARDCODED_WORKSPACE_ID },
      select: { mfaRequired: true },
    });
    return settings?.mfaRequired ?? false;
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
    return this.sessions.issue(user.id);
  }

  async currentUser(token: string | undefined): Promise<AuthSessionResponse> {
    const record = await this.sessionForToken(token);
    return toSessionResponse(record.user);
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
    if (
      !current ||
      current.revokedAt ||
      current.expiresAt <= new Date() ||
      current.user.status !== "ACTIVE"
    ) {
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
    return {
      token: nextToken,
      session: toSessionResponse(current.user),
    };
  }

  async requestPasswordReset(email: string): Promise<void> {
    const normalizedEmail = normalizeEmail(email);
    const emailHash = hashEmail(normalizedEmail);
    let attempts: number;
    try {
      attempts = await this.rateLimit.hit(
        `pwreset-email:${emailHash}`,
        RESET_EMAIL_WINDOW_MS,
      );
    } catch {
      throw new ServiceUnavailableException("Rate limiting unavailable");
    }
    if (attempts > RESET_EMAIL_LIMIT) {
      await this.audit({
        eventType: "PASSWORD_RESET_THROTTLED",
        outcome: "FAILURE",
        metadata: { emailHash },
      });
      return;
    }
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (!user || user.status === "DISABLED") return;
    const token = randomBytes(32).toString("base64url");
    await this.prisma.$transaction([
      this.consumeOpenResetTokens(user.id),
      this.prisma.authToken.create({
        data: {
          userId: user.id,
          purpose: "PASSWORD_RESET",
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + RESET_TTL_MS),
        },
      }),
    ]);
    await this.mail.sendPasswordReset(user, token);
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
      include: { user: { select: { id: true, email: true } } },
    });
    if (!reset) throw new UnauthorizedException("Invalid reset token");
    const changedAt = new Date();
    const passwordHash = await hashPassword(password);
    await this.prisma.$transaction(async (tx) => {
      // Claim the token first so two concurrent requests cannot both succeed.
      const claimed = await tx.authToken.updateMany({
        where: {
          id: reset.id,
          consumedAt: null,
          expiresAt: { gt: changedAt },
        },
        data: { consumedAt: changedAt },
      });
      if (claimed.count === 0) {
        throw new UnauthorizedException("Invalid reset token");
      }
      await tx.user.update({
        where: { id: reset.userId },
        data: { passwordHash, passwordChangedAt: changedAt, status: "ACTIVE" },
      });
      await this.consumeOpenResetTokens(reset.userId, tx);
      await tx.authSession.updateMany({
        where: { userId: reset.userId, revokedAt: null },
        data: { revokedAt: changedAt },
      });
    });
    await this.mail.sendPasswordChanged(reset.user, changedAt);
    await this.audit({
      eventType: "PASSWORD_RESET_COMPLETED",
      outcome: "SUCCESS",
      userId: reset.userId,
    });
  }

  async changePassword(
    token: string | undefined,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const session = await this.sessionForToken(token);
    const user = session.user;
    if (
      !user.passwordHash ||
      !(await verifyPassword(currentPassword, user.passwordHash))
    ) {
      throw new UnauthorizedException("Current password is incorrect");
    }
    const changedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await hashPassword(newPassword),
          passwordChangedAt: changedAt,
        },
      }),
      this.prisma.authSession.updateMany({
        where: { userId: user.id, revokedAt: null, id: { not: session.id } },
        data: { revokedAt: changedAt },
      }),
      this.consumeOpenResetTokens(user.id),
    ]);
    await this.mail.sendPasswordChanged(
      { id: user.id, email: user.email },
      changedAt,
    );
    await this.audit({
      eventType: "PASSWORD_CHANGED",
      outcome: "SUCCESS",
      userId: user.id,
    });
  }

  private consumeOpenResetTokens(
    userId: string,
    client: Pick<PrismaService, "authToken"> = this.prisma,
  ) {
    return client.authToken.updateMany({
      where: { userId, purpose: "PASSWORD_RESET", consumedAt: null },
      data: { consumedAt: new Date() },
    });
  }

  private async userForToken(token: string | undefined) {
    return (await this.sessionForToken(token)).user;
  }

  private async sessionForToken(token: string | undefined) {
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
    return record;
  }

  private async audit(input: {
    eventType: string;
    outcome: string;
    userId?: string;
    workspaceId?: string;
    metadata?: Record<string, string>;
  }): Promise<void> {
    await this.prisma.auditEvent.create({ data: input });
  }
}
