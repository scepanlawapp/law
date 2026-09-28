import { FakeChatModelProvider } from "@law/llm";
import {
  assistantReplyFor,
  buildTriageMessages,
  buildTriageUserPrompt,
  PORTIR_FOLLOW_UP_RULE,
  PORTIR_PRACTICE_RULE,
  PORTIR_SYSTEM_PROMPT,
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

  describe("conversation history", () => {
    it("keeps the original prompt when there is no history", () => {
      const [system, user] = buildTriageMessages({ userText: "Tužba" });

      expect(system.content).toBe(PORTIR_SYSTEM_PROMPT);
      expect(user.content).not.toContain("Previous conversation");
    });

    it("adds the follow-up rule and earlier turns when history is present", () => {
      const [system, user] = buildTriageMessages({
        userText: "A kraće?",
        history: [
          { role: "user", content: "Koji je rok zastarelosti potraživanja?" },
          { role: "assistant", content: "Opšti rok je deset godina." },
        ],
      });

      expect(system.content).toContain(PORTIR_FOLLOW_UP_RULE);
      expect(user.content).toContain(
        "User: Koji je rok zastarelosti potraživanja?",
      );
      expect(user.content).toContain("Assistant: Opšti rok je deset godina.");
      expect(user.content.indexOf("Previous conversation")).toBeLessThan(
        user.content.indexOf("User message:\nA kraće?"),
      );
    });

    it("accepts practice-management requests only when the agent can act", () => {
      const [legacy] = buildTriageMessages({
        userText: "Postavi rok za 15. oktobar.",
      });
      const [agent] = buildTriageMessages({
        userText: "Postavi rok za 15. oktobar.",
        practiceActions: true,
      });

      expect(legacy.content).not.toContain(PORTIR_PRACTICE_RULE);
      expect(agent.content).toContain(PORTIR_PRACTICE_RULE);
    });

    it("covers office read queries such as the chat starter prompts", () => {
      const [agent] = buildTriageMessages({
        userText: "Koji moji rokovi ističu u naredna 48 sati?",
        practiceActions: true,
      });

      for (const term of [
        "tasks (zadaci)",
        "deadlines (rokovi)",
        "hearings (ročišta)",
        "agenda or schedule",
        "clients",
        "recent activity",
        "'moji zadaci'",
      ]) {
        expect(agent.content).toContain(term);
      }
    });

    it("clips long history entries", () => {
      const prompt = buildTriageUserPrompt({
        userText: "Dalje?",
        history: [{ role: "assistant", content: "a".repeat(2000) }],
      });

      expect(prompt).toContain(`${"a".repeat(600)}…`);
      expect(prompt).not.toContain("a".repeat(601));
    });
  });
});
