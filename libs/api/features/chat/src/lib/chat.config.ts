import { Injectable } from "@nestjs/common";

export const CHAT_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

@Injectable()
export class ChatRuntimeConfig {
  readonly production = process.env.NODE_ENV === "production";
  readonly openRouterApiKey = process.env.OPENROUTER_API_KEY ?? "";
  readonly openRouterBaseUrl =
    process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
  readonly openRouterModel =
    process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";
  readonly uploadDir = process.env.CHAT_UPLOAD_DIR ?? "./tmp/chat-uploads";
  readonly uploadMaxBytes = Number(process.env.UPLOAD_MAX_BYTES ?? 25_000_000);
  readonly maxFilesPerMessage = Number(
    process.env.CHAT_MAX_FILES_PER_MESSAGE ?? 5,
  );
  readonly allowedMimeTypes = CHAT_ALLOWED_MIME_TYPES;
  readonly extractionTextMaxChars = Number(
    process.env.CHAT_EXTRACTION_TEXT_MAX_CHARS ?? 50_000,
  );
  readonly briefPerDocMaxChars = Number(
    process.env.BRIEF_PER_DOC_MAX_CHARS ?? 15_000,
  );
  readonly briefTotalMaxChars = Number(
    process.env.BRIEF_TOTAL_MAX_CHARS ?? 60_000,
  );
}
