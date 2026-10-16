import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { toDataURL } from "qrcode";
import { HARDCODED_WORKSPACE_ID, PrismaService } from "@law/core";
import {
  AuthSessionResponse,
  MfaEnrollmentStartResponse,
  MfaRecoveryCodesResponse,
  MfaStatusResponse,
} from "@law/api-interfaces";
import { AuthSessionIssuer } from "../auth-session.issuer";
import { AuthMailService } from "../mail/auth-mail.service";
import { verifyPassword } from "../passwords";
import {
  MFA_CHALLENGE_INVALID,
  MfaChallengeService,
} from "./mfa-challenge.service";
import { MfaFailureThrottle } from "./mfa-failure-throttle";
import { MfaSecretCipher } from "./mfa-secret.cipher";
import { generateRecoveryCodes, hashRecoveryCode } from "./recovery-codes";
import { generateTotpSecret, totpUri, verifyTotp } from "./totp";
import { MFA_CODE_INVALID } from "./mfa-verification.service";
import { TrustedDeviceService } from "./trusted-device.service";

const DEFAULT_ISSUER = "Law";

/**
 * Who is enrolling: a signed-in user (re-authenticated with their password)
 * or a login step holding an ENROLLMENT challenge (password already proven).
 */
export type MfaActor =
  | { kind: "session"; userId: string }
  | { kind: "challenge"; token: string | undefined };

export interface MfaEnrollmentConfirmResult {
  recoveryCodes: string[];
  /** Only when confirmed from an ENROLLMENT challenge. */
  session?: AuthSessionResponse;
  sessionToken?: string;
}

type Tx = Pick<PrismaService, "mfaRecoveryCode" | "userMfa">;

@Injectable()
export class MfaEnrollmentService {
  private readonly logger = new Logger(MfaEnrollmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly challenges: MfaChallengeService,
    private readonly cipher: MfaSecretCipher,
    private readonly sessions: AuthSessionIssuer,
    private readonly mail: AuthMailService,
    private readonly trustedDevices: TrustedDeviceService,
    private readonly throttle: MfaFailureThrottle,
  ) {}

  async start(
    actor: MfaActor,
    currentPassword: string | undefined,
  ): Promise<MfaEnrollmentStartResponse> {
    if (!this.cipher.available) throw unavailable();
    let userId: string;
    if (actor.kind === "session") {
      await this.verifiedUser(actor.userId, currentPassword);
      userId = actor.userId;
    } else {
      userId = (await this.challenges.find(actor.token, "ENROLLMENT")).userId;
    }

    const existing = await this.prisma.userMfa.findUnique({
      where: { userId },
    });
    if (existing?.enabledAt) throw alreadyEnabled();

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) throw new UnauthorizedException("Authentication required");

    const secret = generateTotpSecret();
    const encrypted = this.cipher.encrypt(secret);
    const stored = {
      totpSecretCiphertext: encrypted.ciphertext,
      totpSecretIv: encrypted.iv,
      totpSecretAuthTag: encrypted.authTag,
      lastUsedStep: null,
    };
    if (existing) {
      // Replace the pending secret, but never an enabled one (race guard).
      const replaced = await this.prisma.userMfa.updateMany({
        where: { userId, enabledAt: null },
        data: stored,
      });
      if (replaced.count === 0) throw alreadyEnabled();
    } else {
      try {
        await this.prisma.userMfa.create({ data: { userId, ...stored } });
      } catch (error) {
        if (isUniqueViolation(error)) throw alreadyEnabled();
        throw error;
      }
    }

