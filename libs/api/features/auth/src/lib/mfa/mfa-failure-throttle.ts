import { ApiErrorCode } from "@law/api-interfaces";
import {
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "@law/core";
import { AuthRateLimitStore } from "../rate-limit.store";

/** Error code for an account with too many failed second-factor checks. */
export const MFA_ACCOUNT_THROTTLED = ApiErrorCode.MFA_ACCOUNT_THROTTLED;

/** More than this many failures in the window throttles the account. */
export const MFA_ACCOUNT_FAILURE_LIMIT = 10;
export const MFA_ACCOUNT_FAILURE_WINDOW_MS = 15 * 60 * 1000;

function failureKey(userId: string): string {
  return `mfa-fail:user:${userId}`;
}

/**
 * Per-account cap on failed second-factor checks across all challenges
 * (a fresh password login yields a fresh 5-attempt challenge, so the
 * per-challenge limit alone does not bound guesses). Fails closed: a store
 * fault answers 503.
 */
@Injectable()
export class MfaFailureThrottle {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimit: AuthRateLimitStore,
  ) {}

  /** 429 when the account is over the limit; reads without counting. */
  async assertNotThrottled(userId: string): Promise<void> {
    let failures: number;
    try {
      failures = await this.rateLimit.peek(failureKey(userId));
    } catch {
      throw new ServiceUnavailableException("Rate limiting unavailable");
    }
    if (failures > MFA_ACCOUNT_FAILURE_LIMIT) throw throttled();
  }

  /** Counts one failed check; audits once per window when the limit is crossed. */
  async recordFailure(userId: string): Promise<void> {
    let failures: number;
    try {
      failures = await this.rateLimit.hit(
        failureKey(userId),
        MFA_ACCOUNT_FAILURE_WINDOW_MS,
      );
    } catch {
      throw new ServiceUnavailableException("Rate limiting unavailable");
    }
    if (failures === MFA_ACCOUNT_FAILURE_LIMIT + 1) {
      await this.prisma.auditEvent.create({
        data: {
          eventType: MFA_ACCOUNT_THROTTLED,
          outcome: "FAILURE",
          userId,
        },
      });
    }
  }
}

function throttled(): HttpException {
  return new HttpException(
    {
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      message: "Too many failed verification attempts",
      error: MFA_ACCOUNT_THROTTLED,
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
