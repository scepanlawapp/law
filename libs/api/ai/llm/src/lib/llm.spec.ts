import { z } from "zod";
import { FakeChatModelProvider } from "./llm";

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
