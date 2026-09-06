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
});
