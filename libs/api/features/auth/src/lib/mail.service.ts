import { Injectable, Logger } from "@nestjs/common";
import nodemailer, { Transporter } from "nodemailer";

@Injectable()
export class AuthMailService {
  private readonly logger = new Logger(AuthMailService.name);
  private readonly transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? "localhost",
      port: Number(process.env.SMTP_PORT ?? 1025),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
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
        from: process.env.SMTP_FROM ?? "no-reply@law.local",
        to,
        subject,
        text,
      });
    } catch {
      this.logger.warn(`Unable to deliver auth email to ${to}`);
    }
  }

  private frontendUrl(): string {
    return process.env.AUTH_FRONTEND_ORIGIN ?? "http://localhost:4200";
  }
}
