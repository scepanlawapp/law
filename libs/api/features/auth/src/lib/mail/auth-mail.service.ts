import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { HARDCODED_WORKSPACE_ID, PrismaService } from "@law/core";
import { AuthRuntimeConfig } from "../auth.config";
import {
  AUTH_MAIL_JOB_OPTIONS,
  AUTH_MAIL_QUEUE,
  AuthMailJob,
} from "./auth-mail.queue";
import type { AuthEmailLocale, AuthEmailMessage } from "./auth-mail.templates";

const DEFAULT_OFFICE_NAME = "Law";
/**
 * BullMQ keeps commands in an offline queue during a Redis outage, so
 * `queue.add` can hang instead of failing. Never block the auth response on it.
 */
const ENQUEUE_TIMEOUT_MS = 3000;

class EnqueueTimeoutError extends Error {
  override name = "EnqueueTimeoutError";
}

/**
 * Producer for the `auth-mail` queue. Delivery is best effort: failures here
 * are logged (never with links or tokens) and never reach the caller, so
 * public auth responses do not depend on mail delivery.
 */
@Injectable()
export class AuthMailService {
  private readonly logger = new Logger(AuthMailService.name);

  constructor(
    private readonly config: AuthRuntimeConfig,
    private readonly prisma: PrismaService,
    @InjectQueue(AUTH_MAIL_QUEUE) private readonly queue: Queue<AuthMailJob>,
  ) {}

  /** Invitations go to people without settings yet, so they are Serbian. */
  async sendInvitation(email: string, token: string): Promise<void> {
    await this.enqueue(
      email,
      null,
      { template: "invitation", link: this.link("accept-invitation", token) },
      "SR",
    );
  }

  async sendPasswordReset(
    user: { id: string; email: string },
    token: string,
  ): Promise<void> {
    await this.enqueue(user.email, user.id, {
      template: "passwordReset",
      link: this.link("reset-password", token),
    });
  }

  async sendPasswordChanged(
    user: { id: string; email: string },
    changedAt: Date,
  ): Promise<void> {
    await this.enqueue(user.email, user.id, {
      template: "passwordChanged",
      changedAt: changedAt.toISOString(),
    });
  }

  async enqueue(
    to: string,
    userId: string | null,
    message: AuthEmailMessage,
    localeOverride?: AuthEmailLocale,
  ): Promise<void> {
    try {
      const [locale, officeName] = await Promise.all([
        localeOverride ?? this.userLocale(userId),
        this.officeName(),
      ]);
      await this.withTimeout(
        this.queue.add(
          "send",
          { to, userId, locale, officeName, message },
          AUTH_MAIL_JOB_OPTIONS,
        ),
      );
    } catch (error) {
      this.logger.warn(
        `Unable to enqueue auth email (template ${message.template}, user ${userId ?? "none"}): ${
          error instanceof Error ? error.name : "unknown error"
        }`,
      );
    }
  }

  private withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new EnqueueTimeoutError()),
        ENQUEUE_TIMEOUT_MS,
      );
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  private async userLocale(userId: string | null): Promise<AuthEmailLocale> {
    if (!userId) return "SR";
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
      select: { language: true },
    });
    return settings?.language === "EN" ? "EN" : "SR";
  }

  private async officeName(): Promise<string> {
    const settings = await this.prisma.organizationSettings.findUnique({
      where: { workspaceId: HARDCODED_WORKSPACE_ID },
      select: { displayName: true, legalName: true },
    });
    return settings?.displayName || settings?.legalName || DEFAULT_OFFICE_NAME;
  }

  private link(path: string, token: string): string {
    return `${this.config.frontendOrigin}/${path}?token=${encodeURIComponent(token)}`;
  }
}
