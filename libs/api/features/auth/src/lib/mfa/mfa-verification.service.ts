import {
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, randomInt } from "node:crypto";
import { PrismaService } from "@law/core";
import {
  AuthSessionResponse,
  MfaMethod,
  MfaVerifyRequest,
} from "@law/api-interfaces";
import { AuthSessionIssuer } from "../auth-session.issuer";
import { MFA_CHALLENGE_TTL_MS } from "../cookies";
import { AuthMailService } from "../mail/auth-mail.service";
import { AuthRateLimitStore } from "../rate-limit.store";
import {
  MFA_CHALLENGE_INVALID,
  MfaChallengeService,
} from "./mfa-challenge.service";
import { MfaSecretCipher } from "./mfa-secret.cipher";
import { hashRecoveryCode } from "./recovery-codes";
import { TrustedDeviceService } from "./trusted-device.service";
import { verifyTotp } from "./totp";

/** Error code for a wrong code on a still-valid challenge. */
export const MFA_CODE_INVALID = "MFA_CODE_INVALID";

const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
const EMAIL_CODES_PER_CHALLENGE = 3;
const EMAIL_CODES_PER_USER = 5;
const EMAIL_CODES_USER_WINDOW_MS = 60 * 60 * 1000;

/** A code is only valid for the challenge it was issued for. */
function emailCodeHash(challengeId: string, code: string): string {
  return createHash("sha256").update(`${challengeId}:${code}`).digest("hex");
}

type EnabledMfa = {
  userId: string;
  totpSecretCiphertext: string;
  totpSecretIv: string;
  totpSecretAuthTag: string;
  lastUsedStep: bigint | null;
};

@Injectable()
export class MfaVerificationService {
  private readonly logger = new Logger(MfaVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly challenges: MfaChallengeService,
    private readonly cipher: MfaSecretCipher,
    private readonly sessions: AuthSessionIssuer,
    private readonly trustedDevices: TrustedDeviceService,
    private readonly mail: AuthMailService,
    private readonly rateLimit: AuthRateLimitStore,
  ) {}

