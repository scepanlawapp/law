import { BadRequestException } from "@nestjs/common";
import { ChatModelProvider, OpenRouterChatModelProvider } from "@law/llm";
import { MastraChatModelProvider, openRouterModel } from "@law/mastra";
import { ChatRuntimeConfig } from "./chat.config";

/** Shared by ChatService (title generation) and WorkflowProcessor (triage/brief/drafting). */
export function resolveChatModelProvider(
  config: ChatRuntimeConfig,
  injected?: ChatModelProvider,
): ChatModelProvider {
  if (injected) return injected;
  if (!config.openRouterApiKey) {
    throw new BadRequestException(
      "OPENROUTER_API_KEY is not configured for Portir",
    );
  }
  const options = {
    apiKey: config.openRouterApiKey,
    baseUrl: config.openRouterBaseUrl,
    model: config.openRouterModel,
  };
  return config.llmBackend === "mastra"
    ? new MastraChatModelProvider(openRouterModel(options))
    : new OpenRouterChatModelProvider(options);
}
