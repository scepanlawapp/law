import { BadRequestException } from "@nestjs/common";
import { ChatModelProvider } from "@law/llm";
import { MastraChatModelProvider, openRouterModel } from "@law/mastra";
import { ChatRuntimeConfig } from "./chat.config";

/**
 * Structured/streamed model calls outside the agent (Portir triage, titles,
 * drafting workflows, conversation summaries) run on Mastra's model layer.
 */
export function resolveChatModelProvider(
  config: ChatRuntimeConfig,
  injected?: ChatModelProvider,
): ChatModelProvider {
  if (injected) return injected;
  if (!config.openRouterApiKey) {
    throw new BadRequestException(
      "OPENROUTER_API_KEY is not configured for the assistant",
    );
  }
  return new MastraChatModelProvider(
    openRouterModel({
      apiKey: config.openRouterApiKey,
      baseUrl: config.openRouterBaseUrl,
      model: config.openRouterModel,
    }),
  );
}
