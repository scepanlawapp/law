import type { ChatStreamEvent } from "@law/api-interfaces";
import { FakeChatModelProvider } from "@law/llm";
import type { AssistantTurnScope } from "@law/mastra";
import {
  AssistantCaseTimelineService,
  ChatEventBus,
  ChatRuntimeConfig,
} from "@law/chat";

const scope: AssistantTurnScope = {
  workspaceId: "workspace-1",
  sessionId: "session-1",
  jobId: "job-turn",
  correlationId: "corr-1",
  messageId: "message-1",
  language: "sr",
  userId: "user-1",
  userDisplayName: "Ana Advokat",
};

const PRESUDA =
  "PRESUDA. Dana 15.03.2026. godine sud je odbio tužbeni zahtev tužioca.";

function setup(options: {
  documents?: unknown[];
  skipped?: unknown[];
  caseId?: string | null;
  outputs?: unknown[];
}) {
  const created: Array<Record<string, unknown>> = [];
  const prisma = {
    documentAnalysis: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: "analysis-1",
          createdAt: new Date("2026-10-07T09:00:00.000Z"),
          ...data,
        };
        created.push(row);
        return Promise.resolve(row);
      }),
    },
  };
  const events = new ChatEventBus();
  const emitted: ChatStreamEvent[] = [];
  events.stream("session-1").subscribe((event) => emitted.push(event));
  const caseId = options.caseId === undefined ? "case-1" : options.caseId;
  const documentReads = {
    documentsForTimeline: jest.fn().mockResolvedValue({
      caseId,
      caseNumber: caseId ? "P-1/2026" : null,
      documents: options.documents ?? [
        {
          ref: "doc:presuda",
          title: "Presuda",
          status: "COMPLETED",
          text: PRESUDA,
        },
      ],
      skipped: options.skipped ?? [],
    }),
  };
  const provider = new FakeChatModelProvider(
    options.outputs ?? [
      {
        documentSummary: "Prvostepena presuda.",
        events: [
          {
            title: "Odbijen tužbeni zahtev",
            kind: "DECISION",
            date: "2026-03-15",
            quote: "sud je odbio tužbeni zahtev",
          },
          { title: "Bez datuma", kind: "OTHER" },
        ],
      },
      {
        summary: "Tužbeni zahtev je odbijen.",
        openQuestions: ["Datum dostavljanja presude?"],
        warnings: [],
      },
    ],
  );
  const service = new AssistantCaseTimelineService(
    prisma as never,
    events,
    new ChatRuntimeConfig(),
    documentReads as never,
    provider,
  );
  return { service, prisma, created, emitted, documentReads };
}

describe("AssistantCaseTimelineService", () => {
  it("builds the timeline, stores it on the case, and announces it", async () => {
    const { service, created, emitted, documentReads } = setup({
      skipped: [{ ref: "doc:21", title: "Prilog 21" }],
    });

    const result = await service.summarizeCaseDocuments(scope, {
      focus: "рокови",
    });

    expect(documentReads.documentsForTimeline).toHaveBeenCalledWith(scope, {
      refs: undefined,
      limit: 20,
    });
    expect(created[0]).toMatchObject({
      workspaceId: "workspace-1",
      sessionId: "session-1",
      caseId: "case-1",
      jobId: "job-turn",
      kind: "CASE_TIMELINE",
      documentRef: "case:case-1",
      documentTitle: "Predmet P-1/2026",
      contractType: null,
      truncated: true,
    });
    expect(emitted.at(-1)).toMatchObject({
      type: "analysis.updated",
      analysis: { kind: "CASE_TIMELINE", id: "analysis-1" },
    });
    expect(result).toEqual({
      status: "TIMELINE_READY",
      analysisId: "analysis-1",
      case: "P-1/2026",
      documentCount: 2,
      eventCount: 2,
      firstDate: "2026-03-15",
      lastDate: "2026-03-15",
      summary: "Tužbeni zahtev je odbijen.",
      openQuestions: ["Datum dostavljanja presude?"],
      notRead: ["Prilog 21"],
    });
  });

  it("uses the session as the subject without a case", async () => {
    const { service, created } = setup({ caseId: null });

    await service.summarizeCaseDocuments(scope, {});

    expect(created[0]).toMatchObject({
      caseId: null,
      documentRef: "session:session-1",
      documentTitle: "Dokumenti razgovora",
    });
  });

  it("reports when there are no documents", async () => {
    const { service, prisma } = setup({ documents: [] });

    await expect(
      service.summarizeCaseDocuments(scope, {}),
    ).resolves.toMatchObject({ status: "NO_DOCUMENTS" });
    expect(prisma.documentAnalysis.create).not.toHaveBeenCalled();
  });

  it("returns FAILED and stores nothing when every document fails", async () => {
    const { service, prisma } = setup({ outputs: [{ events: 3 }] });

    await expect(
      service.summarizeCaseDocuments(scope, {}),
    ).resolves.toMatchObject({ status: "FAILED" });
    expect(prisma.documentAnalysis.create).not.toHaveBeenCalled();
  });
});
