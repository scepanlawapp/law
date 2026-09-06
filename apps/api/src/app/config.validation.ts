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

export function validateEnvironment(
  environment: Record<string, unknown>,
): Record<string, unknown> {
  const nodeEnv = String(environment.NODE_ENV ?? "development");
  const origin = String(
    environment.AUTH_FRONTEND_ORIGIN ?? "http://localhost:4200",
  );
  try {
    new URL(origin);
  } catch {
    throw new Error("AUTH_FRONTEND_ORIGIN must be a valid URL");
  }
  if (
    nodeEnv === "production" &&
    (!environment.SMTP_HOST || !environment.SMTP_FROM)
  ) {
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
  if (nodeEnv === "production" && !environment.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is required in production");
  }
  const openRouterBaseUrl = String(
    environment.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
  );
  try {
    new URL(openRouterBaseUrl);
  } catch {
    throw new Error("OPENROUTER_BASE_URL must be a valid URL");
  }
  const uploadMaxBytes = Number(environment.UPLOAD_MAX_BYTES ?? 25_000_000);
  if (!Number.isInteger(uploadMaxBytes) || uploadMaxBytes < 1) {
    throw new Error("UPLOAD_MAX_BYTES must be a positive integer");
  }
  const maxFiles = Number(environment.CHAT_MAX_FILES_PER_MESSAGE ?? 5);
  if (!Number.isInteger(maxFiles) || maxFiles < 1 || maxFiles > 20) {
    throw new Error(
      "CHAT_MAX_FILES_PER_MESSAGE must be an integer between 1 and 20",
    );
  }
  return {
    ...environment,
    NODE_ENV: nodeEnv,
    PORT: port,
    SMTP_PORT: smtpPort,
    AUTH_FRONTEND_ORIGIN: origin,
    OPENROUTER_BASE_URL: openRouterBaseUrl,
    OPENROUTER_MODEL: String(
      environment.OPENROUTER_MODEL ?? "openai/gpt-4o-mini",
    ),
    CHAT_UPLOAD_DIR: String(
      environment.CHAT_UPLOAD_DIR ?? "./tmp/chat-uploads",
    ),
    UPLOAD_MAX_BYTES: uploadMaxBytes,
    CHAT_MAX_FILES_PER_MESSAGE: maxFiles,
  };
}

export function frontendOrigin(config: ConfigService): string {
  return requiredUrl(config, "AUTH_FRONTEND_ORIGIN");
}
