import type { ChatStreamEvent } from "@law/api-interfaces";
import { FakeChatModelProvider } from "@law/llm";
import type { AssistantTurnScope } from "@law/mastra";
import {
  AssistantDraftingService,
  ChatEventBus,
  ChatRuntimeConfig,
} from "@law/chat";

const t0 = new Date("2026-09-27T10:00:00.000Z");
const at = (minute: number) => new Date(t0.getTime() + minute * 60_000);

const scope: AssistantTurnScope = {
  workspaceId: "workspace-1",
  sessionId: "session-1",
  jobId: "job-turn",
  correlationId: "corr-1",
  messageId: "message-2",
  language: "sr",
  userId: null,
  userDisplayName: null,
};

// Model output (legacy string evidence and missing fields are still accepted).
const lawsuitBrief = {
  parties: [
    {
      role: "plaintiff",
      name: "Petar Petrović",
      address: "Knez Mihailova 1, Beograd",
      idNumber: null,
    },
    { role: "defendant", name: "Alfa d.o.o.", address: null, idNumber: null },
  ],
  fields: [
    { key: "claimValue", value: "150.000 RSD" },
    { key: "reliefSought", value: "Isplata zarade." },
  ],
  legalBasis: ["Zakon o radu čl. 104"],
  factualDescription: "Poslodavac nije isplatio zaradu.",
  evidence: ["ugovor.txt"],
  missingFields: ["defendant.address", "competentCourt"],
  confidence: 0.8,
  warnings: [],
};

const draftOutput = {
  documentText: "TUŽBA\n\nTužilac Petar Petrović … [1]",
  warnings: ["Nedostaje adresa tuženog."],
  usedCitations: [1],
};

function attachment(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    workspaceId: "workspace-1",
    sessionId: "session-1",
    originalName: `${id}.txt`,
    storedName: `${id}.bin`,
    mimeType: "text/plain",
    sizeBytes: 100,
    createdAt: at(1),
    extractionStatus: "PENDING",
    extractedText: null,
    sourceScript: null,
    ...overrides,
  };
}

function prismaMock() {
  const jobs = new Map<string, Record<string, unknown>>();
  const drafts = new Map<string, Record<string, unknown>>();
  const briefs = new Map<string, Record<string, unknown>>();
  const attachmentUpdates: Array<Record<string, unknown>> = [];
  return {
    jobs,
    drafts,
    briefs,
    attachmentUpdates,
    chatMessage: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: "message-announce",
          triageDecision: null,
          createdAt: at(20),
          ...data,
        }),
      ),
      findFirst: jest.fn().mockResolvedValue({ createdAt: at(5) }),
      findMany: jest.fn().mockResolvedValue([
        {
          content: "Здраво, треба ми тужба против послодавца Alfa d.o.o.",
          attachments: [
            attachment("ugovor", {
              extractionStatus: "COMPLETED",
              extractedText: "Ugovor o radu, zarada 50.000 RSD.",
            }),
          ],
        },
        {
          content: "(attachment)",
          attachments: [attachment("platni-listic")],
        },
      ]),
    },
    chatAttachment: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        attachmentUpdates.push(data);
        return Promise.resolve(data);
      }),
    },
    workflowJob: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `job-${jobs.size + 1}`,
          createdAt: t0,
          updatedAt: t0,
          errorCode: null,
          ...data,
        };
        jobs.set(row.id, row);
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
          const row = { ...jobs.get(where.id), ...data, updatedAt: t0 };
          jobs.set(where.id, row);
          return Promise.resolve(row);
        },
      ),
    },
    briefExtractionResult: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `brief-${briefs.size + 1}`, ...data };
        briefs.set(row.id, row);
        return Promise.resolve(row);
      }),
      findFirst: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(briefs.get(where.id) ?? null),
      ),
    },
    draftResult: {
      create: jest.fn(
        ({
          data,
        }: {
          data: Record<string, unknown> & { citations?: { create: unknown[] } };
        }) => {
          const { citations, ...rest } = data;
          const row = {
            id: `draft-${drafts.size + 1}`,
            finalDocumentText: null,
            approvalStatus: "READY_FOR_SIGNOFF",
            reviewedByUserId: null,
            reviewedAt: null,
            reviewNote: null,
            errorCode: null,
            createdAt: at(10 + drafts.size),
            updatedAt: at(10 + drafts.size),
            ...rest,
            citations: (citations?.create ?? []).map((citation, index) => ({
              id: `citation-${index}`,
              ...(citation as object),
            })),
          };
          drafts.set(row.id, row);
          return Promise.resolve(row);
        },
      ),
      findFirst: jest.fn(({ where }: { where: { id?: string } }) => {
        const rows = [...drafts.values()];
        return Promise.resolve(
          where.id ? (drafts.get(where.id) ?? null) : (rows.at(-1) ?? null),
        );
      }),
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(drafts.get(where.id) ?? null),
      ),
      findMany: jest.fn(() => Promise.resolve([...drafts.values()])),
    },
    draftCitation: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

