import { FakeChatModelProvider } from "@law/llm";
import {
  buildConversationSummaryPrompt,
  CONVERSATION_SUMMARY_MAX_CHARS,
  summarizeConversation,
} from "./conversation-summary";

describe("conversation summary", () => {
  it("renders the previous summary and the messages oldest first", () => {
    const prompt = buildConversationSummaryPrompt({
      previousSummary: "- Tužilac: Petar Petrović",
      messages: [
        { role: "user", content: "Tuženi je Alfa d.o.o." },
        { role: "assistant", content: "Razumem." },
      ],
    });

    expect(prompt).toContain("- Tužilac: Petar Petrović");
    expect(prompt.indexOf("Korisnik: Tuženi je Alfa d.o.o.")).toBeLessThan(
      prompt.indexOf("Asistent: Razumem."),
    );
  });

  it("marks a missing previous summary", () => {
    expect(
      buildConversationSummaryPrompt({ previousSummary: null, messages: [] }),
    ).toContain("(nema)");
  });

  it("clips very long messages", () => {
    const prompt = buildConversationSummaryPrompt({
      previousSummary: null,
      messages: [{ role: "user", content: "a".repeat(5_000) }],
    });

    expect(prompt).toContain(`${"a".repeat(3_000)}…`);
    expect(prompt).not.toContain("a".repeat(3_001));
  });

  it("returns the model's summary, capped in length", async () => {
    const provider = new FakeChatModelProvider({
      summary: "x".repeat(CONVERSATION_SUMMARY_MAX_CHARS + 50),
    });

    const summary = await summarizeConversation(provider, {
      previousSummary: null,
      messages: [{ role: "user", content: "Činjenica" }],
    });

    expect(summary).toHaveLength(CONVERSATION_SUMMARY_MAX_CHARS);
  });

  it("rejects an empty summary", async () => {
    await expect(
      summarizeConversation(new FakeChatModelProvider({ summary: " " }), {
        previousSummary: null,
        messages: [],
      }),
    ).rejects.toThrow();
  });
});
