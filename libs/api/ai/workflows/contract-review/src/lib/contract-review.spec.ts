import { CONTRACT_REVIEW_TYPES } from "@law/api-interfaces";
import { FakeChatModelProvider } from "@law/llm";
import {
  buildReviewGroundingQueries,
  getContractChecklist,
  isContractReviewType,
  listContractChecklists,
} from "./checklists";
import { renderContractReviewMemo } from "./memo";
import {
  buildContractReviewSystemPrompt,
  buildContractReviewUserPrompt,
} from "./prompts";
import { finalizeContractReview, runContractReviewLlm } from "./runner";
import { contractReviewLlmSchema } from "./schema";

const llmOutput = {
  summary: " Ugovor o poverljivosti između Alfa i Beta. ",
  keyTerms: [
    { label: "Trajanje", value: "5 godina", clause: "Član 6" },
    { label: "Ugovorna kazna", value: "  ", clause: null },
  ],
  issues: [
    {
      title: "Nejasan obim",
      category: "RISK",
      risk: "LOW",
      clause: null,
      quote: null,
      explanation: "Definicija je široka.",
      suggestion: null,
      citations: [],
    },
    {
      title: "Ugovorna kazna za novčanu obavezu",
      category: "COMPLIANCE",
      risk: "HIGH",
      clause: "Član 8",
      quote: "plaća ugovornu kaznu od 1% dnevno",
      explanation: "Proveriti dopuštenost.",
      suggestion: "Zameniti zateznom kamatom.",
      citations: [2, 2, 9],
    },
    {
      title: "Jednostrane obaveze",
      category: "RISK",
      risk: "HIGH",
      clause: "Član 3",
      quote: null,
      explanation: "Samo klijent ima obaveze.",
      suggestion: "Obostrane obaveze.",
      citations: [],
    },
  ],
  missingClauses: [
    {
      title: "Vraćanje informacija",
      explanation: "Nema odredbe.",
      suggestion: null,
    },
  ],
  warnings: [],
  usedCitations: [1, 7],
};

describe("contract checklists", () => {
  it("defines one checklist per shared review type", () => {
    expect(listContractChecklists().map((item) => item.id)).toEqual([
      ...CONTRACT_REVIEW_TYPES,
    ]);
    for (const checklist of listContractChecklists()) {
      expect(checklist.expectedClauses.length).toBeGreaterThan(3);
      expect(checklist.riskPoints.length).toBeGreaterThan(0);
      expect(checklist.compliancePoints.length).toBeGreaterThan(0);
      expect(checklist.fileSlug).toMatch(/^[a-z0-9-]+$/);
    }
    expect(isContractReviewType("NDA")).toBe(true);
    expect(isContractReviewType("LAWSUIT")).toBe(false);
  });

  it("lists the mandatory employment-contract elements", () => {
    const checklist = getContractChecklist("EMPLOYMENT_CONTRACT");
    expect(checklist.expectedClauses).toEqual(
      expect.arrayContaining(["mesto rada", "dan početka rada"]),
    );
    expect(checklist.legalFrame).toContain("Zakon o radu");
  });

  it("grounds on the legal frame and each compliance point", () => {
    const checklist = getContractChecklist("COPYRIGHT_LICENCE");
    const queries = buildReviewGroundingQueries(checklist);
    expect(queries[0]).toBe(checklist.legalFrame);
    expect(queries).toHaveLength(checklist.compliancePoints.length + 1);
    expect(queries[1]).toContain("pisana forma ugovora o autorskom delu");
  });
});