function setup(
  providerOutputs: unknown[],
  documentReads?: { documentsByRef: jest.Mock },
  content?: { ensureText: jest.Mock },
) {
  const prisma = prismaMock();
  const events = new ChatEventBus();
  const emitted: ChatStreamEvent[] = [];
  events.stream("session-1").subscribe((event) => emitted.push(event));
  const storage = {
    save: jest.fn(),
    read: jest
      .fn()
      .mockResolvedValue(
        Buffer.from("Platni listić: neisplaćeno 150.000 RSD."),
      ),
  };
  const matterLink = {
    sessionCaseId: jest.fn().mockResolvedValue("case-1"),
    caseContextBlock: jest
      .fn()
      .mockResolvedValue("Povezani predmet:\nBroj: 2026-21"),
  };
  const provider = new FakeChatModelProvider(providerOutputs);
  const completeStructured = jest.spyOn(provider, "completeStructured");
  const legalKnowledge = {
    search: jest.fn().mockResolvedValue([
      {
        id: "chunk-104",
        text: "Zaposleni ima pravo na zaradu.",
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
      },
    ]),
  };
  const service = new AssistantDraftingService(
    prisma as never,
    events,
    storage as never,
    new ChatRuntimeConfig(),
    matterLink as never,
    provider,
    legalKnowledge as never,
    documentReads as never,
    content as never,
  );
  return {
    service,
    prisma,
    emitted,
    storage,
    completeStructured,
    legalKnowledge,
  };
}

