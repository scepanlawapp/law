import { FakeChatModelProvider } from "@law/llm";
import type { GroundingSearchHit } from "@law/legal-grounding";
import {
  createDraftingWorkflows,
  runDraftingWorkflow,
  type DraftingStage,
} from "./drafting.workflows";

const budget = {
  perDocMaxChars: 15_000,
  totalMaxChars: 60_000,
  draftingPromptMaxChars: 40_000,
};

const lawsuitBrief = {
  jobType: "lawsuit",
  plaintiff: { name: "Petar Petrović", address: "Knez Mihailova 1, Beograd" },
  defendant: { name: "Alfa d.o.o.", address: null },
  competentCourt: null,
  claimValue: "150.000 RSD",
  legalBasis: ["Zakon o radu čl. 104"],
  factualDescription: "Poslodavac nije isplatio zaradu za tri meseca.",
  evidence: [],
  reliefSought: "Isplata neisplaćene zarade.",
  missingFields: ["defendant.address", "competentCourt"],
  confidence: 0.8,
  warnings: [],
};

const draft = {
  documentText: "OSNOVNI SUD [UNOS POTREBAN: nadležni sud]\n\nTUŽBA … [1]",
  warnings: ["Nedostaje adresa tuženog."],
  usedCitations: [1],
};

function hit(id: string): GroundingSearchHit {
  return {
    id,
    text: "Zaposleni ima pravo na odgovarajuću zaradu.",
    score: 0.9,
    source: {
      title: "Zakon o radu",
      publisher: "Paragraf Lex",
      sourceUrl: "https://www.paragraf.rs/propisi/zakon_o_radu.html",
      jurisdiction: "RS",
    },
    articleNumber: "104",
    paragraphNumber: null,
    pointNumber: null,
  };
}

describe("drafting workflows", () => {
  it("extracts a brief, grounds it, and drafts a lawsuit with used citations", async () => {
    const stages: DraftingStage[] = [];
    const onBrief = jest.fn();
    const search = jest.fn().mockResolvedValue([hit("chunk-104")]);
    const { lawsuitDrafting } = createDraftingWorkflows({
      provider: new FakeChatModelProvider([lawsuitBrief, draft]),
      search,
      onStage: (stage) => {
        stages.push(stage);
      },
      onBrief,
    });

    const outcome = await runDraftingWorkflow(lawsuitDrafting, {
      userText:
        "Petar Petrović traži tužbu protiv Alfa d.o.o. zbog neisplaćene zarade.",
      documents: [],
      caseContext: "Povezani predmet: 2026-21",
      budget,
    });

    expect(stages).toEqual(["EXTRACTING_FACTS", "PREPARING_DRAFT"]);
    expect(onBrief).toHaveBeenCalledWith(
      expect.objectContaining({
        brief: expect.objectContaining({ jobType: "lawsuit" }),
      }),
    );
    expect(search).toHaveBeenCalledWith(
      "Zakon o radu čl. 104",
      expect.any(Number),
    );
    expect(outcome).toMatchObject({
      outcome: "DRAFTED",
      draft: { documentText: draft.documentText, warnings: draft.warnings },
      citations: [expect.objectContaining({ marker: 1, chunkId: "chunk-104" })],
    });
  });

  it("stops after the brief for non-lawsuit requests", async () => {
    const provider = new FakeChatModelProvider([
      { ...lawsuitBrief, jobType: "contract" },
    ]);
    const { lawsuitDrafting } = createDraftingWorkflows({
      provider,
      search: jest.fn(),
    });

    const outcome = await runDraftingWorkflow(lawsuitDrafting, {
      userText: "Treba mi ugovor o zakupu.",
      documents: [],
      caseContext: null,
      budget,
    });

    expect(outcome).toMatchObject({
      outcome: "UNSUPPORTED",
      draft: null,
      citations: [],
    });
  });

  it("revises a draft with the previous text and the instruction as feedback", async () => {
    const provider = new FakeChatModelProvider([
      { ...draft, documentText: "Kraća tužba.", usedCitations: [] },
    ]);
    const completeStructured = jest.spyOn(provider, "completeStructured");
    const { draftRevision } = createDraftingWorkflows({
      provider,
      search: jest.fn().mockResolvedValue([]),
    });

    const outcome = await runDraftingWorkflow(draftRevision, {
      brief: lawsuitBrief as never,
      caseContext: null,
      budget,
      feedback: {
        previousDraft: draft.documentText,
        reviewerNote: "Skrati obrazloženje.",
      },
    });

    expect(outcome).toMatchObject({
      outcome: "DRAFTED",
      draft: { documentText: "Kraća tužba." },
    });
    const prompt = completeStructured.mock.calls[0][0].messages[1].content;
    expect(prompt).toContain("Skrati obrazloženje.");
    expect(prompt).toContain(draft.documentText);
  });

  it("keeps drafting when legal grounding fails", async () => {
    const { draftRevision } = createDraftingWorkflows({
      provider: new FakeChatModelProvider([draft]),
      search: jest.fn().mockRejectedValue(new Error("pgvector down")),
    });

    await expect(
      runDraftingWorkflow(draftRevision, {
        brief: lawsuitBrief as never,
        caseContext: null,
        budget,
        feedback: null,
      }),
    ).resolves.toMatchObject({ outcome: "DRAFTED", citations: [] });
  });

  it("surfaces model failures as errors", async () => {
    const { lawsuitDrafting } = createDraftingWorkflows({
      provider: new FakeChatModelProvider({ jobType: "lawsuit" }),
      search: jest.fn(),
    });

    await expect(
      runDraftingWorkflow(lawsuitDrafting, {
        userText: "Tužba",
        documents: [],
        caseContext: null,
        budget,
      }),
    ).rejects.toThrow();
  });
});
