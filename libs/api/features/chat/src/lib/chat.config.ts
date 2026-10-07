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
  /** Model for the legalAssistant agent; defaults to OPENROUTER_MODEL. */
  readonly assistantModel =
    process.env.ASSISTANT_MODEL?.trim() || this.openRouterModel;
  /** Opt-in Mastra tracing into the `mastra` Postgres schema. */
  readonly mastraTracing = process.env.MASTRA_TRACING === "true";
  readonly databaseUrl = process.env.DATABASE_URL ?? "";
  readonly assistantHistoryMaxMessages = Number(
    process.env.ASSISTANT_HISTORY_MAX_MESSAGES ?? 20,
  );
  readonly assistantHistoryMaxChars = Number(
    process.env.ASSISTANT_HISTORY_MAX_CHARS ?? 24_000,
  );
  /** Summarize once unsummarized messages exceed 80% of the history window. */
  get assistantSummaryTriggerMessages(): number {
    return Math.max(2, Math.floor(this.assistantHistoryMaxMessages * 0.8));
  }
  /** Messages kept verbatim after summarizing (40% of the window). */
  get assistantSummaryKeepRecent(): number {
    return Math.max(1, Math.floor(this.assistantHistoryMaxMessages * 0.4));
  }
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
  readonly draftingPromptMaxChars = Number(
    process.env.DRAFTING_PROMPT_MAX_CHARS ?? 40_000,
  );
  /** Contract text plus legal sources sent to one contract review call. */
  readonly contractReviewMaxChars = Number(
    process.env.CONTRACT_REVIEW_MAX_CHARS ?? 60_000,
  );
  readonly titleContentMaxChars = Number(
    process.env.TITLE_CONTENT_MAX_CHARS ?? 300,
  );
  readonly redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
  readonly workflowQueueAttempts = Number(
    process.env.WORKFLOW_QUEUE_ATTEMPTS ?? 3,
  );
}