describe("AssistantDraftingService.draftDocument", () => {
  it("drafts from the conversation and persists brief and draft through child jobs", async () => {
    const {
      service,
      prisma,
      emitted,
      storage,
      completeStructured,
      legalKnowledge,
    } = setup([lawsuitBrief, draftOutput]);

    const result = await service.draftDocument(scope, {
      documentType: "LAWSUIT",
      note: "Tužba je za tri meseca.",
    });

    expect(result).toMatchObject({
      status: "DRAFT_READY",
      draftId: "draft-1",
      documentType: "Tužba",
      version: 1,
      missingFields: ["Adresa tuženog", "Nadležni sud"],
      citationCount: 1,
    });
    // Conversation facts in Latin, attachment reuse, and extraction of the pending one.
    const briefPrompt = completeStructured.mock.calls[0][0].messages[1].content;
    expect(briefPrompt).toContain(
      "Zdravo, treba mi tužba protiv poslodavca Alfa d.o.o.",
    );
    expect(briefPrompt).toContain(
      "Napomena iz razgovora: Tužba je za tri meseca.",
    );
    expect(briefPrompt).toContain("Ugovor o radu, zarada 50.000 RSD.");
    expect(briefPrompt).toContain("Platni listić: neisplaćeno 150.000 RSD.");
    expect(storage.read).toHaveBeenCalledTimes(1);
    expect(prisma.attachmentUpdates.at(-1)).toMatchObject({
      extractionStatus: "COMPLETED",
    });
    expect(legalKnowledge.search).toHaveBeenCalledWith(
      "Zakon o radu čl. 104",
      expect.any(Number),
      "workspace-1",
    );

    const [briefJob, draftJob] = [...prisma.jobs.values()];
    expect(briefJob).toMatchObject({
      workflowName: "brief-extraction",
      correlationId: "corr-1",
      status: "COMPLETED",
      output: expect.objectContaining({ briefResultId: "brief-1" }),
    });
    expect(draftJob).toMatchObject({
      workflowName: "drafting",
      correlationId: "corr-1",
      status: "COMPLETED",
      input: {
        briefResultId: "brief-1",
        messageId: "message-2",
        language: "sr",
      },
    });
    expect(briefJob["input"]).toMatchObject({ documentType: "LAWSUIT" });
    expect(prisma.briefs.get("brief-1")).toMatchObject({
      jobId: briefJob["id"],
      documentType: "LAWSUIT",
    });
    expect(prisma.drafts.get("draft-1")).toMatchObject({
      jobId: draftJob["id"],
      documentType: "LAWSUIT",
      caseId: "case-1",
      briefResultId: "brief-1",
      previousDraftId: null,
      citations: [expect.objectContaining({ marker: 1, chunkId: "chunk-104" })],
    });
    expect(emitted.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "job.queued",
        "attachment.updated",
        "draft.updated",
      ]),
    );
    const briefDone = emitted.findIndex(
      (event) =>
        event.type === "job.updated" &&
        event.job?.workflowName === "brief-extraction" &&
        event.job.status === "COMPLETED" &&
        event.job.briefResultId === "brief-1",
    );
    expect(briefDone).toBeGreaterThan(-1);
    expect(briefDone).toBeLessThan(
      emitted.findIndex((event) => event.type === "draft.updated"),
    );
  });

  it("reports missing context without calling the model", async () => {
    const { service, prisma, completeStructured } = setup([lawsuitBrief]);
    prisma.chatMessage.findMany.mockResolvedValue([
      { content: "(attachment)", attachments: [] },
    ]);

    await expect(
      service.draftDocument(scope, { documentType: "LAWSUIT" }),
    ).resolves.toMatchObject({
      status: "NO_CONTEXT",
    });
    expect(completeStructured).not.toHaveBeenCalled();
  });

  it("rejects an unknown document type without creating jobs", async () => {
    const { service, prisma, completeStructured } = setup([lawsuitBrief]);

    await expect(
      service.draftDocument(scope, { documentType: "POEM" as never }),
    ).resolves.toMatchObject({ status: "FAILED" });
    expect(prisma.workflowJob.create).not.toHaveBeenCalled();
    expect(completeStructured).not.toHaveBeenCalled();
  });

  it("drafts an appeal from a named filed document", async () => {
    const documentReads = {
      documentsByRef: jest.fn().mockResolvedValue([
        {
          id: "doc:presuda-1",
          name: "Presuda P 12/2026",
          mimeType: "presuda.pdf",
          status: "COMPLETED",
          text: "PRESUDA: odbija se tužbeni zahtev tužioca.",
        },
      ]),
    };
    const { service, prisma, completeStructured } = setup(
      [
        {
          ...lawsuitBrief,
          parties: [
            {
              role: "appellant",
              name: "Petar Petrović",
              address: null,
              idNumber: null,
            },
            {
              role: "opponent",
              name: "Alfa d.o.o.",
              address: null,
              idNumber: null,
            },
          ],
          fields: [{ key: "contestedDecision", value: "Presuda P 12/2026" }],
          missingFields: [
            { key: "serviceDate", label: "Datum prijema presude" },
          ],
        },
        { ...draftOutput, documentText: "ŽALBA" },
      ],
      documentReads,
    );

    const result = await service.draftDocument(scope, {
      documentType: "APPEAL",
      documentRefs: ["doc:presuda-1"],
    });

    expect(result).toMatchObject({
      status: "DRAFT_READY",
      documentType: "Žalba",
      missingFields: ["Datum prijema presude"],
    });
    expect(documentReads.documentsByRef).toHaveBeenCalledWith(scope, [
      "doc:presuda-1",
    ]);
    const [briefCall, draftCall] = completeStructured.mock.calls;
    expect(briefCall[0].messages[0].content).toContain("„Žalba”");
    expect(briefCall[0].messages[1].content).toContain(
      "Presuda P 12/2026 (presuda.pdf):\nPRESUDA: odbija se tužbeni zahtev tužioca.",
    );
    expect(draftCall[0].messages[0].content).toContain("žalbeni razlozi");
    expect(prisma.drafts.get("draft-1")).toMatchObject({
      documentType: "APPEAL",
    });
    expect(prisma.briefs.get("brief-1")).toMatchObject({
      documentType: "APPEAL",
      brief: expect.objectContaining({
        documentType: "APPEAL",
        parties: [
          expect.objectContaining({
            role: "appellant",
            name: "Petar Petrović",
          }),
          expect.objectContaining({ role: "opponent", name: "Alfa d.o.o." }),
        ],
      }),
    });
  });

  it("fails the open job and returns FAILED when the model output is invalid", async () => {
    const { service, prisma } = setup([lawsuitBrief, { warnings: [] }]);

    await expect(
      service.draftDocument(scope, { documentType: "LAWSUIT" }),
    ).resolves.toMatchObject({
      status: "FAILED",
    });
    const draftJob = [...prisma.jobs.values()].find(
      (job) => job["workflowName"] === "drafting",
    );
    expect(draftJob).toMatchObject({
      status: "FAILED",
      errorCode: "DRAFTING_LLM_FAILED",
    });
  });
});

