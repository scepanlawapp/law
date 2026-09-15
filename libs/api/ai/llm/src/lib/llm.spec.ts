import { z } from "zod";
import { FakeChatModelProvider, OpenRouterChatModelProvider } from "./llm";

describe("FakeChatModelProvider", () => {
  it("parses structured output with the provided schema", async () => {
    const schema = z.object({
      decision: z.enum(["LEGAL", "NON_LEGAL", "UNCLEAR"]),
    });
    const provider = new FakeChatModelProvider({ decision: "LEGAL" });

    await expect(
      provider.completeStructured({
        schema,
        messages: [{ role: "user", content: "tužba" }],
      }),
    ).resolves.toEqual({ decision: "LEGAL" });
  });

  it("streams deterministic text chunks", async () => {
    const provider = new FakeChatModelProvider({
      stream: ["Pravni ", "odgovor"],
    });
    const chunks: string[] = [];

    for await (const chunk of provider.streamText({
      messages: [{ role: "user", content: "Pitanje" }],
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["Pravni ", "odgovor"]);
  });
});

describe("OpenRouterChatModelProvider streaming", () => {
  afterEach(() => jest.restoreAllMocks());

  const provider = () =>
    new OpenRouterChatModelProvider({
      apiKey: "test-key",
      baseUrl: "https://openrouter.test/api/v1",
      model: "test-model",
    });

  async function collect(stream: AsyncIterable<string>): Promise<string[]> {
    const chunks: string[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    return chunks;
  }

  it("parses SSE events split across response chunks", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode('data: {"choices":[{"delta":{"content":"Pravni '),
        );
        controller.enqueue(
          encoder.encode('odgovor"}}]}\n\ndata: [DONE]\n\n'),
        );
        controller.close();
      },
    });
    jest.spyOn(global, "fetch").mockResolvedValue(new Response(body));

    await expect(
      collect(
        provider().streamText({
          messages: [{ role: "user", content: "Pitanje" }],
        }),
      ),
    ).resolves.toEqual(["Pravni odgovor"]);
  });

  it("rejects malformed SSE JSON", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: {invalid}\n\n"));
        controller.close();
      },
    });
    jest.spyOn(global, "fetch").mockResolvedValue(new Response(body));

    await expect(
      collect(
        provider().streamText({
          messages: [{ role: "user", content: "Pitanje" }],
        }),
      ),
    ).rejects.toBeInstanceOf(SyntaxError);
  });

  it("includes provider details for failed requests", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response("rate limited", { status: 429 }));

    await expect(
      collect(
        provider().streamText({
          messages: [{ role: "user", content: "Pitanje" }],
        }),
      ),
    ).rejects.toThrow("OpenRouter request failed (429): rate limited");
  });
});
