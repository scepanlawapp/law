import type {
  GroundingCitation,
  GroundingSearchHit,
} from "@law/legal-grounding";
import { createScriptedModel } from "../testing/scripted-model";
import { CitationRegistry } from "./citation-registry";
import { createLegalAssistantAgent } from "./legal-assistant.agent";
import { createLegalAssistantRequestContext } from "./legal-assistant.context";
import { buildLegalAssistantInstructions } from "./legal-assistant.prompt";
import { createCreateDeadlineTool } from "./tools/create-deadline.tool";
import { createCreateTasksFromBriefTool } from "./tools/create-tasks-from-brief.tool";
import { createDraftDocumentTool } from "./tools/draft-document.tool";
import { createLinkCaseTool } from "./tools/link-case.tool";
import { ASSISTANT_TOOL_SIDE_EFFECTS } from "./tools/side-effects";
import { createGetAgendaTool } from "./tools/get-agenda.tool";
import { createGetCaseTool } from "./tools/get-case.tool";
import { createGetClientTool } from "./tools/get-client.tool";
import { createListActivityTool } from "./tools/list-activity.tool";
import { createListDocumentsTool } from "./tools/list-documents.tool";
import { createReadDocumentTool } from "./tools/read-document.tool";
import { createSearchDocumentsTool } from "./tools/search-documents.tool";
import { createListWorkItemsTool } from "./tools/list-work-items.tool";
import { createSearchCasesTool } from "./tools/search-cases.tool";
import { createSearchClientsTool } from "./tools/search-clients.tool";
import { createGetDraftTool } from "./tools/get-draft.tool";
import { createListDraftsTool } from "./tools/list-drafts.tool";
import { createReviewContractTool } from "./tools/review-contract.tool";
import { createReviseDraftTool } from "./tools/revise-draft.tool";
import { createSearchLegalSourcesTool } from "./tools/search-legal-sources.tool";
import type { LegalAssistantToolDeps } from "./tools/tool-deps";
import type { ZodTypeAny } from "zod";

function hit(
  id: string,
  score: number,
  articleNumber = "76",
): GroundingSearchHit {
  return {
    id,
    text: `Tekst odredbe ${id}.`,
    score,
    source: {
      title: "Zakon o radu",
      publisher: "Paragraf Lex",
      sourceUrl: "https://www.paragraf.rs/propisi/zakon_o_radu.html",
      jurisdiction: "RS",
    },
    articleNumber,
    paragraphNumber: null,
    pointNumber: null,
  };
}

function citation(chunkId: string, marker: number): GroundingCitation {
  return {
    marker,
    chunkId,
    articleNumber: null,
    sourceTitle: "Zakon",
    sourceUrl: "https://example.test",
    snippet: "…",
    score: 0.9,
  };
}

const emptyList = {
  status: "OK" as const,
  filters: {},
  items: [],
  total: 0,
  truncated: false,
};

function deps(
  overrides: Partial<LegalAssistantToolDeps> = {},
): LegalAssistantToolDeps {
  return {
    searchLegalSources: jest.fn().mockResolvedValue([hit("chunk-a", 0.9)]),
    lookupCase: jest.fn().mockResolvedValue({ found: "none", message: "none" }),
    draftDocument: jest.fn().mockResolvedValue({
      status: "DRAFT_READY",
      draftId: "draft-1",
      documentType: "Tužba",
      version: 1,
      approvalStatus: "READY_FOR_SIGNOFF",
      missingFields: ["defendant.address"],
      warnings: [],
      citationCount: 1,
      excerpt: "TUŽBA",
    }),
    reviseDraft: jest.fn(),
    reviewContract: jest.fn().mockResolvedValue({
      status: "REVIEW_READY",
      analysisId: "analysis-1",
      documentTitle: "NDA",
      contractType: "Ugovor o poverljivosti",
      summary: "Kratko.",
      issueCounts: { high: 1, medium: 0, low: 0 },
      topIssues: [],
      missingClauses: [],
      citationCount: 0,
      truncated: false,
    }),
    getDraft: jest.fn(),
    listDrafts: jest.fn().mockResolvedValue({ drafts: [] }),
    searchCases: jest.fn().mockResolvedValue(emptyList),
    searchClients: jest.fn().mockResolvedValue(emptyList),
    getClient: jest.fn().mockResolvedValue({ found: "none", message: "none" }),
    listWorkItems: jest.fn().mockResolvedValue(emptyList),
    getAgenda: jest.fn().mockResolvedValue(emptyList),
    listActivity: jest.fn().mockResolvedValue(emptyList),
    listDocuments: jest.fn().mockResolvedValue({
      status: "OK",
      case: null,
      items: [],
      truncated: false,
    }),
    readDocument: jest
      .fn()
      .mockResolvedValue({ status: "NOT_FOUND", message: "none" }),
    searchDocuments: jest
      .fn()
      .mockResolvedValue({ status: "NOT_FOUND", message: "none" }),
    proposeAction: jest.fn().mockResolvedValue({
      status: "CONFIRMATION_REQUIRED",
      pendingActionId: "action-1",
      summary: "Novi rok",
      details: [],
    }),
    ...overrides,
  };
}

