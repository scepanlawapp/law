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

// What the model returns (the document type is chosen before the run).
const lawsuitBrief = {
  parties: [
    { role: "plaintiff", name: "Petar Petrović", address: "Knez Mihailova 1, Beograd", idNumber: null },
    { role: "defendant", name: "Alfa d.o.o.", address: null, idNumber: null },
  ],
  fields: [
    { key: "claimValue", value: "150.000 RSD" },
    { key: "reliefSought", value: "Isplata neisplaćene zarade." },
  ],
  legalBasis: ["Zakon o radu čl. 104"],
  factualDescription: "Poslodavac nije isplatio zaradu za tri meseca.",
  evidence: [],
  missingFields: [
    { key: "defendantAddress", label: "Adresa tuženog" },
    { key: "competentCourt", label: "Nadležni sud" },
  ],
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
    const { documentDrafting } = createDraftingWorkflows({
      provider: new FakeChatModelProvider([lawsuitBrief, draft]),
      search,
      onStage: (stage) => {
        stages.push(stage);
      },
      onBrief,
    });

    const outcome = await runDraftingWorkflow(documentDrafting, {
      documentType: "LAWSUIT",
      userText:
        "Petar Petrović traži tužbu protiv Alfa d.o.o. zbog neisplaćene zarade.",
      documents: [],
      caseContext: "Povezani predmet: 2026-21",
      budget,
    });

    expect(stages).toEqual(["EXTRACTING_FACTS", "PREPARING_DRAFT"]);
    expect(onBrief).toHaveBeenCalledWith(
      expect.objectContaining({
        brief: expect.objectContaining({ documentType: "LAWSUIT" }),
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

  it("offers document facts to the brief and keeps a verified party source", async () => {
    const provider = new FakeChatModelProvider([
      {
        ...lawsuitBrief,
        parties: [
          {
            role: "plaintiff",
            name: "Petar Petrović",
            address: null,
            idNumber: "0101990710006",
            source: { ref: "doc:id-1" },
          },
          { role: "defendant", name: "Alfa d.o.o.", address: null, idNumber: null },
        ],
      },
      draft,
    ]);
    const completeStructured = jest.spyOn(provider, "completeStructured");
    const onBrief = jest.fn();
    const { documentDrafting } = createDraftingWorkflows({
      provider,
      search: jest.fn().mockResolvedValue([hit("chunk-104")]),
      onBrief,
    });

    const outcome = await runDraftingWorkflow(documentDrafting, {
      documentType: "LAWSUIT",
      userText: "Tužba protiv Alfa d.o.o.",
      documents: [],
      documentFacts: [
        {
          ref: "doc:id-1",
          title: "Lična karta",
          subjectType: "PERSON",
          subjectRole: null,
          field: "jmbg",
          value: "0101990710006",
        },
      ],
      caseContext: null,
      budget,
    });

    expect(completeStructured.mock.calls[0][0].messages[1].content).toContain(
      "jmbg: 0101990710006",
    );
    const expected = { ref: "doc:id-1", title: "Lična karta" };
    expect(onBrief.mock.calls[0][0].brief.parties[0].source).toEqual(expected);
    expect(outcome.brief.parties[0].source).toEqual(expected);
  });

  it("drafts an appeal with the appeal prompts", async () => {
    const provider = new FakeChatModelProvider([
      {
        ...lawsuitBrief,
        parties: [
          { role: "appellant", name: "Alfa d.o.o.", address: null, idNumber: null },
          { role: "opponent", name: "Petar Petrović", address: null, idNumber: null },
        ],
        fields: [{ key: "contestedDecision", value: "Presuda P 12/2026" }],
      },
      { ...draft, documentText: "ŽALBA … [1]" },
    ]);
    const completeStructured = jest.spyOn(provider, "completeStructured");
    const { documentDrafting } = createDraftingWorkflows({
      provider,
      search: jest.fn().mockResolvedValue([hit("chunk-104")]),
    });

    const outcome = await runDraftingWorkflow(documentDrafting, {
      documentType: "APPEAL",
      userText: "Uložiti žalbu na presudu P 12/2026.",
      documents: [],
      caseContext: null,
      budget,
    });

    expect(outcome.brief.documentType).toBe("APPEAL");
    expect(outcome.brief.parties.map((party) => party.role)).toEqual([
      "appellant",
      "opponent",
    ]);
    const [briefCall, draftCall] = completeStructured.mock.calls;
    expect(briefCall[0].messages[0].content).toContain("„Žalba”");
    expect(draftCall[0].messages[0].content).toContain("žalbeni razlozi");
  });

  it("rejects an unknown document type before calling the model", async () => {
    const provider = new FakeChatModelProvider([lawsuitBrief, draft]);
    const completeStructured = jest.spyOn(provider, "completeStructured");
    const { documentDrafting } = createDraftingWorkflows({
      provider,
      search: jest.fn(),
    });

    await expect(
      runDraftingWorkflow(documentDrafting, {
        documentType: "POEM" as never,
        userText: "Napiši pesmu.",
        documents: [],
        caseContext: null,
        budget,
      }),
    ).rejects.toThrow();
    expect(completeStructured).not.toHaveBeenCalled();
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
      brief: { ...lawsuitBrief, documentType: "LAWSUIT" } as never,
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
        brief: { ...lawsuitBrief, documentType: "LAWSUIT" } as never,
        caseContext: null,
        budget,
        feedback: null,
      }),
    ).resolves.toMatchObject({ outcome: "DRAFTED", citations: [] });
  });

  it("surfaces model failures as errors", async () => {
    const { documentDrafting } = createDraftingWorkflows({
      provider: new FakeChatModelProvider({ jobType: "lawsuit" }),
      search: jest.fn(),
    });

    await expect(
      runDraftingWorkflow(documentDrafting, {
        documentType: "LAWSUIT",
        userText: "Tužba",
        documents: [],
        caseContext: null,
        budget,
      }),
    ).rejects.toThrow();
  });
});
