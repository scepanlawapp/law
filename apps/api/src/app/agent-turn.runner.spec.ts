import type { ChatStreamEvent } from "@law/api-interfaces";
import type { ChatModelProvider, CompleteStructuredRequest } from "@law/llm";
import { createScriptedModel, type ScriptedModelStep } from "@law/mastra";
import {
  AgentTurnRunner,
  AssistantToolsAdapter,
  ChatEventBus,
  ChatRuntimeConfig,
  WorkflowJobPayload,
  WorkflowRunner,
} from "@law/chat";

const now = new Date("2026-09-27T12:00:00.000Z");

const payload: WorkflowJobPayload = {
  workspaceId: "workspace-1",
  sessionId: "session-1",
  jobId: "job-turn",
  correlationId: "corr-1",
  messageId: "message-user",
};

const turnInput = {
  messageId: "message-user",
  userText: "A za rad duži od godinu dana?",
  attachments: [],
  language: "sr" as const,
};

function prismaMock() {
  const pending = {
    id: "message-answer",
    sessionId: "session-1",
    role: "ASSISTANT",
    content: "",
    status: "PENDING",
    triageDecision: null,
    correlationId: "corr-1",
    metadata: { outcome: "ANSWER" },
    createdAt: now,
  };
  const toolCalls = new Map<string, Record<string, unknown>>();
  return {
    toolCalls,
    chatMessage: {
      create: jest.fn().mockResolvedValue(pending),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...pending, ...data }),
      ),
    },
    pendingAction: { findMany: jest.fn().mockResolvedValue([]) },
    agentToolCall: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `tool-row-${toolCalls.size + 1}`,
          startedAt: new Date(Date.now() - 5),
          finishedAt: null,
          durationMs: null,
          output: null,
          ...data,
        };
        toolCalls.set(row.id, row);
        return Promise.resolve(row);
      }),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const row = { ...toolCalls.get(where.id), ...data };
          toolCalls.set(where.id, row);
          return Promise.resolve(row);
        },
      ),
    },
  };
}

function contextBuilderMock() {
  return {
    build: jest.fn().mockResolvedValue({
      messages: [
        { role: "user", content: "Koliko traje godišnji odmor?" },
        { role: "assistant", content: "Najmanje 20 radnih dana." },
        { role: "user", content: turnInput.userText },
      ],
      sessionCaseId: null,
      caseContext: null,
    }),
    triageHistory: jest.fn().mockResolvedValue([
      { role: "user", content: "Koliko traje godišnji odmor?" },
      { role: "assistant", content: "Najmanje 20 radnih dana." },
    ]),
  };
}

function legalKnowledgeMock() {
  return {
    search: jest.fn().mockResolvedValue([
      {
        id: "chunk-76",
        text: "Zaposleni ima pravo na godišnji odmor u trajanju od najmanje 20 radnih dana.",
        score: 0.9,
        source: {
          title: "Zakon o radu",
          publisher: "Paragraf Lex",
          sourceUrl: "https://www.paragraf.rs/propisi/zakon_o_radu.html",
          jurisdiction: "RS",
        },
        articleNumber: "76",
        paragraphNumber: null,
        pointNumber: null,
      },
    ]),
  };
}

function setup(
  steps: ScriptedModelStep[],
  drafting?: Record<string, jest.Mock>,
  summaries?: { refresh: jest.Mock },
  office?: Record<string, jest.Mock>,
) {
  const prisma = prismaMock();
  const events = new ChatEventBus();
  const emitted: ChatStreamEvent[] = [];
  events.stream("session-1").subscribe((event) => emitted.push(event));
  const contextBuilder = contextBuilderMock();
  const legalKnowledge = legalKnowledgeMock();
  const { model, prompts } = createScriptedModel(steps);
  const runner = new AgentTurnRunner(
    prisma as never,
    events,
    Object.assign(new ChatRuntimeConfig(), { assistantModel: "test-model" }),
    contextBuilder as never,
    new AssistantToolsAdapter(
      legalKnowledge as never,
      undefined,
      drafting as never,
      undefined,
      office as never,
    ),
    model as never,
    summaries as never,
  );
  const job = { transition: jest.fn().mockResolvedValue(undefined) };
  return {
    prisma,
    emitted,
    contextBuilder,
    legalKnowledge,
    prompts,
    runner,
    job,
  };
}