const turn = {
  workspaceId: "workspace-1",
  sessionId: "session-1",
  jobId: "job-turn",
  correlationId: "corr-1",
  messageId: "message-1",
  language: "sr" as const,
  userId: "user-1",
  userDisplayName: "Ana Anić",
};

function requestContext(overrides: { citations?: CitationRegistry } = {}) {
  return createLegalAssistantRequestContext({
    workspaceId: "workspace-1",
    sessionCaseId: "case-1",
    language: "sr",
    caseContext: "Povezani predmet: P-1/2026",
    workspaceState:
      "Nacrti u ovom razgovoru:\n- draft-1 v1 (READY_FOR_SIGNOFF)",
    conversationSummary: "- Tužilac: Petar Petrović, Beograd",
    intent: "ANSWER",
    turn,
    today: "2026-09-27",
    citations: overrides.citations ?? new CitationRegistry(),
  });
}

function textOf(prompt: unknown): string {
  return JSON.stringify(prompt);
}

describe("CitationRegistry", () => {
  it("numbers citations across searches and reuses markers for repeated chunks", () => {
    const registry = new CitationRegistry();

    expect(
      registry.add([citation("a", 1), citation("b", 2)]).map((c) => c.marker),
    ).toEqual([1, 2]);
    expect(
      registry.add([citation("b", 1), citation("c", 2)]).map((c) => c.marker),
    ).toEqual([2, 3]);
    expect(registry.all().map((c) => c.chunkId)).toEqual(["a", "b", "c"]);
  });

  it("stops registering new chunks at the limit", () => {
    const registry = new CitationRegistry(1);

    expect(registry.add([citation("a", 1), citation("b", 2)])).toHaveLength(1);
    expect(registry.all()).toHaveLength(1);
  });
});

describe("buildLegalAssistantInstructions", () => {
  it("sets the reply language and appends the case context", () => {
    const text = buildLegalAssistantInstructions({
      language: "en",
      caseContext: "Povezani predmet: P-1/2026",
    });

    expect(text).toContain("Reply in English.");
    expect(text).toContain("Povezani predmet: P-1/2026");
    expect(text).not.toContain("drafting request");
  });

  it("adds the drafting hint and the conversation drafts", () => {
    const text = buildLegalAssistantInstructions({
      language: "sr",
      intent: "DRAFT",
      workspaceState: "Nacrti u ovom razgovoru:\n- draft-1 v1",
    });

    expect(text).toContain("drafting request");
    expect(text).toContain("- draft-1 v1");
    expect(text).toContain("Refer to drafts by version");
    expect(
      buildLegalAssistantInstructions({ language: "sr", today: "2026-09-27" }),
    ).toContain("Today is 2026-09-27");
  });

  it("names the current user", () => {
    expect(
      buildLegalAssistantInstructions({
        language: "sr",
        currentUser: "Ana Anić",
      }),
    ).toContain("The current user is Ana Anić");
    expect(buildLegalAssistantInstructions({ language: "sr" })).not.toContain(
      "The current user",
    );
  });
});

