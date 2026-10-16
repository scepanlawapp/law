import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "@law/core";
import { MFA_CHALLENGE_TTL_MS } from "../cookies";

export type MfaChallengeScope = "LOGIN" | "ENROLLMENT";

export const MFA_CHALLENGE_MAX_ATTEMPTS = 5;

/** Error code the web client uses to send the user back to the password step. */
export const MFA_CHALLENGE_INVALID = "MFA_CHALLENGE_INVALID";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function invalidChallenge(): UnauthorizedException {
  return new UnauthorizedException(
    "Verification session expired",
    MFA_CHALLENGE_INVALID,
  );
}

/**
 * Short-lived second-step tokens (AuthToken purpose MFA_CHALLENGE) issued
 * after a correct password. Scopes never cross: a lookup only matches its own
 * scope.
 */
@Injectable()
export class MfaChallengeService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, scope: MfaChallengeScope): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    await this.prisma.authToken.create({
      data: {
        userId,
        purpose: "MFA_CHALLENGE",
        scope,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + MFA_CHALLENGE_TTL_MS),
      },
    });
    return token;
  }

  async find(
    rawToken: string | undefined,
    scope: MfaChallengeScope,
  ): Promise<{ id: string; userId: string; createdAt: Date }> {
    if (!rawToken) throw invalidChallenge();
    const challenge = await this.prisma.authToken.findFirst({
      where: {
        purpose: "MFA_CHALLENGE",
        tokenHash: hashToken(rawToken),
        scope,
        consumedAt: null,
        expiresAt: { gt: new Date() },
        attempts: { lt: MFA_CHALLENGE_MAX_ATTEMPTS },
      },
    });
    if (!challenge) throw invalidChallenge();
    return {
      id: challenge.id,
      userId: challenge.userId,
      createdAt: challenge.createdAt,
    };
  }

  /**
   * Reserves one attempt before a code is evaluated, so parallel requests
   * cannot get more than MFA_CHALLENGE_MAX_ATTEMPTS guesses. Returns the
   * attempt count after the reservation; 401 when none is left.
   */
  async reserveAttempt(id: string): Promise<{ attempts: number }> {
    const reserved = await this.prisma.authToken.updateMany({
      where: {
        id,
        purpose: "MFA_CHALLENGE",
        consumedAt: null,
        expiresAt: { gt: new Date() },
        attempts: { lt: MFA_CHALLENGE_MAX_ATTEMPTS },
      },
      data: { attempts: { increment: 1 } },
    });
    if (reserved.count === 0) throw invalidChallenge();
    const current = await this.prisma.authToken.findUnique({
      where: { id },
      select: { attempts: true },
    });
    return { attempts: current?.attempts ?? MFA_CHALLENGE_MAX_ATTEMPTS };
  }

  /**
   * Called after a wrong code on a reserved attempt; the attempt that used
   * up the limit consumes the challenge (once) and audits the lock.
   */
  async recordFailure(
    challenge: { id: string; userId: string },
    attempts: number,
  ): Promise<{ locked: boolean }> {
    if (attempts < MFA_CHALLENGE_MAX_ATTEMPTS) return { locked: false };
    const locked = await this.prisma.authToken.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (locked.count > 0) {
      await this.prisma.auditEvent.create({
        data: {
          eventType: "MFA_CHALLENGE_LOCKED",
          outcome: "FAILURE",
          userId: challenge.userId,
        },
      });
    }
    return { locked: true };
  }

  /** Single use: a concurrent consumer that loses the race gets 401. */
  async consume(id: string): Promise<void> {
    const claimed = await this.prisma.authToken.updateMany({
      where: { id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (claimed.count === 0) throw invalidChallenge();
  }
}
