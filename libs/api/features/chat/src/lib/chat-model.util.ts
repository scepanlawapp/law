import { BadRequestException } from "@nestjs/common";
import { ChatModelProvider, OpenRouterChatModelProvider } from "@law/llm";
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
  return new OpenRouterChatModelProvider({
    apiKey: config.openRouterApiKey,
    baseUrl: config.openRouterBaseUrl,
    model: config.openRouterModel,
  });
}