describe("assistant tools", () => {
  it("search_legal_sources scopes the search to the workspace and returns numbered sources", async () => {
    const toolDeps = deps();
    const registry = new CitationRegistry();
    const tool = createSearchLegalSourcesTool(toolDeps);

    const result = await tool.execute?.({ query: "Закон о раду одмор" }, {
      requestContext: requestContext({ citations: registry }),
    } as never);

    expect(toolDeps.searchLegalSources).toHaveBeenCalledWith(
      "Zakon o radu odmor",
      expect.any(Number),
      "workspace-1",
    );
    expect(result).toMatchObject({ count: 1 });
    expect((result as { sources: string }).sources).toContain(
      "[1] Član 76 (Zakon o radu)",
    );
    expect(registry.all().map((c) => c.chunkId)).toEqual(["chunk-a"]);
  });

  it("search_legal_sources reports when nothing relevant was found", async () => {
    const tool = createSearchLegalSourcesTool(
      deps({
        searchLegalSources: jest.fn().mockResolvedValue([hit("low", 0.1)]),
      }),
    );

    const result = await tool.execute?.({ query: "nepoznat pojam" }, {
      requestContext: requestContext(),
    } as never);

    expect(result).toMatchObject({ count: 0 });
  });

  it("drafting tools pass the turn scope and arguments to the service", async () => {
    const toolDeps = deps();
    const context = { requestContext: requestContext() } as never;

    await createDraftDocumentTool(toolDeps).execute?.(
      {
        documentType: "APPEAL",
        note: "Žalilac je Petar.",
        documentRefs: ["doc:presuda-1"],
      },
      context,
    );
    await createReviseDraftTool(toolDeps).execute?.(
      { instruction: "Skrati obrazloženje.", draftId: "draft-1" },
      context,
    );
    await createGetDraftTool(toolDeps).execute?.({}, context);
    await createListDraftsTool(toolDeps).execute?.({}, context);

    expect(toolDeps.draftDocument).toHaveBeenCalledWith(turn, {
      documentType: "APPEAL",
      note: "Žalilac je Petar.",
      documentRefs: ["doc:presuda-1"],
    });
    await createReviewContractTool(toolDeps).execute?.(
      {
        documentRef: "att:nda-1",
        contractType: "NDA",
        clientSide: "Beta d.o.o.",
      },
      context,
    );
    expect(toolDeps.reviewContract).toHaveBeenCalledWith(turn, {
      documentRef: "att:nda-1",
      contractType: "NDA",
      clientSide: "Beta d.o.o.",
      focus: undefined,
    });
    expect(toolDeps.reviseDraft).toHaveBeenCalledWith(turn, {
      instruction: "Skrati obrazloženje.",
      draftId: "draft-1",
    });
    expect(toolDeps.getDraft).toHaveBeenCalledWith(turn, {
      draftId: undefined,
    });
    expect(toolDeps.listDrafts).toHaveBeenCalledWith(turn);
  });

  it("record-changing tools only propose actions with the turn scope", async () => {
    const toolDeps = deps();
    const context = { requestContext: requestContext() } as never;

    await createLinkCaseTool(toolDeps).execute?.(
      { caseReference: "2026-21" },
      context,
    );
    await createCreateDeadlineTool(toolDeps).execute?.(
      {
        title: "Odgovor na tužbu",
        dueDate: "2026-10-15",
        deadlineType: "COURT",
      },
      context,
    );
    await createCreateTasksFromBriefTool(toolDeps).execute?.({}, context);

    expect(toolDeps.proposeAction).toHaveBeenNthCalledWith(1, turn, {
      type: "link_case",
      caseReference: "2026-21",
    });
    expect(toolDeps.proposeAction).toHaveBeenNthCalledWith(2, turn, {
      type: "create_deadline",
      title: "Odgovor na tužbu",
      dueDate: "2026-10-15",
      deadlineType: "COURT",
    });
    expect(toolDeps.proposeAction).toHaveBeenNthCalledWith(3, turn, {
      type: "create_tasks_from_brief",
      briefId: undefined,
    });
  });

  it("declares a side-effect level for every agent tool", async () => {
    const agent = createLegalAssistantAgent({
      model: createScriptedModel([{ text: "ok" }]).model as never,
      deps: deps(),
    });
    const tools = await agent.listTools();

    expect(Object.keys(tools).sort()).toEqual(
      Object.keys(ASSISTANT_TOOL_SIDE_EFFECTS).sort(),
    );
    expect(
      Object.entries(ASSISTANT_TOOL_SIDE_EFFECTS)
        .filter(([, level]) => level === "confirm")
        .map(([name]) => name)
        .sort(),
    ).toEqual(["create_deadline", "create_tasks_from_brief", "link_case"]);
  });

  it("office read tools pass the turn scope, arguments, and linked case", async () => {
    const toolDeps = deps();
    const context = { requestContext: requestContext() } as never;

    await createSearchCasesTool(toolDeps).execute?.(
      { query: "Razvod", status: "ACTIVE", responsible: "me" },
      context,
    );
    await createSearchClientsTool(toolDeps).execute?.(
      { query: "Petrović" },
      context,
    );
    await createGetClientTool(toolDeps).execute?.(
      { reference: "Alfa" },
      context,
    );
    await createListWorkItemsTool(toolDeps).execute?.(
      { kind: "deadline", state: "open", person: "me" },
      context,
    );
    await createGetAgendaTool(toolDeps).execute?.(
      { from: "2026-09-28", to: "2026-10-04", person: "Marko" },
      context,
    );
    await createListActivityTool(toolDeps).execute?.({ limit: 5 }, context);

    expect(toolDeps.searchCases).toHaveBeenCalledWith(turn, {
      query: "Razvod",
      status: "ACTIVE",
      responsible: "me",
    });
    expect(toolDeps.searchClients).toHaveBeenCalledWith(turn, {
      query: "Petrović",
    });
    expect(toolDeps.getClient).toHaveBeenCalledWith(turn, {
      reference: "Alfa",
    });
    expect(toolDeps.listWorkItems).toHaveBeenCalledWith(turn, {
      kind: "deadline",
      state: "open",
      person: "me",
      linkedCaseId: "case-1",
    });
    expect(toolDeps.getAgenda).toHaveBeenCalledWith(turn, {
      from: "2026-09-28",
      to: "2026-10-04",
      person: "Marko",
    });
    expect(toolDeps.listActivity).toHaveBeenCalledWith(turn, {
      limit: 5,
      linkedCaseId: "case-1",
    });
  });

  it("office read tools validate their inputs", () => {
    const agenda = createGetAgendaTool(deps())
      .inputSchema as unknown as ZodTypeAny;
    const work = createListWorkItemsTool(deps())
      .inputSchema as unknown as ZodTypeAny;
    const activity = createListActivityTool(deps())
      .inputSchema as unknown as ZodTypeAny;

    expect(
      agenda.safeParse({ from: "28.09.2026", to: "2026-10-04" }).success,
    ).toBe(false);
    expect(
      agenda.parse({ from: "2026-09-28", to: "2026-10-04" }),
    ).toMatchObject({ person: "me" });
    expect(work.parse({})).toEqual({ kind: "all", state: "open" });
    expect(work.safeParse({ kind: "invoice" }).success).toBe(false);
    expect(activity.parse({})).toEqual({ limit: 10 });
    expect(activity.safeParse({ limit: 100 }).success).toBe(false);
  });

  it("document tools pass the turn scope and arguments", async () => {
    const toolDeps = deps();
    const context = { requestContext: requestContext() } as never;

    await createListDocumentsTool(toolDeps).execute?.({}, context);
    await createReadDocumentTool(toolDeps).execute?.(
      { ref: "doc:1", offset: 12000 },
      context,
    );
    await createSearchDocumentsTool(toolDeps).execute?.(
      { query: "zakupnina" },
      context,
    );

    expect(toolDeps.listDocuments).toHaveBeenCalledWith(turn);
    expect(toolDeps.readDocument).toHaveBeenCalledWith(turn, {
      ref: "doc:1",
      offset: 12000,
    });
    expect(toolDeps.searchDocuments).toHaveBeenCalledWith(turn, {
      query: "zakupnina",
      ref: undefined,
    });
  });

  it("document tools validate their inputs", () => {
    const read = createReadDocumentTool(deps())
      .inputSchema as unknown as ZodTypeAny;
    const search = createSearchDocumentsTool(deps())
      .inputSchema as unknown as ZodTypeAny;

    expect(read.safeParse({ ref: "doc:1", offset: -1 }).success).toBe(false);
    expect(read.safeParse({}).success).toBe(false);
    expect(search.safeParse({ query: "a" }).success).toBe(false);
    expect(search.parse({ query: " ugovor " })).toEqual({ query: "ugovor" });
  });

  it("get_case passes the workspace and linked case from the request context", async () => {
    const toolDeps = deps();
    const tool = createGetCaseTool(toolDeps);

    await tool.execute?.({ reference: "P-7" }, {
      requestContext: requestContext(),
    } as never);

    expect(toolDeps.lookupCase).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      sessionCaseId: "case-1",
      reference: "P-7",
    });
  });
});

