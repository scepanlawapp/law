import { Inject, Injectable, Logger } from "@nestjs/common";
import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import type { Transporter } from "nodemailer";
import { PrismaService } from "@law/core";
import { AuthRuntimeConfig } from "../auth.config";
import { AUTH_MAIL_QUEUE, AuthMailJob } from "./auth-mail.queue";
import { renderAuthEmail } from "./auth-mail.templates";
import { AUTH_MAIL_TRANSPORT } from "./auth-mail.transport";

/**
 * BullMQ consumer for `auth-mail`. A thrown send error is retried with
 * backoff; once attempts are exhausted an audit row records the failure
 * (template only, never the link or token).
 */
@Injectable()
@Processor(AUTH_MAIL_QUEUE)
export class AuthMailProcessor extends WorkerHost {
  private readonly logger = new Logger(AuthMailProcessor.name);

  constructor(
    private readonly config: AuthRuntimeConfig,
    @Inject(AUTH_MAIL_TRANSPORT) private readonly transport: Transporter,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<AuthMailJob>): Promise<void> {
    const { to, locale, officeName, message } = job.data;
    const { subject, html, text } = renderAuthEmail(message, {
      locale,
      officeName,
    });
    await this.transport.sendMail({
      from: this.config.smtpFrom,
      to,
      subject,
      html,
      text,
    });
  }

  @OnWorkerEvent("failed")
  async onFailed(
    job: Job<AuthMailJob> | undefined,
    error?: Error,
  ): Promise<void> {
    if (!job) return;
    const attemptsMade = job.attemptsMade ?? 0;
    const maxAttempts = job.opts?.attempts ?? 1;
    if (attemptsMade < maxAttempts) return; // BullMQ will retry

    const { template } = job.data.message;
    this.logger.warn(
      `Auth email (template ${template}, user ${job.data.userId ?? "none"}) failed after ${attemptsMade} attempts: ${error?.name ?? "unknown error"}`,
    );
    try {
      await this.prisma.auditEvent.create({
        data: {
          eventType: "EMAIL_DELIVERY_FAILED",
          outcome: "FAILURE",
          userId: job.data.userId,
          metadata: { template },
        },
      });
    } catch {
      this.logger.error(
        `Failed to record auth email delivery failure for template ${template}`,
      );
    }
  }
}
