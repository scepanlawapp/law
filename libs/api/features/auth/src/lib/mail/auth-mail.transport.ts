import type { Provider } from "@nestjs/common";
import nodemailer, { Transporter } from "nodemailer";
import { AuthRuntimeConfig } from "../auth.config";

export const AUTH_MAIL_TRANSPORT = Symbol("AUTH_MAIL_TRANSPORT");

export const authMailTransportProvider: Provider = {
  provide: AUTH_MAIL_TRANSPORT,
  inject: [AuthRuntimeConfig],
  useFactory: (config: AuthRuntimeConfig): Transporter =>
    nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: config.smtpUser
        ? { user: config.smtpUser, pass: config.smtpPassword }
        : undefined,
    }),
};
