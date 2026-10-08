import type { Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OpenRouterEmbeddingProvider } from "@law/knowledge";
import type { ChatModelProvider } from "@law/llm";
import { MastraChatModelProvider, openRouterModel } from "@law/mastra";

export const DOCUMENT_EMBEDDING_PROVIDER = Symbol(
  "DOCUMENT_EMBEDDING_PROVIDER",
);
export const DOCUMENT_MODEL_PROVIDER = Symbol("DOCUMENT_MODEL_PROVIDER");

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

/** Same model and dimensions as the legal-source embeddings. */
export const documentEmbeddingProvider: Provider = {
  provide: DOCUMENT_EMBEDDING_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService) =>
    new OpenRouterEmbeddingProvider({
      apiKey: config.get<string>("OPENROUTER_API_KEY", ""),
      baseUrl: config.get<string>("OPENROUTER_BASE_URL", DEFAULT_BASE_URL),
      model: config.get<string>("LEGAL_EMBEDDING_MODEL", "BAAI/bge-m3"),
    }),
};

/**
 * Structured calls for classification and fact extraction. Without an API key
 * the provider throws on use, which the pipeline treats as a best-effort
 * failure; the API still boots.
 */
export const documentModelProvider: Provider = {
  provide: DOCUMENT_MODEL_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService): ChatModelProvider => {
    const apiKey = config.get<string>("OPENROUTER_API_KEY", "");
    if (!apiKey) {
      const unavailable = (): never => {
        throw new Error("OPENROUTER_API_KEY is not configured");
      };
      return {
        completeStructured: async () => unavailable(),
        streamText: () => unavailable(),
      };
    }
    return new MastraChatModelProvider(
      openRouterModel({
        apiKey,
        baseUrl: config.get<string>("OPENROUTER_BASE_URL", DEFAULT_BASE_URL),
        model: config.get<string>("OPENROUTER_MODEL", "openai/gpt-4o-mini"),
      }),
    );
  },
};