describe("AssistantDraftingService revisions and reads", () => {
  it("revises the latest draft into a new linked version", async () => {
    const { service, prisma, completeStructured } = setup([
      lawsuitBrief,
      draftOutput,
      { ...draftOutput, documentText: "TUŽBA (kraća)", usedCitations: [] },
    ]);
    await service.draftDocument(scope, { documentType: "LAWSUIT" });

    const result = await service.reviseDraft(scope, {
      instruction: "Скрати образложење.",
    });

    expect(result).toMatchObject({
      status: "DRAFT_READY",
      draftId: "draft-2",
      version: 2,
    });
    expect(prisma.drafts.get("draft-2")).toMatchObject({
      previousDraftId: "draft-1",
      briefResultId: "brief-1",
      documentText: "TUŽBA (kraća)",
    });
    const revisionJob = [...prisma.jobs.values()].at(-1);
    expect(revisionJob).toMatchObject({
      workflowName: "drafting",
      status: "COMPLETED",
      input: expect.objectContaining({
        previousDraftId: "draft-1",
        reviewerNote: "Skrati obrazloženje.",
      }),
    });
    const revisionPrompt =
      completeStructured.mock.calls[2][0].messages[1].content;
    expect(revisionPrompt).toContain("Skrati obrazloženje.");
    expect(revisionPrompt).toContain("TUŽBA\n\nTužilac Petar Petrović");
  });

  it("returns NOT_FOUND when there is no draft to revise", async () => {
    const { service } = setup([]);

    await expect(
      service.reviseDraft(scope, { instruction: "Skrati." }),
    ).resolves.toMatchObject({ status: "NOT_FOUND" });
  });

  it("lists drafts with versions and renders the workspace state", async () => {
    const { service } = setup([lawsuitBrief, draftOutput, draftOutput]);
    await service.draftDocument(scope, { documentType: "LAWSUIT" });
    await service.reviseDraft(scope, { instruction: "Dodaj troškove." });

    await expect(service.listDrafts(scope)).resolves.toEqual({
      drafts: [
        expect.objectContaining({
          draftId: "draft-1",
          version: 1,
          title: "TUŽBA",
        }),
        expect.objectContaining({
          draftId: "draft-2",
          version: 2,
          title: "TUŽBA",
        }),
      ],
    });
    const state = await service.workspaceState("workspace-1", "session-1");
    expect(state).toContain("Nacrti u ovom razgovoru");
    expect(state).toContain(
      "id draft-2, v2, status READY_FOR_SIGNOFF: „TUŽBA“",
    );
  });

  it("reads a draft with its text and approval status", async () => {
    const { service } = setup([lawsuitBrief, draftOutput]);
    await service.draftDocument(scope, { documentType: "LAWSUIT" });

    await expect(service.getDraft(scope, {})).resolves.toMatchObject({
      status: "FOUND",
      draftId: "draft-1",
      version: 1,
      approvalStatus: "READY_FOR_SIGNOFF",
      text: draftOutput.documentText,
      truncated: false,
    });
  });
});

