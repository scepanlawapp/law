import { FakeChatModelProvider } from "@law/llm";
import type { GroundingSearchHit } from "@law/legal-grounding";
import {
  createContractReviewWorkflow,
  runContractReviewWorkflow,
} from "./contract-review.workflow";

const review = {
  summary: "Ugovor o radu na neodređeno vreme.",
  keyTerms: [{ label: "Zarada", value: "80.000 RSD", clause: "Član 5" }],
  issues: [
    {
      title: "Probni rad predug",
      category: "COMPLIANCE",
      risk: "HIGH",
      clause: "Član 4",
      quote: "probni rad od 9 meseci",
      explanation: "Duže od zakonskog maksimuma [1].",
      suggestion: "Skratiti probni rad.",
      citations: [1, 5],
    },
  ],
  missingClauses: [],
  warnings: [],
  usedCitations: [1],
};

function hit(id: string, article: string): GroundingSearchHit {
  return {
    id,
    text: "Probni rad može da traje najduže šest meseci.",
    score: 0.9,
    source: {
      title: "Zakon o radu",
      publisher: "Paragraf Lex",
      sourceUrl: "https://www.paragraf.rs/propisi/zakon_o_radu.html",
      jurisdiction: "RS",
    },
    articleNumber: article,
    paragraphNumber: null,
    pointNumber: null,
  };
}

const input = {
  contractType: "EMPLOYMENT_CONTRACT" as const,
  clientSide: "poslodavac",
  focus: null,
  documentTitle: "Ugovor o radu — Petar",
  text: "Član 4. Zaposleni se prima na probni rad od 9 meseci.",
  budget: { maxChars: 20_000 },
};

describe("contract-review workflow", () => {
  it("grounds on the checklist, reviews, and keeps only used citations", async () => {
    const provider = new FakeChatModelProvider([review]);
    const completeStructured = jest.spyOn(provider, "completeStructured");
    const search = jest
      .fn()
      .mockResolvedValueOnce([hit("chunk-36", "36")])
      .mockResolvedValue([hit("chunk-37", "37")]);

    const outcome = await runContractReviewWorkflow(
      createContractReviewWorkflow({ provider, search }),
      input,
    );

    expect(search).toHaveBeenCalledWith(
      "Zakon o radu, obavezni elementi ugovora o radu",
      expect.any(Number),
    );
    const [call] = completeStructured.mock.calls;
    expect(call[0].messages[0].content).toContain("„Ugovor o radu”");
    expect(call[0].messages[0].content).toContain(
      "Kancelarija zastupa: poslodavac",
    );
    expect(call[0].messages[1].content).toContain("probni rad od 9 meseci");
    expect(call[0].messages[1].content).toContain("Dostupni izvori");
    expect(outcome.result.issues[0].citations).toEqual([1]);
    expect(outcome.citations).toEqual([
      expect.objectContaining({ marker: 1, chunkId: "chunk-36" }),
    ]);
    expect(outcome.truncated).toBe(false);
  });

  it("still reviews when legal grounding fails", async () => {
    const outcome = await runContractReviewWorkflow(
      createContractReviewWorkflow({
        provider: new FakeChatModelProvider([review]),
        search: jest.fn().mockRejectedValue(new Error("pgvector down")),
      }),
      input,
    );
    expect(outcome.citations).toEqual([]);
    expect(outcome.result.issues[0].citations).toEqual([]);
  });

  it("surfaces invalid model output as an error", async () => {
    await expect(
      runContractReviewWorkflow(
        createContractReviewWorkflow({
          provider: new FakeChatModelProvider([{ issues: "none" }]),
          search: jest.fn().mockResolvedValue([]),
        }),
        input,
      ),
    ).rejects.toThrow();
  });
});
