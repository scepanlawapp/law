import { FakeChatModelProvider } from "@law/llm";
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
    expect(resolveChatModelProvider(config({}), injected)).toBe(injected);
  });

  it("uses the Mastra model layer", () => {
    expect(resolveChatModelProvider(config({}))).toBeInstanceOf(
      MastraChatModelProvider,
    );
  });

  it("requires an OpenRouter API key", () => {
    expect(() =>
      resolveChatModelProvider(config({ openRouterApiKey: "" })),
    ).toThrow("OPENROUTER_API_KEY");
  });
});