describe("AssistantDraftingService queued jobs", () => {
  function queuedJob(
    id: string,
    workflowName: string,
    input: Record<string, unknown>,
  ) {
    return {
      id,
      workspaceId: "workspace-1",
      sessionId: "session-1",
      workflowName,
      status: "RUNNING",
      correlationId: "corr-review",
      input,
      output: null,
      errorCode: null,
      createdAt: t0,
      updatedAt: t0,
    };
  }

  it("runs a review-panel revision job into a new version and announces it", async () => {
    const { service, prisma, emitted, completeStructured } = setup([
      lawsuitBrief,
      draftOutput,
      { ...draftOutput, documentText: "TUŽBA (dopunjena)", usedCitations: [] },
    ]);
    await service.draftDocument(scope, { documentType: "LAWSUIT" });
    const job = queuedJob("job-review", "drafting", {
      briefResultId: "brief-1",
      previousDraftId: "draft-1",
      reviewerNote: "Додај трошкове поступка.",
      language: "sr",
    });
    prisma.jobs.set(job.id, job);

    await expect(service.runDraftingJob(job as never)).resolves.toMatchObject({
      status: "DRAFT_READY",
      draftId: "draft-2",
      version: 2,
    });

    expect(prisma.drafts.get("draft-2")).toMatchObject({
      jobId: "job-review",
      previousDraftId: "draft-1",
      documentText: "TUŽBA (dopunjena)",
    });
    expect(prisma.jobs.get("job-review")).toMatchObject({
      status: "COMPLETED",
    });
    const prompt = completeStructured.mock.calls[2][0].messages[1].content;
    expect(prompt).toContain("Dodaj troškove postupka.");
    expect(prompt).toContain("TUŽBA\n\nTužilac Petar Petrović");
    expect(prisma.chatMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        role: "ASSISTANT",
        content: "Nacrt je spreman za pregled.",
        correlationId: "corr-review",
        metadata: { outcome: "DRAFT_READY", draftId: "draft-2" },
      }),
    });
    expect(emitted.map((event) => event.type)).toContain("message.created");
  });

  it("fails a drafting job whose brief no longer exists", async () => {
    const { service, prisma, completeStructured } = setup([]);
    const job = queuedJob("job-orphan", "drafting", {
      briefResultId: "brief-missing",
    });
    prisma.jobs.set(job.id, job);

    await expect(service.runDraftingJob(job as never)).resolves.toMatchObject({
      status: "NOT_FOUND",
    });
    expect(prisma.jobs.get("job-orphan")).toMatchObject({
      status: "FAILED",
      errorCode: "DRAFTING_BRIEF_MISSING",
    });
    expect(completeStructured).not.toHaveBeenCalled();
    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
  });

  it("retries a brief-extraction job from its persisted input", async () => {
    const { service, prisma, completeStructured } = setup([
      lawsuitBrief,
      draftOutput,
    ]);
    prisma.chatAttachment.findMany.mockResolvedValue([
      attachment("ugovor", {
        extractionStatus: "COMPLETED",
        extractedText: "Ugovor o radu, zarada 50.000 RSD.",
      }),
    ]);
    const job = queuedJob("job-brief", "brief-extraction", {
      messageId: "message-2",
      userText: "Тужба против послодавца.",
      attachments: [{ id: "ugovor" }],
      language: "sr",
    });
    prisma.jobs.set(job.id, job);

    await expect(service.runBriefJob(job as never)).resolves.toMatchObject({
      status: "DRAFT_READY",
      draftId: "draft-1",
    });

    expect(prisma.chatAttachment.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["ugovor"] },
        workspaceId: "workspace-1",
        sessionId: "session-1",
      },
      include: {
        content: { select: { status: true } },
        document: { select: { aiAccess: true, archivedAt: true } },
      },
    });
    const prompt = completeStructured.mock.calls[0][0].messages[1].content;
    expect(prompt).toContain("Tužba protiv poslodavca.");
    expect(prompt).toContain("Ugovor o radu, zarada 50.000 RSD.");
    expect(prisma.jobs.get("job-brief")).toMatchObject({
      status: "COMPLETED",
      output: expect.objectContaining({ briefResultId: "brief-1" }),
    });
    expect(prisma.briefs.get("brief-1")).toMatchObject({ jobId: "job-brief" });
  });

  it("reads attachments that share content through DocumentContentService.ensureText", async () => {
    const content = {
      ensureText: jest.fn().mockResolvedValue({
        status: "COMPLETED",
        text: "Zakupni ugovor, zakupnina 400 EUR.",
      }),
    };
    const { service, prisma, storage, completeStructured } = setup(
      [lawsuitBrief, draftOutput],
      undefined,
      content,
    );
    prisma.chatAttachment.findMany.mockResolvedValue([
      attachment("zakup", { contentId: "content-7" }),
      attachment("legacy", {
        extractionStatus: "COMPLETED",
        extractedText: "Stari ugovor, 10 EUR.",
      }),
    ]);
    const job = queuedJob("job-brief-2", "brief-extraction", {
      messageId: "message-2",
      userText: "Tužba zbog zakupa.",
      attachments: [{ id: "zakup" }, { id: "legacy" }],
      language: "sr",
    });
    prisma.jobs.set(job.id, job);

    await service.runBriefJob(job as never);

    expect(content.ensureText).toHaveBeenCalledTimes(1);
    expect(content.ensureText).toHaveBeenCalledWith("workspace-1", "content-7");
    expect(storage.read).not.toHaveBeenCalled();
    const prompt = completeStructured.mock.calls[0][0].messages[1].content;
    expect(prompt).toContain("Zakupni ugovor, zakupnina 400 EUR.");
    expect(prompt).toContain("Stari ugovor, 10 EUR.");
    expect(prisma.attachmentUpdates).not.toContainEqual(
      expect.objectContaining({ extractedText: expect.anything() }),
    );
  });

  it("falls back to the column-based path for attachments without content", async () => {
    const content = { ensureText: jest.fn() };
    const { service, prisma, storage } = setup(
      [lawsuitBrief, draftOutput],
      undefined,
      content,
    );
    prisma.chatAttachment.findMany.mockResolvedValue([attachment("stari")]);
    const job = queuedJob("job-brief-3", "brief-extraction", {
      messageId: "message-2",
      userText: "Tužba.",
      attachments: [{ id: "stari" }],
      language: "sr",
    });
    prisma.jobs.set(job.id, job);

    await service.runBriefJob(job as never);

    expect(content.ensureText).not.toHaveBeenCalled();
    expect(storage.read).toHaveBeenCalledTimes(1);
  });

  it("never reads an attachment that was filed as a document with AI access off", async () => {
    const content = { ensureText: jest.fn() };
    const { service, prisma, storage, completeStructured } = setup(
      [lawsuitBrief, draftOutput],
      undefined,
      content,
    );
    prisma.chatAttachment.findMany.mockResolvedValue([
      attachment("tajni", {
        contentId: "content-8",
        documentId: "doc-8",
        extractionStatus: "COMPLETED",
        extractedText: "Poverljiv sadržaj ugovora.",
        document: { aiAccess: false, archivedAt: null },
      }),
      attachment("javni", {
        extractionStatus: "COMPLETED",
        extractedText: "Javni sadržaj priloga.",
        document: null,
      }),
    ]);
    const job = queuedJob("job-brief-off", "brief-extraction", {
      messageId: "message-2",
      userText: "Tužba.",
      attachments: [{ id: "tajni" }, { id: "javni" }],
      language: "sr",
    });
    prisma.jobs.set(job.id, job);

    await service.runBriefJob(job as never);

    expect(content.ensureText).not.toHaveBeenCalled();
    expect(storage.read).not.toHaveBeenCalled();
    const prompt = completeStructured.mock.calls[0][0].messages[1].content;
    expect(prompt).not.toContain("Poverljiv sadržaj");
    expect(prompt).toContain("Javni sadržaj priloga.");
  });
});
