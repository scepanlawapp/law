import { ConfigService } from "@nestjs/config";

function requiredUrl(config: ConfigService, key: string): string {
  const value = config.get<string>(key);
  if (!value) throw new Error(`${key} is required`);
  try {
    new URL(value);
  } catch {
    throw new Error(`${key} must be a valid URL`);
  }
  return value;
}

export function validateEnvironment(environment: Record<string, unknown>): Record<string, unknown> {
  const nodeEnv = String(environment.NODE_ENV ?? "development");
  const origin = String(environment.AUTH_FRONTEND_ORIGIN ?? "http://localhost:4200");
  try {
    new URL(origin);
  } catch {
    throw new Error("AUTH_FRONTEND_ORIGIN must be a valid URL");
  }
  if (nodeEnv === "production" && (!environment.SMTP_HOST || !environment.SMTP_FROM)) {
    throw new Error("SMTP_HOST and SMTP_FROM are required in production");
  }
  const port = Number(environment.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  const smtpPort = Number(environment.SMTP_PORT ?? 1025);
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
    throw new Error("SMTP_PORT must be an integer between 1 and 65535");
  }
  return {
    ...environment,
    NODE_ENV: nodeEnv,
    PORT: port,
    SMTP_PORT: smtpPort,
    AUTH_FRONTEND_ORIGIN: origin,
  };
}

export function frontendOrigin(config: ConfigService): string {
  return requiredUrl(config, "AUTH_FRONTEND_ORIGIN");
}