describe("contract review prompts", () => {
  it("reviews from the client's side with the checklist and citation rules", () => {
    const prompt = buildContractReviewSystemPrompt({
      checklist: getContractChecklist("NDA"),
      clientSide: "strana koja prima informacije, Beta d.o.o.",
      focus: "ugovorna kazna",
    });
    expect(prompt).toContain("„Ugovor o poverljivosti”");
    expect(prompt).toContain(
      "Kancelarija zastupa: strana koja prima informacije, Beta d.o.o.",
    );
    expect(prompt).toContain("preširoka definicija poverljivih informacija");
    expect(prompt).toContain("vraćanje ili uništavanje informacija");
    expect(prompt).toContain("Dostupni izvori iz pravne baze znanja");
    expect(prompt).toContain("posebno obratiš pažnju na: ugovorna kazna");
  });

  it("asks for both sides when the client side is unknown", () => {
    const prompt = buildContractReviewSystemPrompt({
      checklist: getContractChecklist("OTHER_CONTRACT"),
      clientSide: null,
      focus: null,
    });
    expect(prompt).toContain("rizike ocenjuj za obe strane");
    expect(prompt).not.toContain("posebno obratiš pažnju");
  });

  it("includes the contract and sources, cutting only the contract text", () => {
    const full = buildContractReviewUserPrompt({
      documentTitle: "NDA Alfa",
      text: "Član 1. Tekst.",
      groundingContextBlock: "[1] Član 270 (ZOO)",
      maxChars: 1_000,
    });
    expect(full.truncated).toBe(false);
    expect(full.prompt).toContain("Ugovor: NDA Alfa");
    expect(full.prompt).toContain("[1] Član 270 (ZOO)");

    const cut = buildContractReviewUserPrompt({
      documentTitle: "NDA Alfa",
      text: "x".repeat(500),
      groundingContextBlock: "[1] Član 270 (ZOO)",
      maxChars: 200,
    });
    expect(cut.truncated).toBe(true);
    expect(cut.prompt).toContain("[1] Član 270 (ZOO)");
    expect(cut.reviewedChars).toBeLessThan(200);
  });
});

describe("contract review output", () => {
  it("parses model output with defaults and trims optional text", () => {
    const parsed = contractReviewLlmSchema.parse({
      summary: "Kratko.",
      issues: [
        {
          title: "A",
          category: "RISK",
          risk: "LOW",
          explanation: "B",
          quote: "  ",
        },
      ],
    });
    expect(parsed.keyTerms).toEqual([]);
    expect(parsed.issues[0]).toMatchObject({
      quote: null,
      clause: null,
      suggestion: null,
      citations: [],
    });
    expect(() =>
      contractReviewLlmSchema.parse({ summary: "x", issues: [{ risk: "?" }] }),
    ).toThrow();
  });

  it("keeps only known markers and orders issues by risk", () => {
    const { result, usedMarkers } = finalizeContractReview(
      llmOutput as never,
      [1, 2, 3],
    );
    expect(result.summary).toBe("Ugovor o poverljivosti između Alfa i Beta.");
    expect(result.keyTerms).toHaveLength(1);
    expect(result.issues.map((issue) => issue.title)).toEqual([
      "Ugovorna kazna za novčanu obavezu",
      "Jednostrane obaveze",
      "Nejasan obim",
    ]);
    expect(result.issues[0].citations).toEqual([2]);
    expect(usedMarkers).toEqual([1, 2]);
  });

  it("runs the structured model call", async () => {
    const provider = new FakeChatModelProvider(llmOutput);
    const output = await runContractReviewLlm(provider, "system", "user");
    expect(output.issues).toHaveLength(3);
  });
});

describe("renderContractReviewMemo", () => {
  it("renders a Markdown memo with findings, missing clauses and sources", () => {
    const { result } = finalizeContractReview(llmOutput as never, [2]);
    const memo = renderContractReviewMemo({
      documentTitle: "NDA Alfa",
      contractLabel: "Ugovor o poverljivosti",
      clientSide: null,
      date: "2026-10-07",
      result,
      citations: [
        {
          marker: 2,
          articleNumber: "270",
          sourceTitle: "Zakon o obligacionim odnosima",
          sourceUrl: "https://example.test",
          snippet: "…",
          score: 0.8,
        },
      ],
      truncated: true,
    });
    expect(memo).toContain("# Analiza ugovora");
    expect(memo).toContain("Klijent kancelarije: nije naveden");
    expect(memo).toContain("### 1. Ugovorna kazna za novčanu obavezu — Član 8");
    expect(memo).toContain("Visok rizik (usklađenost) [2]");
    expect(memo).toContain("Odredba: „plaća ugovornu kaznu od 1% dnevno”");
    expect(memo).toContain("- Vraćanje informacija: Nema odredbe.");
    expect(memo).toContain("analiziran je samo njegov početni deo");
    expect(memo).toContain("- [2] Član 270, Zakon o obligacionim odnosima");
  });
});
