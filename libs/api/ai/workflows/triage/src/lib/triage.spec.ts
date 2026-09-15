import { FakeChatModelProvider } from "@law/llm";
import {
  assistantReplyFor,
  buildTriageUserPrompt,
  classifyTriage,
  triageDecisionSchema,
} from "./triage";

describe("triage", () => {
  it("classifies a legal request", async () => {
    const provider = new FakeChatModelProvider({
      decision: "LEGAL",
      reason: "Damage compensation lawsuit",
    });

    await expect(
      classifyTriage(provider, { userText: "Tužba za naknadu štete" }),
    ).resolves.toEqual({
      decision: "LEGAL",
      reason: "Damage compensation lawsuit",
      intent: "DRAFT",
      language: "sr",
    });
  });

  it("routes a legal question to answering in the user's language", async () => {
    const provider = new FakeChatModelProvider({
      decision: "LEGAL",
      reason: "Legal guidance requested",
      intent: "ANSWER",
      language: "en",
    });

    await expect(
      classifyTriage(provider, { userText: "What is the limitation period?" }),
    ).resolves.toMatchObject({ intent: "ANSWER", language: "en" });
  });

  it("classifies a non-legal request", async () => {
    const provider = new FakeChatModelProvider({
      decision: "NON_LEGAL",
      reason: "Weather question",
    });

    const result = await classifyTriage(provider, {
      userText: "What's the weather?",
    });
    expect(result.decision).toBe("NON_LEGAL");
    expect(assistantReplyFor(result)).toContain("nije pravni zahtev");
  });

  it("asks a clarifying question when unclear", async () => {
    const result = triageDecisionSchema.parse({
      decision: "UNCLEAR",
      reason: "Too vague",
    });
    expect(assistantReplyFor(result)).toContain("preciznije opišete");
  });

  it("includes attachment metadata in the prompt, not file bytes", () => {
    const prompt = buildTriageUserPrompt({
      userText: "Prilog uz tužbu",
      attachments: [
        {
          originalName: "ugovor.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1200,
        },
      ],
    });

    expect(prompt).toContain("ugovor.pdf");
    expect(prompt).toContain("application/pdf");
    expect(prompt).not.toContain("%PDF");
  });
});
