import { FakeChatModelProvider, OpenRouterChatModelProvider } from "@law/llm";
import { MastraChatModelProvider } from "@law/mastra";
import { ChatRuntimeConfig, resolveChatModelProvider } from "@law/chat";

function config(overrides: Partial<ChatRuntimeConfig>): ChatRuntimeConfig {
  return Object.assign(new ChatRuntimeConfig(), {
    openRouterApiKey: "test-key",
    ...overrides,
  });
}

describe("resolveChatModelProvider", () => {
  it("prefers an injected provider", () => {
    const injected = new FakeChatModelProvider({});
    expect(
      resolveChatModelProvider(config({ llmBackend: "mastra" }), injected),
    ).toBe(injected);
  });

  it("uses the legacy OpenRouter client by default", () => {
    expect(
      resolveChatModelProvider(config({ llmBackend: "legacy" })),
    ).toBeInstanceOf(OpenRouterChatModelProvider);
  });

  it("uses the Mastra model layer when LLM_BACKEND=mastra", () => {
    expect(
      resolveChatModelProvider(config({ llmBackend: "mastra" })),
    ).toBeInstanceOf(MastraChatModelProvider);
  });

  it("requires an OpenRouter API key for either backend", () => {
    expect(() =>
      resolveChatModelProvider(
        config({ llmBackend: "mastra", openRouterApiKey: "" }),
      ),
    ).toThrow("OPENROUTER_API_KEY");
  });
});
