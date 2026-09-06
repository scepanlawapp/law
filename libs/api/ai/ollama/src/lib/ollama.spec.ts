import type { OllamaClient } from "./ollama";

describe("OllamaClient", () => {
  it("can represent a JSON generation client", () => {
    const client: OllamaClient = {
      generate: async () => ({ response: "{}" }),
    };

    expect(client).toBeDefined();
  });
});
