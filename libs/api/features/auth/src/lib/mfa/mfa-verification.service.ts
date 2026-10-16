import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "@law/core";
import {
  AuthSessionResponse,
  MfaMethod,
  MfaVerifyRequest,
} from "@law/api-interfaces";
import { AuthSessionIssuer } from "../auth-session.issuer";
import {
  MFA_CHALLENGE_INVALID,
  MfaChallengeService,
} from "./mfa-challenge.service";
import { MfaSecretCipher } from "./mfa-secret.cipher";
import { hashRecoveryCode } from "./recovery-codes";
import { verifyTotp } from "./totp";

/** Error code for a wrong code on a still-valid challenge. */
export const MFA_CODE_INVALID = "MFA_CODE_INVALID";

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
  ) {}

  async verify(
    challengeToken: string | undefined,
    request: MfaVerifyRequest,
  ): Promise<{ token: string; session: AuthSessionResponse; userId: string }> {
    if (request.method === "EMAIL") {
      throw new BadRequestException("Email codes are not available yet");
    }
    const challenge = await this.challenges.find(challengeToken, "LOGIN");
    const { userId } = challenge;
    const mfa = await this.prisma.userMfa.findUnique({ where: { userId } });

    const accepted =
      !!mfa?.enabledAt &&
      (request.method === "TOTP"
        ? await this.acceptTotp(mfa, request.code)
        : await this.acceptRecoveryCode(userId, request.code));

    if (!accepted) {
      await this.audit("FAILURE", userId, request.method);
      const { locked } = await this.challenges.recordFailure(challenge.id);
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
    return { ...issued, userId };
  }

  /** Verifies the code and claims its time step atomically (replay guard). */
  private async acceptTotp(mfa: EnabledMfa, code: string): Promise<boolean> {
    const secret = this.decryptSecret(mfa);
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
