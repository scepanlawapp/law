import { Injectable, Logger } from "@nestjs/common";
import nodemailer, { Transporter } from "nodemailer";
import { AuthRuntimeConfig } from "./auth.config";

@Injectable()
export class AuthMailService {
  private readonly logger = new Logger(AuthMailService.name);
  private readonly transporter: Transporter;

  constructor(private readonly config: AuthRuntimeConfig) {
    this.transporter = nodemailer.createTransport({
      host: this.config.smtpHost,
      port: this.config.smtpPort,
      secure: this.config.smtpSecure,
      auth: this.config.smtpUser
        ? { user: this.config.smtpUser, pass: this.config.smtpPassword }
        : undefined,
    });
  }

  async sendInvitation(email: string, token: string): Promise<void> {
    await this.send(
      email,
      "You are invited to Law workspace",
      `Accept your invitation: ${this.frontendUrl()}/accept-invitation?token=${encodeURIComponent(token)}`,
    );
  }

  async sendPasswordReset(email: string, token: string): Promise<void> {
    await this.send(
      email,
      "Reset your Law workspace password",
      `Reset your password: ${this.frontendUrl()}/reset-password?token=${encodeURIComponent(token)}`,
    );
  }

  private async send(to: string, subject: string, text: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.config.smtpFrom,
        to,
        subject,
        text,
      });
    } catch {
      this.logger.warn(`Unable to deliver auth email to ${to}`);
    }
  }

  private frontendUrl(): string {
    return this.config.frontendOrigin;
  }
}