    const otpauthUrl = totpUri(secret, user.email, await this.issuer());
    return {
      otpauthUrl,
      qrCodeDataUrl: await toDataURL(otpauthUrl),
      secret,
    };
  }

  async confirm(
    actor: MfaActor,
    code: string,
  ): Promise<MfaEnrollmentConfirmResult> {
    const challenge =
      actor.kind === "challenge"
        ? await this.challenges.find(actor.token, "ENROLLMENT")
        : null;
    const userId =
      actor.kind === "session" ? actor.userId : (challenge?.userId as string);
    if (challenge) await this.throttle.assertNotThrottled(userId);

    const mfa = await this.prisma.userMfa.findUnique({ where: { userId } });
    if (!mfa) throw new BadRequestException("Enrollment has not been started");
    if (mfa.enabledAt) throw alreadyEnabled();
    // Decrypt before reserving: a server-side fault must not burn an attempt.
    const secret = this.decryptSecret(mfa);

    const reserved = challenge
      ? await this.challenges.reserveAttempt(challenge.id)
      : null;
    const step = verifyTotp(secret, code, null);
    if (step === null) {
      if (challenge && reserved) {
        await this.throttle.recordFailure(userId);
        const { locked } = await this.challenges.recordFailure(
          challenge,
          reserved.attempts,
        );
        if (locked) {
          throw new UnauthorizedException(
            "Verification session expired",
            MFA_CHALLENGE_INVALID,
          );
        }
      }
      throw new UnauthorizedException(
        "Invalid verification code",
        MFA_CODE_INVALID,
      );
    }

    const recoveryCodes = generateRecoveryCodes();
    await this.prisma.$transaction(async (tx) => {
      // Claims the pending row atomically; the matched step is recorded so
      // this very code can not be replayed at the next login.
      const enabled = await tx.userMfa.updateMany({
        where: {
          userId,
          enabledAt: null,
          totpSecretCiphertext: mfa.totpSecretCiphertext,
        },
        data: { enabledAt: new Date(), lastUsedStep: step },
      });
      if (enabled.count === 0) throw alreadyEnabled();
      await this.replaceRecoveryCodes(tx, userId, recoveryCodes);
    });
    await this.audit("MFA_ENROLLED", userId, {
      via: challenge ? "challenge" : "session",
    });

    if (!challenge) return { recoveryCodes };
    await this.challenges.consume(challenge.id);
    const issued = await this.sessions.issue(userId);
    await this.prisma.auditEvent.create({
      data: { eventType: "LOGIN", outcome: "SUCCESS", userId },
    });
    return {
      recoveryCodes,
      session: issued.session,
      sessionToken: issued.token,
    };
  }

  async disable(userId: string, currentPassword: string): Promise<void> {
    const user = await this.verifiedUser(userId, currentPassword);
    const mfa = await this.prisma.userMfa.findUnique({ where: { userId } });
    if (!mfa?.enabledAt) {
      throw new ConflictException("Two-factor authentication is not enabled");
    }
    if (await this.policyRequired()) {
      throw new ConflictException(
        "Two-factor authentication is required by the office",
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      await tx.userMfa.deleteMany({ where: { userId } });
      // Without 2FA there is nothing to remember; re-enabling starts clean.
      await this.trustedDevices.revokeAll(userId, tx);
    });
    await this.audit("MFA_DISABLED", userId);
    await this.mail.sendMfaDisabled(
      { id: user.id, email: user.email },
      new Date(),
    );
  }

  async regenerateRecoveryCodes(
    userId: string,
    currentPassword: string,
  ): Promise<MfaRecoveryCodesResponse> {
    await this.verifiedUser(userId, currentPassword);
    const mfa = await this.prisma.userMfa.findUnique({ where: { userId } });
    if (!mfa?.enabledAt) {
      throw new ConflictException("Two-factor authentication is not enabled");
    }
    const recoveryCodes = generateRecoveryCodes();
    await this.prisma.$transaction((tx) =>
      this.replaceRecoveryCodes(tx, userId, recoveryCodes),
    );
    await this.audit("MFA_RECOVERY_CODES_REGENERATED", userId);
    return { recoveryCodes };
  }

  async status(
    userId: string,
    currentTrustedDeviceToken?: string,
  ): Promise<MfaStatusResponse> {
    const [mfa, policyRequired] = await Promise.all([
      this.prisma.userMfa.findUnique({
        where: { userId },
        select: { enabledAt: true },
      }),
      this.policyRequired(),
    ]);
    const enabledAt = mfa?.enabledAt ?? null;
    const recoveryCodesRemaining = enabledAt
      ? await this.prisma.mfaRecoveryCode.count({
          where: { userId, consumedAt: null },
        })
      : 0;
    return {
      enabled: enabledAt !== null,
      enabledAt: enabledAt ? enabledAt.toISOString() : null,
      recoveryCodesRemaining,
      policyRequired,
      trustedDevices: await this.trustedDevices.list(
        userId,
        currentTrustedDeviceToken,
      ),
    };
  }

  /** Re-authenticated revocation of one device; 404 unless it is theirs. */
  async revokeTrustedDevice(
    userId: string,
    currentPassword: string,
    id: string,
    currentTrustedDeviceToken: string | undefined,
  ): Promise<{ revokedCurrent: boolean }> {
    await this.verifiedUser(userId, currentPassword);
    const revokedCurrent = await this.trustedDevices.isCurrent(
      userId,
      id,
      currentTrustedDeviceToken,
    );
    await this.trustedDevices.revoke(userId, id);
    await this.audit("TRUSTED_DEVICE_REVOKED", userId, { scope: "ONE" });
    return { revokedCurrent };
  }

  async revokeAllTrustedDevices(
    userId: string,
    currentPassword: string,
  ): Promise<void> {
    await this.verifiedUser(userId, currentPassword);
    await this.trustedDevices.revokeAll(userId);
    await this.audit("TRUSTED_DEVICE_REVOKED", userId, { scope: "ALL" });
  }

  /** Replaces the whole set: old codes are deleted, never left usable. */
  private async replaceRecoveryCodes(
    tx: Tx,
    userId: string,
    codes: string[],
  ): Promise<void> {
    await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
    await tx.mfaRecoveryCode.createMany({
      data: codes.map((code) => ({ userId, codeHash: hashRecoveryCode(code) })),
    });
  }

  /** Re-authentication: the signed-in user's current password. */
  private async verifiedUser(
    userId: string,
    currentPassword: string | undefined,
  ): Promise<{ id: string; email: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, passwordHash: true },
    });
    if (
      !user?.passwordHash ||
      !currentPassword ||
      !(await verifyPassword(currentPassword, user.passwordHash))
    ) {
      throw new UnauthorizedException("Current password is incorrect");
    }
    return { id: user.id, email: user.email };
  }

  private async policyRequired(): Promise<boolean> {
    const settings = await this.prisma.organizationSettings.findUnique({
      where: { workspaceId: HARDCODED_WORKSPACE_ID },
      select: { mfaRequired: true },
    });
    return settings?.mfaRequired ?? false;
  }

  private async issuer(): Promise<string> {
    const settings = await this.prisma.organizationSettings.findUnique({
      where: { workspaceId: HARDCODED_WORKSPACE_ID },
      select: { displayName: true, legalName: true },
    });
    return (
      settings?.displayName?.trim() ||
      settings?.legalName?.trim() ||
      DEFAULT_ISSUER
    );
  }

  private decryptSecret(mfa: {
    totpSecretCiphertext: string;
    totpSecretIv: string;
    totpSecretAuthTag: string;
  }): string {
    try {
      return this.cipher.decrypt({
        ciphertext: mfa.totpSecretCiphertext,
        iv: mfa.totpSecretIv,
        authTag: mfa.totpSecretAuthTag,
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      // Never log the underlying error: it may reference secret material.
      this.logger.error("Pending two-factor secret could not be decrypted");
      throw unavailable();
    }
  }

  private async audit(
    eventType: string,
    userId: string,
    metadata?: Record<string, string>,
  ): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        eventType,
        outcome: "SUCCESS",
        userId,
        ...(metadata ? { metadata } : {}),
      },
    });
  }
}

function unavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException(
    "Two-factor authentication is not configured",
  );
}

function alreadyEnabled(): ConflictException {
  return new ConflictException("Two-factor authentication is already enabled");
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}
