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
import { createDraftLawsuitTool } from "./tools/draft-lawsuit.tool";
import { createLinkCaseTool } from "./tools/link-case.tool";
import { ASSISTANT_TOOL_SIDE_EFFECTS } from "./tools/side-effects";
import { createGetCaseTool } from "./tools/get-case.tool";
import { createGetDraftTool } from "./tools/get-draft.tool";
import { createListDraftsTool } from "./tools/list-drafts.tool";
import { createReviseDraftTool } from "./tools/revise-draft.tool";
import { createSearchLegalSourcesTool } from "./tools/search-legal-sources.tool";
import type { LegalAssistantToolDeps } from "./tools/tool-deps";

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

function deps(
  overrides: Partial<LegalAssistantToolDeps> = {},
): LegalAssistantToolDeps {
  return {
    searchLegalSources: jest.fn().mockResolvedValue([hit("chunk-a", 0.9)]),
    lookupCase: jest.fn().mockResolvedValue({ found: "none", message: "none" }),
    draftLawsuit: jest.fn().mockResolvedValue({
      status: "DRAFT_READY",
      draftId: "draft-1",
      version: 1,
      approvalStatus: "READY_FOR_SIGNOFF",
      missingFields: ["defendant.address"],
      warnings: [],
      citationCount: 1,
      excerpt: "TUŽBA",
    }),
    reviseDraft: jest.fn(),
    getDraft: jest.fn(),
    listDrafts: jest.fn().mockResolvedValue({ drafts: [] }),
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
};

function requestContext(overrides: { citations?: CitationRegistry } = {}) {
  return createLegalAssistantRequestContext({
    workspaceId: "workspace-1",
    sessionCaseId: "case-1",
    language: "sr",
    caseContext: "Povezani predmet: P-1/2026",
    workspaceState:
      "Nacrti u ovom razgovoru:\n- draft-1 v1 (READY_FOR_SIGNOFF)",
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

    await createDraftLawsuitTool(toolDeps).execute?.(
      { note: "Tužilac je Petar." },
      context,
    );
    await createReviseDraftTool(toolDeps).execute?.(
      { instruction: "Skrati obrazloženje.", draftId: "draft-1" },
      context,
    );
    await createGetDraftTool(toolDeps).execute?.({}, context);
    await createListDraftsTool(toolDeps).execute?.({}, context);

    expect(toolDeps.draftLawsuit).toHaveBeenCalledWith(turn, {
      note: "Tužilac je Petar.",
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
  it("drafts through draft_lawsuit and summarizes the tool result", async () => {
    const toolDeps = deps();
    const { model, prompts } = createScriptedModel([
      { toolCalls: [{ toolName: "draft_lawsuit", input: {} }] },
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

    expect(toolDeps.draftLawsuit).toHaveBeenCalledWith(turn, {
      note: undefined,
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
    expect(textOf(prompts[1])).toContain("[1] Član 76 (Zakon o radu)");
  });
});
