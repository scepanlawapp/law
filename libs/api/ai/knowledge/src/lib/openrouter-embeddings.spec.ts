import { OpenRouterEmbeddingProvider } from "./openrouter-embeddings";

describe("OpenRouterEmbeddingProvider", () => {
  afterEach(() => jest.restoreAllMocks());

  it("returns ordered vectors and validates the configured dimension", async () => {
    const vector = Array.from({ length: 1024 }, (_, index) => index / 1024);
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { index: 1, embedding: vector },
            { index: 0, embedding: vector },
          ],
        }),
      ),
    );

    const provider = new OpenRouterEmbeddingProvider({
      apiKey: "test-key",
      baseUrl: "https://openrouter.test/api/v1",
    });
    await expect(provider.embed(["prvi", "drugi"])).resolves.toEqual([
      vector,
      vector,
    ]);
  });

  it("fails when the provider returns a wrong vector dimension", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ data: [{ index: 0, embedding: [1, 2] }] }),
        ),
      );

    const provider = new OpenRouterEmbeddingProvider({
      apiKey: "test-key",
      baseUrl: "https://openrouter.test/api/v1",
    });
    await expect(provider.embed(["tekst"])).rejects.toThrow("expected 1024");
  });
});
