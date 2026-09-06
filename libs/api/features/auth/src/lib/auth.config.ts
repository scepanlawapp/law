import { Injectable } from "@nestjs/common";

@Injectable()
export class AuthRuntimeConfig {
  readonly frontendOrigin = process.env.AUTH_FRONTEND_ORIGIN ?? "http://localhost:4200";
  readonly production = process.env.NODE_ENV === "production";
  readonly smtpHost = process.env.SMTP_HOST ?? "localhost";
  readonly smtpPort = Number(process.env.SMTP_PORT ?? 1025);
  readonly smtpSecure = process.env.SMTP_SECURE === "true";
  readonly smtpUser = process.env.SMTP_USER;
  readonly smtpPassword = process.env.SMTP_PASSWORD;
  readonly smtpFrom = process.env.SMTP_FROM ?? "no-reply@law.local";
}