describe("AgentTurnRunner", () => {
  it("runs office tools for the conversation's owner and names them in the prompt", async () => {
    const office = {
      listWorkItems: jest.fn().mockResolvedValue({
        status: "OK",
        filters: { osoba: "Ana Anić" },
        items: [],
        total: 0,
        truncated: false,
      }),
    };
    const { contextBuilder, prompts, runner, job } = setup(
      [
        {
          toolCalls: [
            { toolName: "list_work_items", input: { kind: "deadline" } },
          ],
        },
        { text: "Nemate otvorenih rokova." },
      ],
      undefined,
      undefined,
      office,
    );
    contextBuilder.build.mockResolvedValueOnce({
      messages: [{ role: "user", content: "Koje rokove imam?" }],
      sessionCaseId: null,
      caseContext: null,
      currentUser: { id: "user-1", displayName: "Ana Anić" },
    });

    await runner.run(turnInput, payload, job);

    expect(office.listWorkItems).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        userId: "user-1",
        userDisplayName: "Ana Anić",
      }),
      { kind: "deadline", state: "open", linkedCaseId: null },
    );
    expect(JSON.stringify(prompts[0])).toContain(
      "The current user is Ana Anić",
    );
  });

  it("answers with conversation context, searches sources, and persists used citations", async () => {
    const {
      prisma,
      emitted,
      contextBuilder,
      legalKnowledge,
      prompts,
      runner,
      job,
    } = setup([
      {
        toolCalls: [
          {
            toolName: "search_legal_sources",
            input: { query: "Zakon o radu godišnji odmor" },
          },
        ],
      },
      { text: ["Pravo na odmor ", "uređuje član 76 [1]."] },
    ]);

    await runner.run(turnInput, payload, job);

    expect(contextBuilder.build).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      sessionId: "session-1",
      messageId: "message-user",
    });
    expect(legalKnowledge.search).toHaveBeenCalledWith(
      "Zakon o radu godišnji odmor",
      expect.any(Number),
      "workspace-1",
    );
    expect(JSON.stringify(prompts[0])).toContain("Najmanje 20 radnih dana.");
    expect(
      emitted
        .filter((event) => event.type === "message.delta")
        .map((event) => event.delta),
    ).toEqual(["Pravo na odmor ", "uređuje član 76 [1]."]);
    expect(prisma.chatMessage.update).toHaveBeenLastCalledWith({
      where: { id: "message-answer" },
      data: {
        content: "Pravo na odmor uređuje član 76 [1].",
        status: "COMPLETED",
        metadata: {
          outcome: "ANSWER",
          citations: [
            expect.objectContaining({
              marker: 1,
              articleNumber: "76",
              sourceTitle: "Zakon o radu",
            }),
          ],
        },
      },
    });
    expect(emitted.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "message.started",
        "message.delta",
        "message.updated",
      ]),
    );
    expect(job.transition).toHaveBeenCalledWith(
      "COMPLETED",
      expect.objectContaining({
        progressStage: "PREPARING_ANSWER",
        messageId: "message-answer",
      }),
      null,
      // Two scripted model steps × (10 in, 5 out).
      { model: "test-model", inputTokens: 20, outputTokens: 10 },
    );

    const [toolRow] = [...prisma.toolCalls.values()];
    expect(toolRow).toMatchObject({
      workspaceId: "workspace-1",
      sessionId: "session-1",
      jobId: "job-turn",
      toolName: "search_legal_sources",
      input: { query: "Zakon o radu godišnji odmor" },
      status: "COMPLETED",
      output: expect.objectContaining({ count: 1 }),
      durationMs: expect.any(Number),
      finishedAt: expect.any(Date),
    });
    const toolEvents = emitted.filter((event) =>
      event.type.startsWith("tool."),
    );
    expect(toolEvents.map((event) => event.type)).toEqual([
      "tool.started",
      "tool.finished",
    ]);
    expect(toolEvents[1].toolCall).toMatchObject({
      jobId: "job-turn",
      correlationId: "corr-1",
      toolName: "search_legal_sources",
      status: "COMPLETED",
      label: "Zakon o radu godišnji odmor",
      resultCount: 1,
    });
    expect(
      emitted.findIndex((event) => event.type === "tool.finished"),
    ).toBeLessThan(
      emitted.findIndex((event) => event.type === "message.delta"),
    );
  });

  it("records a failing tool call without failing the turn", async () => {
    const { prisma, emitted, legalKnowledge, runner, job } = setup([
      {
        toolCalls: [
          { toolName: "search_legal_sources", input: { query: "odmor" } },
        ],
      },
      { text: "Baza trenutno nije dostupna, odgovor je opšti." },
    ]);
    legalKnowledge.search.mockRejectedValue(new Error("pgvector down"));

    await runner.run(turnInput, payload, job);

    const [toolRow] = [...prisma.toolCalls.values()];
    expect(toolRow).toMatchObject({
      status: "FAILED",
      errorMessage: expect.stringContaining("pgvector down"),
    });
    expect(
      emitted.find((event) => event.type === "tool.finished")?.toolCall,
    ).toMatchObject({ status: "FAILED", resultCount: null });
    expect(job.transition).toHaveBeenCalledWith(
      "COMPLETED",
      expect.anything(),
      null,
      expect.anything(),
    );
  });

  it("refreshes the conversation summary after a completed turn only", async () => {
    const summaries = { refresh: jest.fn().mockResolvedValue(true) };
    const done = setup([{ text: "Odgovor." }], undefined, summaries);
    await done.runner.run(turnInput, payload, done.job);
    expect(summaries.refresh).toHaveBeenCalledWith("workspace-1", "session-1");

    const failedSummaries = { refresh: jest.fn() };
    const failed = setup([{ text: "" }], undefined, failedSummaries);
    await failed.runner.run(turnInput, payload, failed.job);
    expect(failedSummaries.refresh).not.toHaveBeenCalled();
  });

  it("does not store citations the answer never used", async () => {
    const { prisma, runner, job } = setup([
      {
        toolCalls: [
          { toolName: "search_legal_sources", input: { query: "odmor" } },
        ],
      },
      { text: "Opšti odgovor bez pozivanja na izvor." },
    ]);

    await runner.run(turnInput, payload, job);

    expect(prisma.chatMessage.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ metadata: { outcome: "ANSWER" } }),
      }),
    );
  });

  it("marks the message and job failed when the agent produces no answer", async () => {
    const { prisma, emitted, runner, job } = setup([{ text: "" }]);

    await runner.run(turnInput, payload, job);

    expect(prisma.chatMessage.update).toHaveBeenLastCalledWith({
      where: { id: "message-answer" },
      data: { content: "", status: "FAILED" },
    });
    expect(job.transition).toHaveBeenCalledWith(
      "FAILED",
      expect.objectContaining({ messageId: "message-answer" }),
      "AGENT_TURN_FAILED",
      expect.objectContaining({ model: "test-model" }),
    );
    expect(emitted.at(-1)).toMatchObject({ type: "error" });
  });

  it("marks a drafting turn DRAFT_READY with the draft id and passes the turn scope", async () => {
    const drafting = {
      draftDocument: jest.fn().mockResolvedValue({
        status: "DRAFT_READY",
        draftId: "draft-9",
        documentType: "Tužba",
        version: 1,
        approvalStatus: "READY_FOR_SIGNOFF",
        missingFields: ["defendant.address"],
        warnings: [],
        citationCount: 2,
        excerpt: "TUŽBA",
      }),
    };
    const { prisma, emitted, runner, job } = setup(
      [
        {
          toolCalls: [
            { toolName: "draft_document", input: { documentType: "LAWSUIT" } },
          ],
        },
        { text: "Nacrt je spreman za pregled. Nedostaje adresa tuženog." },
      ],
      drafting,
    );

    await runner.run({ ...turnInput, intent: "DRAFT" }, payload, job);

    expect(drafting.draftDocument).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-1",
        sessionId: "session-1",
        jobId: "job-turn",
        correlationId: "corr-1",
        messageId: "message-user",
        language: "sr",
        userId: null,
        userDisplayName: null,
      },
      { documentType: "LAWSUIT", note: undefined, documentRefs: undefined },
    );
    expect(prisma.chatMessage.update).toHaveBeenLastCalledWith({
      where: { id: "message-answer" },
      data: expect.objectContaining({
        status: "COMPLETED",
        metadata: { outcome: "DRAFT_READY", draftId: "draft-9" },
      }),
    });
    expect(
      emitted.find((event) => event.type === "tool.finished")?.toolCall,
    ).toMatchObject({ toolName: "draft_document", status: "COMPLETED" });
  });

  it("leaves the run waiting for confirmation when the agent proposed an action", async () => {
    const actions = {
      propose: jest.fn().mockResolvedValue({
        status: "CONFIRMATION_REQUIRED",
        pendingActionId: "action-1",
        summary: "Novi rok: Odgovor na tužbu — 15.10.2026.",
        details: [],
      }),
    };
    const prisma = prismaMock();
    const events = new ChatEventBus();
    const { model, prompts } = createScriptedModel([
      {
        toolCalls: [
          {
            toolName: "create_deadline",
            input: { title: "Odgovor na tužbu", dueDate: "2026-10-15" },
          },
        ],
      },
      { text: "Predložio sam rok; potvrdite ga u kartici ispod." },
    ]);
    const runner = new AgentTurnRunner(
      prisma as never,
      events,
      Object.assign(new ChatRuntimeConfig(), { assistantModel: "test-model" }),
      contextBuilderMock() as never,
      new AssistantToolsAdapter(
        legalKnowledgeMock() as never,
        undefined,
        undefined,
        actions as never,
      ),
      model as never,
    );
    const job = { transition: jest.fn().mockResolvedValue(undefined) };

    await runner.run(turnInput, payload, job);

    expect(actions.propose).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "job-turn", messageId: "message-user" }),
      expect.objectContaining({
        type: "create_deadline",
        dueDate: "2026-10-15",
      }),
    );
    expect(JSON.stringify(prompts[0])).toMatch(/Today is \d{4}-\d{2}-\d{2}/);
    expect(job.transition).toHaveBeenCalledWith(
      "WAITING_CONFIRMATION",
      expect.objectContaining({ pendingActionIds: ["action-1"] }),
      null,
      expect.anything(),
    );
    expect(prisma.chatMessage.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: { outcome: "ANSWER", pendingActionIds: ["action-1"] },
        }),
      }),
    );
  });

  it("resumes with the user's decisions as the latest turn", async () => {
    const { prisma, contextBuilder, prompts, runner, job } = setup([
      { text: "Rok je upisan." },
    ]);
    prisma.pendingAction.findMany.mockResolvedValue([
      {
        id: "action-1",
        jobId: "job-turn",
        correlationId: "corr-1",
        actionType: "create_deadline",
        summary: "Novi rok: Odgovor na tužbu — 15.10.2026.",
        details: [],
        status: "APPROVED",
        result: { message: "Rok „Odgovor na tužbu“ je kreiran za 15.10.2026." },
        errorMessage: null,
        declineReason: null,
        expiresAt: now,
        decidedAt: now,
        createdAt: now,
      },
    ]);

    await runner.run(
      { ...turnInput, resumeActionIds: ["action-1"] },
      { ...payload, jobId: "job-resume" },
      job,
    );

    expect(contextBuilder.build).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: undefined }),
    );
    expect(prisma.pendingAction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["action-1"] }, workspaceId: "workspace-1" },
      }),
    );
    const prompt = JSON.stringify(prompts[0]);
    expect(prompt).toContain("[Potvrda]");
    expect(prompt).toContain("Odobreno i izvršeno: Novi rok: Odgovor na tužbu");
    expect(job.transition).toHaveBeenCalledWith(
      "COMPLETED",
      expect.anything(),
      null,
      expect.anything(),
    );
  });

  it("fails fast without input", async () => {
    const { prisma, runner, job } = setup([{ text: "x" }]);

    await runner.run(null, payload, job);

    expect(job.transition).toHaveBeenCalledWith(
      "FAILED",
      undefined,
      "AGENT_TURN_INPUT_MISSING",
    );
    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
  });
});

