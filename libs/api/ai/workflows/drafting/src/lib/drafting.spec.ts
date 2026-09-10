import { FakeChatModelProvider } from "@law/llm";
import type { BriefResult } from "@law/brief-extraction";
import { buildDraftingUserPrompt } from "./context";
import { runDraftingLlm } from "./runner";
import { draftResultSchema } from "./schema";

const fullBrief: BriefResult = {
  jobType: "lawsuit",
  plaintiff: { name: "Petar Petrović", address: "Knez Mihailova 1, Beograd" },
  defendant: { name: "Marko Marković", address: null },
  competentCourt: "Prvi osnovni sud u Beogradu",
  claimValue: "150.000 RSD",
  legalBasis: ["ZOO čl. 154"],
  factualDescription: "Tuženi nije isplatio naknadu štete.",
  evidence: ["ugovor.pdf"],
  reliefSought: "Isplata naknade štete u iznosu od 150.000 RSD.",
  missingFields: ["defendant.address"],
  confidence: 0.8,
  warnings: [],
};

const fullDraft = {
  documentText: "PRVI OSNOVNI SUD U BEOGRADU\n\nTUŽBA...",
  warnings: ["Adresa tuženog nije poznata."],
};

describe("draftResultSchema", () => {
  it("parses a fully populated draft", () => {
    expect(draftResultSchema.parse(fullDraft)).toEqual(fullDraft);
  });

  it("defaults warnings to an empty array", () => {
    const parsed = draftResultSchema.parse({ documentText: "Tekst nacrta" });
    expect(parsed.warnings).toEqual([]);
  });
});

describe("buildDraftingUserPrompt", () => {
  it("includes the serialized brief fields", () => {
    const result = buildDraftingUserPrompt(fullBrief, 10_000);

    expect(result.prompt).toContain("Petar Petrović");
    expect(result.prompt).toContain("Prvi osnovni sud u Beogradu");
    expect(result.prompt).toContain("defendant.address");
    expect(result.truncated).toBe(false);
  });

  it("truncates when the serialized brief exceeds the budget", () => {
    const longBrief: BriefResult = {
      ...fullBrief,
      factualDescription: "a".repeat(500),
    };
    const result = buildDraftingUserPrompt(longBrief, 200);

    expect(result.truncated).toBe(true);
    expect(result.promptChars).toBeLessThanOrEqual(200);
  });

  it("includes the previous draft and reviewer note when revising", () => {
    const result = buildDraftingUserPrompt(fullBrief, 10_000, {
      previousDraft: "Prethodni tekst nacrta",
      reviewerNote: "Dodati obrazloženje pravnog osnova.",
    });

    expect(result.prompt).toContain("Prethodni tekst nacrta");
    expect(result.prompt).toContain("Dodati obrazloženje pravnog osnova.");
  });
});

describe("runDraftingLlm", () => {
  it("resolves a structured draft from the provider", async () => {
    const provider = new FakeChatModelProvider(fullDraft);

    await expect(
      runDraftingLlm(provider, "Izvučene činjenice:\n{}"),
    ).resolves.toEqual(fullDraft);
  });

  it("rejects when the provider returns an invalid shape", async () => {
    const provider = new FakeChatModelProvider({ warnings: [] });

    await expect(
      runDraftingLlm(provider, "Izvučene činjenice:\n{}"),
    ).rejects.toThrow();
  });
});