describe("legal assistant agent", () => {
  it("drafts through draft_document and summarizes the tool result", async () => {
    const toolDeps = deps();
    const { model, prompts } = createScriptedModel([
      {
        toolCalls: [
          { toolName: "draft_document", input: { documentType: "LAWSUIT" } },
        ],
      },
      { text: "Nacrt je spreman. Nedostaje adresa tuženog." },
    ]);
    const agent = createLegalAssistantAgent({
      model: model as never,
      deps: toolDeps,
    });

    const stream = await agent.stream(
      [{ role: "user", content: "Pripremi tužbu protiv Alfa d.o.o." }],
      { requestContext: requestContext(), maxSteps: 4 },
    );
    let text = "";
    for await (const delta of stream.textStream) text += delta;

    expect(toolDeps.draftDocument).toHaveBeenCalledWith(turn, {
      documentType: "LAWSUIT",
      note: undefined,
      documentRefs: undefined,
    });
    expect(text).toContain("Nacrt je spreman");
    expect(textOf(prompts[0])).toContain("draft-1 v1 (READY_FOR_SIGNOFF)");
    expect(textOf(prompts[1])).toContain("defendant.address");
  });

  it("calls search_legal_sources, then answers with the returned marker", async () => {
    const toolDeps = deps();
    const registry = new CitationRegistry();
    const { model, prompts } = createScriptedModel([
      {
        toolCalls: [
          {
            toolName: "search_legal_sources",
            input: { query: "godišnji odmor" },
          },
        ],
      },
      { text: ["Zaposleni ima pravo ", "na odmor [1]."] },
    ]);
    const agent = createLegalAssistantAgent({
      model: model as never,
      deps: toolDeps,
    });

    const stream = await agent.stream(
      [
        { role: "user", content: "Koliko traje godišnji odmor?" },
        { role: "assistant", content: "Najmanje 20 radnih dana." },
        { role: "user", content: "A za rad duži od godinu dana?" },
      ],
      { requestContext: requestContext({ citations: registry }), maxSteps: 4 },
    );
    let text = "";
    for await (const delta of stream.textStream) text += delta;

    expect(text).toBe("Zaposleni ima pravo na odmor [1].");
    expect(toolDeps.searchLegalSources).toHaveBeenCalledTimes(1);
    expect(registry.all()).toHaveLength(1);
    expect(textOf(prompts[0])).toContain("Najmanje 20 radnih dana.");
    expect(textOf(prompts[0])).toContain("Povezani predmet: P-1/2026");
    expect(textOf(prompts[0])).toContain("Sažetak ranijeg dela razgovora");
    expect(textOf(prompts[0])).toContain("- Tužilac: Petar Petrović, Beograd");
    expect(textOf(prompts[1])).toContain("[1] Član 76 (Zakon o radu)");
  });
});