  /**
   * Sends a one-time sign-in code to the account email. Silent by design:
   * limits, an unenrolled user or a disabled account all look like success so
   * the endpoint reveals nothing. Only an invalid challenge (the caller never
   * passed the password step) is an error.
   */
  async sendEmailCode(challengeToken: string | undefined): Promise<void> {
    const challenge = await this.challenges.find(challengeToken, "LOGIN");
    const { userId } = challenge;

    const mfa = await this.prisma.userMfa.findUnique({ where: { userId } });
    if (!mfa?.enabledAt) return;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, status: true },
    });
    if (!user || user.status !== "ACTIVE") return;

    if (
      (await this.hitLimit(
        `mfa-email:challenge:${challenge.id}`,
        MFA_CHALLENGE_TTL_MS,
      )) > EMAIL_CODES_PER_CHALLENGE
    ) {
      return;
    }
    if (
      (await this.hitLimit(
        `mfa-email:user:${userId}`,
        EMAIL_CODES_USER_WINDOW_MS,
      )) > EMAIL_CODES_PER_USER
    ) {
      return;
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    // An earlier unused code stops working as soon as a new one exists.
    await this.prisma.$transaction([
      this.prisma.authToken.updateMany({
        where: { userId, purpose: "MFA_EMAIL_CODE", consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.authToken.create({
        data: {
          userId,
          purpose: "MFA_EMAIL_CODE",
          tokenHash: emailCodeHash(challenge.id, code),
          expiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MS),
        },
      }),
    ]);
    await this.mail.sendMfaEmailCode({ id: user.id, email: user.email }, code);
    await this.prisma.auditEvent.create({
      data: { eventType: "MFA_EMAIL_CODE_SENT", outcome: "SUCCESS", userId },
    });
  }

  private async hitLimit(key: string, windowMs: number): Promise<number> {
    try {
      return await this.rateLimit.hit(key, windowMs);
    } catch {
      throw new ServiceUnavailableException("Rate limiting unavailable");
    }
  }

  async verify(
    challengeToken: string | undefined,
    request: MfaVerifyRequest,
    meta: { userAgent?: string; ipAddress?: string } = {},
  ): Promise<{
    token: string;
    session: AuthSessionResponse;
    userId: string;
    /** Raw token for the trusted-device cookie; only when requested. */
    trustedDeviceToken?: string;
  }> {
    const challenge = await this.challenges.find(challengeToken, "LOGIN");
    const { userId } = challenge;
    const mfa = await this.prisma.userMfa.findUnique({ where: { userId } });
    // Decrypt before reserving: a server-side fault must not burn an attempt.
    const secret =
      mfa?.enabledAt && request.method === "TOTP"
        ? this.decryptSecret(mfa)
        : null;

    const { attempts } = await this.challenges.reserveAttempt(challenge.id);
    const accepted =
      !!mfa?.enabledAt &&
      (request.method === "TOTP"
        ? secret !== null && (await this.acceptTotp(mfa, secret, request.code))
        : request.method === "EMAIL"
          ? await this.acceptEmailCode(userId, challenge.id, request.code)
          : await this.acceptRecoveryCode(userId, request.code));

    if (!accepted) {
      await this.audit("FAILURE", userId, request.method);
      const { locked } = await this.challenges.recordFailure(
        challenge,
        attempts,
      );
      if (locked) {
        throw new UnauthorizedException(
          "Verification session expired",
          MFA_CHALLENGE_INVALID,
        );
      }
      throw new UnauthorizedException(
        "Invalid verification code",
        MFA_CODE_INVALID,
      );
    }

    await this.challenges.consume(challenge.id);
    const issued = await this.sessions.issue(userId);
    await this.audit("SUCCESS", userId, request.method);
    await this.prisma.auditEvent.create({
      data: { eventType: "LOGIN", outcome: "SUCCESS", userId },
    });
    const trustedDeviceToken = request.rememberDevice
      ? await this.rememberDevice(userId, meta)
      : undefined;
    return { ...issued, userId, trustedDeviceToken };
  }

  /** The login already succeeded; a storage fault must not undo it. */
  private async rememberDevice(
    userId: string,
    meta: { userAgent?: string; ipAddress?: string },
  ): Promise<string | undefined> {
    try {
      return await this.trustedDevices.create(userId, meta);
    } catch {
      this.logger.error("Trusted device could not be stored");
      return undefined;
    }
  }

  /** Verifies the code and claims its time step atomically (replay guard). */
  private async acceptTotp(
    mfa: EnabledMfa,
    secret: string,
    code: string,
  ): Promise<boolean> {
    const step = verifyTotp(secret, code, mfa.lastUsedStep);
    if (step === null) return false;
    const claimed = await this.prisma.userMfa.updateMany({
      where: {
        userId: mfa.userId,
        enabledAt: { not: null },
        OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: step } }],
      },
      data: { lastUsedStep: step },
    });
    return claimed.count > 0;
  }

  /**
   * Matches by hash of `${challengeId}:${code}` (newest unexpired unused
   * code) and claims it atomically so it works exactly once.
   */
  private async acceptEmailCode(
    userId: string,
    challengeId: string,
    code: string,
  ): Promise<boolean> {
    const match = await this.prisma.authToken.findFirst({
      where: {
        userId,
        purpose: "MFA_EMAIL_CODE",
        tokenHash: emailCodeHash(challengeId, code.replace(/\s+/g, "")),
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!match) return false;
    const claimed = await this.prisma.authToken.updateMany({
      where: { id: match.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    return claimed.count > 0;
  }

  private async acceptRecoveryCode(
    userId: string,
    code: string,
  ): Promise<boolean> {
    const match = await this.prisma.mfaRecoveryCode.findFirst({
      where: { userId, codeHash: hashRecoveryCode(code), consumedAt: null },
      select: { id: true },
    });
    if (!match) return false;
    const claimed = await this.prisma.mfaRecoveryCode.updateMany({
      where: { id: match.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    return claimed.count > 0;
  }

  private decryptSecret(mfa: EnabledMfa): string {
    try {
      return this.cipher.decrypt({
        ciphertext: mfa.totpSecretCiphertext,
        iv: mfa.totpSecretIv,
        authTag: mfa.totpSecretAuthTag,
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      // Never log the underlying error: it may reference secret material.
      this.logger.error("Stored two-factor secret could not be decrypted");
      throw new ServiceUnavailableException(
        "Two-factor authentication is unavailable",
      );
    }
  }

  private async audit(
    outcome: "SUCCESS" | "FAILURE",
    userId: string,
    method: MfaMethod,
  ): Promise<void> {
    await this.prisma.auditEvent.create({
      data: { eventType: "MFA_VERIFY", outcome, userId, metadata: { method } },
    });
  }
}
