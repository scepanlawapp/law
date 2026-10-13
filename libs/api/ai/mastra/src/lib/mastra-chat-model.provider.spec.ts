import { createMockModel } from "@mastra/core/test-utils/llm-mock";
import { z } from "zod";
import { MastraChatModelProvider } from "./mastra-chat-model.provider";
import { openRouterModel, toModelRouterId } from "./model-config";

const briefLikeSchema = z.object({
  title: z.string().min(1),
  warnings: z.array(z.string()).default([]),
});

function promptText(prompt: unknown): string {
  return JSON.stringify(prompt);
}

describe("model-config", () => {
  it("prefixes OpenRouter model ids for the Mastra model router", () => {
    expect(toModelRouterId("openai/gpt-4o-mini")).toBe(
      "openrouter/openai/gpt-4o-mini",
    );
    expect(toModelRouterId(" openrouter/auto ")).toBe(
      "openrouter/openrouter/auto",
    );
  });

  it("rejects an empty model id", () => {
    expect(() => toModelRouterId("  ")).toThrow();
  });

  it("builds an OpenAI-compatible config pinned to the OpenRouter endpoint", () => {
    expect(
      openRouterModel({
        apiKey: "key",
        model: "openai/gpt-4o-mini",
        baseUrl: "https://openrouter.ai/api/v1/",
      }),
    ).toEqual({
      id: "openrouter/openai/gpt-4o-mini",
      apiKey: "key",
      url: "https://openrouter.ai/api/v1",
    });
  });
});

describe("MastraChatModelProvider", () => {
  it("does not log structured output when logging is explicitly disabled", async () => {
    const error = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const warn = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    try {
      const provider = new MastraChatModelProvider(
        createMockModel({ version: "v2", mockText: { title: "" } }) as never,
        { disableLogging: true },
      );
      await expect(
        provider.completeStructured({
          schema: briefLikeSchema,
          messages: [{ role: "user", content: "Confidential pricing request" }],
        }),
      ).rejects.toThrow();
      expect(error).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
      warn.mockRestore();
    }
  });
  it("returns a structured result parsed with the caller's schema", async () => {
    const provider = new MastraChatModelProvider(
      createMockModel({ version: "v2", mockText: { title: "Tužba" } }) as never,
    );

    await expect(
      provider.completeStructured({
        schema: briefLikeSchema,
        messages: [
          { role: "system", content: "Odgovori JSON-om." },
          { role: "user", content: "Tužba za naknadu štete" },
        ],
      }),
    ).resolves.toEqual({ title: "Tužba", warnings: [] });
  });

  it("rejects when the model output does not match the schema", async () => {
    const provider = new MastraChatModelProvider(
      createMockModel({ version: "v2", mockText: { title: "" } }) as never,
    );

    await expect(
      provider.completeStructured({
        schema: briefLikeSchema,
        messages: [{ role: "user", content: "x" }],
      }),
    ).rejects.toThrow();
  });

  it("sends system messages as instructions and keeps the conversation", async () => {
    const calls: unknown[] = [];
    const provider = new MastraChatModelProvider(
      createMockModel({
        version: "v2",
        mockText: "ok",
        spyStream: (props: { prompt: unknown }) => calls.push(props.prompt),
      }) as never,
    );

    const chunks: string[] = [];
    for await (const chunk of provider.streamText({
      messages: [
        { role: "system", content: "Ti si pravni asistent." },
        { role: "user", content: "Prvo pitanje" },
        { role: "assistant", content: "Prvi odgovor" },
        { role: "user", content: "Drugo pitanje" },
      ],
    })) {
      chunks.push(chunk);
    }

    expect(chunks.join("")).toBe("ok");
    const prompt = promptText(calls[0]);
    expect(prompt).toContain("Ti si pravni asistent.");
    expect(prompt).toContain("Prvi odgovor");
    expect(prompt).toContain("Drugo pitanje");
  });
});