class RecordingProvider implements ChatModelProvider {
  readonly requests: CompleteStructuredRequest<unknown>[] = [];

  constructor(private readonly output: unknown) {}

  async completeStructured<T>(
    request: CompleteStructuredRequest<T>,
  ): Promise<T> {
    this.requests.push(request as CompleteStructuredRequest<unknown>);
    return request.schema.parse(this.output);
  }

  async *streamText(): AsyncIterable<string> {
    yield "";
  }
}

function workflowPrismaMock() {
  const jobs = new Map<string, Record<string, unknown>>();
  return {
    jobs,
    workflowJob: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(jobs.get(where.id) ?? null),
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const updated = { ...jobs.get(where.id), ...data, updatedAt: now };
          jobs.set(where.id, updated);
          return Promise.resolve(updated);
        },
      ),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const record = {
          id: `job-${jobs.size + 1}`,
          createdAt: now,
          updatedAt: now,
          errorCode: null,
          output: null,
          ...data,
        };
        jobs.set(record.id, record);
        return Promise.resolve(record);
      }),
    },
    chatMessage: { create: jest.fn() },
  };
}

describe("WorkflowRunner routing to the agent", () => {
  function mastraConfig(): ChatRuntimeConfig {
    return new ChatRuntimeConfig();
  }

  it("gives Portir the conversation and routes a legal question to agent-turn", async () => {
    const prisma = workflowPrismaMock();
    prisma.jobs.set("job-triage", {
      id: "job-triage",
      workspaceId: "workspace-1",
      sessionId: "session-1",
      workflowName: "triage",
      status: "QUEUED",
      correlationId: "corr-1",
      createdAt: now,
      updatedAt: now,
      input: { actorId: "user-1", content: "A kraće?", attachments: [] },
    });
    const provider = new RecordingProvider({
      decision: "LEGAL",
      reason: "Follow-up to a legal answer",
      intent: "ANSWER",
      language: "sr",
    });
    const contextBuilder = contextBuilderMock();
    const enqueue = jest.fn().mockResolvedValue(undefined);
    const runner = new WorkflowRunner(
      prisma as never,
      new ChatEventBus(),
      mastraConfig(),
      provider,
      { enqueue },
      contextBuilder as never,
      { run: jest.fn() } as never,
    );

    await runner.run("triage", { ...payload, jobId: "job-triage" });

    expect(contextBuilder.triageHistory).toHaveBeenCalledWith(
      "session-1",
      "message-user",
    );
    expect(provider.requests[0].messages[1].content).toContain(
      "Assistant: Najmanje 20 radnih dana.",
    );
    expect(provider.requests[0].messages[0].content).toContain(
      "manage the office's matters",
    );
    expect(prisma.workflowJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workflowName: "agent-turn",
        input: expect.objectContaining({
          messageId: "message-user",
          language: "sr",
        }),
      }),
    });
    expect(enqueue).toHaveBeenCalledWith(
      "agent-turn",
      expect.any(String),
      expect.objectContaining({ correlationId: "corr-1" }),
    );
  });

  it("sends drafting requests to the agent instead of the brief-extraction chain", async () => {
    const prisma = workflowPrismaMock();
    prisma.jobs.set("job-triage", {
      id: "job-triage",
      workspaceId: "workspace-1",
      sessionId: "session-1",
      workflowName: "triage",
      status: "QUEUED",
      correlationId: "corr-1",
      createdAt: now,
      updatedAt: now,
      input: { actorId: "user-1", content: "Pripremi tužbu.", attachments: [] },
    });
    const enqueue = jest.fn().mockResolvedValue(undefined);
    const runner = new WorkflowRunner(
      prisma as never,
      new ChatEventBus(),
      mastraConfig(),
      new RecordingProvider({
        decision: "LEGAL",
        reason: "Lawsuit request",
        intent: "DRAFT",
        language: "sr",
      }),
      { enqueue },
      contextBuilderMock() as never,
      { run: jest.fn() } as never,
    );

    await runner.run("triage", { ...payload, jobId: "job-triage" });

    expect(enqueue.mock.calls.map(([name]) => name)).toEqual(["agent-turn"]);
    expect(prisma.workflowJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workflowName: "agent-turn",
        input: expect.objectContaining({ intent: "DRAFT" }),
      }),
    });
  });

  it("delegates agent-turn jobs and records their status through WorkflowRunner", async () => {
    const prisma = workflowPrismaMock();
    prisma.jobs.set("job-turn", {
      id: "job-turn",
      workspaceId: "workspace-1",
      sessionId: "session-1",
      workflowName: "agent-turn",
      status: "QUEUED",
      correlationId: "corr-1",
      createdAt: now,
      updatedAt: now,
      input: turnInput,
    });
    const agentTurn = {
      run: jest.fn(async (_input, _payload, job) => {
        await job.transition("COMPLETED", {
          progressStage: "PREPARING_ANSWER",
        });
      }),
    };
    const runner = new WorkflowRunner(
      prisma as never,
      new ChatEventBus(),
      mastraConfig(),
      undefined,
      { enqueue: jest.fn() },
      contextBuilderMock() as never,
      agentTurn as never,
    );

    await runner.run("agent-turn", payload);

    expect(agentTurn.run).toHaveBeenCalledWith(
      turnInput,
      payload,
      expect.any(Object),
    );
    expect(prisma.jobs.get("job-turn")).toMatchObject({
      status: "COMPLETED",
      output: { progressStage: "PREPARING_ANSWER" },
      startedAt: expect.any(Date),
      finishedAt: expect.any(Date),
    });
  });
});
